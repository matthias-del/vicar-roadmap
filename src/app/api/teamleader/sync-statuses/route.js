// GET /api/teamleader/sync-statuses
//   [?dryRun=1]  → fetch V2 task/meeting statuses, diff against sheet,
//                  report what would change without firing the Zap
//   default      → same, but POST synthetic webhook events to the Zap
//                  (ZAPIER_WEBHOOK_URL env var) so it updates the sheet.
//
// Why this exists:
//   Teamleader Focus does NOT emit webhooks for V2/nextgen tasks or
//   meetings. We backfill V2 rows with the UUID in column K (teamleaderIds),
//   then this endpoint periodically reconciles.
//
// How it works:
//   1. Read the published sheet CSV to see every row's current status + UUID
//   2. Fetch every V2 task and meeting from Teamleader
//   3. For each UUID match, compare sheet status vs Teamleader status
//   4. For each mismatch, POST a synthetic event to the Zap's catch hook
//      matching the format the Zap's JS step already handles:
//        { type: "task.completed" | "task.reopened",
//          subject: { type: "task", id: "<uuid>" } }

import { NextResponse } from 'next/server';
import { getValidToken } from '@/lib/teamleaderAuth';
import { fetchSheetRows } from '@/lib/googleSheets';

const TL = 'https://api.focus.teamleader.eu';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function tlPost(endpoint, body, token, { retries = 4 } = {}) {
  let attempt = 0;
  while (true) {
    const res = await fetch(`${TL}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    if (res.status === 429 && attempt < retries) {
      const waits = [2000, 4000, 8000, 16000];
      await new Promise(r => setTimeout(r, waits[attempt]));
      attempt += 1;
      continue;
    }
    return { status: res.status, ok: res.ok, data };
  }
}

// Map Teamleader status to sheet status.
function tlStatusToSheet(s) {
  if (!s) return 'planned';
  if (s === 'done' || s === 'completed') return 'completed';
  if (s === 'in_progress' || s === 'started') return 'progress';
  return 'planned';
}

// Paginate projects-v2/tasks.list (size is honored here).
async function listAllV2Tasks(token, { maxPages = 200 } = {}) {
  const all = [];
  let page = 1;
  const size = 100;
  while (true) {
    const res = await tlPost('projects-v2/tasks.list', {
      page: { size, number: page },
      sort: [{ field: 'created_at', order: 'desc' }],
    }, token);
    if (!res.ok) {
      const err = new Error(`projects-v2/tasks.list failed (page ${page})`);
      err.detail = res.data; err.status = res.status; throw err;
    }
    const items = res.data?.data || [];
    all.push(...items);
    if (items.length < size) break;
    page += 1;
    if (page > maxPages) break;
  }
  return all;
}

// projects-v2/meetings.list ignores page size; one call returns all.
async function listAllV2Meetings(token) {
  const res = await tlPost('projects-v2/meetings.list', {
    page: { size: 1000, number: 1 },
    sort: [{ field: 'created_at', order: 'desc' }],
  }, token);
  if (!res.ok) {
    const err = new Error('projects-v2/meetings.list failed');
    err.detail = res.data; err.status = res.status; throw err;
  }
  return res.data?.data || [];
}

async function fireZap(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === '1';
  const zapUrl = searchParams.get('zapUrl') || process.env.ZAPIER_WEBHOOK_URL;

  if (!dryRun && !zapUrl) {
    return NextResponse.json(
      { error: 'Set ZAPIER_WEBHOOK_URL env var, pass ?zapUrl=..., or use ?dryRun=1' },
      { status: 400 },
    );
  }

  try {
    const token = await getValidToken();

    // 1. Sheet rows with UUIDs in column K.
    const rows = await fetchSheetRows();
    const sheetRows = rows
      .map(r => ({
        clientId: r.clientId,
        taskTitle: r.taskTitle,
        sheetStatus: r.status,
        teamleaderId: (r.teamleaderIds || '').trim(),
      }))
      .filter(r => UUID_RE.test(r.teamleaderId));

    if (!sheetRows.length) {
      return NextResponse.json({
        ok: true,
        note: 'No V2 UUIDs found in column K',
        sheetRows: rows.length,
      });
    }

    // 2. Fetch V2 tasks + meetings.
    const [tasks, meetings] = [
      await listAllV2Tasks(token),
      await listAllV2Meetings(token),
    ];

    // 3. Build UUID → current Teamleader status map.
    const tlStatusById = new Map();
    for (const t of tasks) tlStatusById.set(t.id, { kind: 'task', status: t.status });
    for (const m of meetings) tlStatusById.set(m.id, { kind: 'meeting', status: m.status });

    // 4. Diff sheet rows vs Teamleader.
    const changes = [];
    const missing = [];
    const unchanged = [];
    for (const row of sheetRows) {
      const tl = tlStatusById.get(row.teamleaderId);
      if (!tl) {
        missing.push(row.teamleaderId);
        continue;
      }
      const expected = tlStatusToSheet(tl.status);
      if (expected !== row.sheetStatus) {
        changes.push({
          teamleaderId: row.teamleaderId,
          taskTitle: row.taskTitle,
          clientId: row.clientId,
          sheetStatus: row.sheetStatus,
          tlRawStatus: tl.status,
          expected,
          kind: tl.kind,
        });
      } else {
        unchanged.push(row.teamleaderId);
      }
    }

    // 5. Fire Zap for each change (unless dry run).
    const fired = [];
    if (!dryRun) {
      for (const c of changes) {
        // Zap's JS handles both .completed and .reopened. No .reopened event
        // exists in Teamleader, but the Zap's code treats it as the reverse
        // of .completed and flips status to 'planned'.
        const eventType = c.expected === 'completed' ? 'task.completed' : 'task.reopened';
        const payload = {
          type: eventType,
          subject: { type: 'task', id: c.teamleaderId },
        };
        const res = await fireZap(zapUrl, payload);
        fired.push({ teamleaderId: c.teamleaderId, eventType, ok: res.ok, status: res.status });
        // Small pacing so we don't slam Zapier.
        await new Promise(r => setTimeout(r, 250));
      }
    }

    return NextResponse.json({
      dryRun,
      totalSheetRowsWithUuid: sheetRows.length,
      totalV2Tasks: tasks.length,
      totalV2Meetings: meetings.length,
      changeCount: changes.length,
      unchangedCount: unchanged.length,
      missingCount: missing.length,
      changes,
      missing: missing.slice(0, 20),
      fired: dryRun ? null : fired,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message, detail: err.detail || null, status: err.status || null },
      { status: 500 },
    );
  }
}
