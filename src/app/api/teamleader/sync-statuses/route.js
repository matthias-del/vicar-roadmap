// GET /api/teamleader/sync-statuses
//   [?dryRun=1]  → diff only, no Zap calls
//   default      → reconcile status changes + create missing rows
//
// Two Zap URLs needed:
//   ZAPIER_WEBHOOK_URL        → existing update-row Zap
//   ZAPIER_CREATE_WEBHOOK_URL → new create-row Zap
//
// What this does each run:
//   1. Read sheet (CSV) — collect UUIDs in col K + project IDs in col L
//   2. Fetch all V2 tasks + meetings from Teamleader
//   3. STATUS SYNC: for existing rows whose status drifted, POST synthetic
//      task.completed / task.reopened events to ZAPIER_WEBHOOK_URL
//   4. NEW ROWS: for tasks/meetings in a tracked project but missing from the
//      sheet, POST the full row payload to ZAPIER_CREATE_WEBHOOK_URL

import { NextResponse } from 'next/server';
import { getValidToken } from '@/lib/teamleaderAuth';
import { fetchSheetRows } from '@/lib/googleSheets';

const TL = 'https://api.focus.teamleader.eu';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE_SUFFIX = /\s+€[\d.,\s]+$/u;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function stripPrice(s) { return s ? s.replace(PRICE_SUFFIX, '').trim() : null; }
function slug(s) { return s ? s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null; }

function mapStatus(s) {
  if (!s) return 'planned';
  if (s === 'done' || s === 'completed') return 'completed';
  if (s === 'in_progress' || s === 'started') return 'progress';
  return 'planned';
}

function deriveDateFields(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return {
    startMonth: MONTHS[d.getUTCMonth()],
    startYear: d.getUTCFullYear(),
    weekInMonth: Math.min(5, Math.ceil(d.getUTCDate() / 7)),
  };
}

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

async function resolveGroupName(groupId, token, cache) {
  if (!groupId) return '';
  if (cache.has(groupId)) return cache.get(groupId);
  const res = await tlPost('projects-v2/projectGroups.info', { id: groupId }, token);
  const name = res.ok ? (res.data?.data?.title || res.data?.data?.name || '') : '';
  cache.set(groupId, name);
  return name;
}

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
  const createZapUrl = searchParams.get('createZapUrl') || process.env.ZAPIER_CREATE_WEBHOOK_URL;

  if (!dryRun && !zapUrl) {
    return NextResponse.json(
      { error: 'Set ZAPIER_WEBHOOK_URL env var or pass ?zapUrl=...' },
      { status: 400 },
    );
  }

  try {
    const token = await getValidToken();

    // 1. Read sheet rows.
    const rows = await fetchSheetRows();

    // UUIDs already in the sheet (col K).
    const sheetUuids = new Set(
      rows.map(r => (r.teamleaderIds || '').trim()).filter(id => UUID_RE.test(id))
    );

    // Project map: projectId → { clientId, clientName, projectTitle }
    // Only tracks projects that already have rows in the sheet (col L).
    const sheetProjectMap = new Map();
    for (const r of rows) {
      const pid = (r.projectId || '').trim();
      if (pid && !sheetProjectMap.has(pid)) {
        sheetProjectMap.set(pid, {
          clientId: r.clientId,
          clientName: r.clientName,
          projectTitle: r.projectTitle || '',
        });
      }
    }

    // For status sync: rows that have a UUID in col K.
    const sheetRowsWithUuid = rows
      .map(r => ({
        clientId: r.clientId,
        taskTitle: r.taskTitle,
        sheetStatus: r.status,
        teamleaderId: (r.teamleaderIds || '').trim(),
      }))
      .filter(r => UUID_RE.test(r.teamleaderId));

    // 2. Fetch V2 tasks + meetings.
    const allTasks = await listAllV2Tasks(token);
    const allMeetings = await listAllV2Meetings(token);

    // 3. Build UUID → { kind, status, item } map.
    const tlById = new Map();
    for (const t of allTasks) tlById.set(t.id, { kind: 'task', status: t.status, item: t });
    for (const m of allMeetings) tlById.set(m.id, { kind: 'meeting', status: m.status, item: m });

    // ── STATUS SYNC ──────────────────────────────────────────────────────────
    const changes = [];
    const unchanged = [];
    const missing = [];

    for (const row of sheetRowsWithUuid) {
      const tl = tlById.get(row.teamleaderId);
      if (!tl) { missing.push(row.teamleaderId); continue; }
      const expected = mapStatus(tl.status);
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

    const fired = [];
    if (!dryRun && zapUrl) {
      for (const c of changes) {
        const eventType = c.expected === 'completed' ? 'task.completed' : 'task.reopened';
        const res = await fireZap(zapUrl, {
          type: eventType,
          subject: { type: 'task', id: c.teamleaderId },
        });
        fired.push({ teamleaderId: c.teamleaderId, eventType, ok: res.ok, status: res.status });
        await new Promise(r => setTimeout(r, 250));
      }
    }

    // ── NEW ROW DETECTION ────────────────────────────────────────────────────
    // Tasks/meetings in a tracked project but not yet in the sheet.
    const groupCache = new Map();
    const newRows = [];

    for (const [uuid, { kind, item }] of tlById) {
      if (sheetUuids.has(uuid)) continue; // already in sheet
      const projectId = item.project?.id;
      if (!projectId || !sheetProjectMap.has(projectId)) continue; // untracked project

      const { clientId, clientName, projectTitle } = sheetProjectMap.get(projectId);
      const dateStr = item.end_date || item.start_date || item.date || null;
      const { startMonth, startYear, weekInMonth } = deriveDateFields(dateStr);
      const groupLabel = await resolveGroupName(item.group?.id, token, groupCache);
      const shortDate = dateStr ? dateStr.slice(5) : '';
      const isVisuals = /visual/i.test(groupLabel);
      const rawTitle = stripPrice(item.title || null);
      const taskTitle = kind === 'meeting'
        ? `${isVisuals ? 'Shoot' : 'Meeting'} ${shortDate}`.trim()
        : rawTitle;

      newRows.push({
        clientId,
        clientName,
        groupLabel,
        taskTitle,
        startMonth,
        startYear,
        weekInMonth,
        duration: 1,
        status: mapStatus(item.status),
        completionThreshold: '',
        teamleaderIds: uuid,
        projectId,
        projectTitle,
      });
    }

    const created = [];
    if (!dryRun && createZapUrl && newRows.length) {
      for (const row of newRows) {
        const res = await fireZap(createZapUrl, row);
        created.push({ taskTitle: row.taskTitle, clientId: row.clientId, ok: res.ok, status: res.status });
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return NextResponse.json({
      dryRun,
      totalSheetRowsWithUuid: sheetRowsWithUuid.length,
      totalV2Tasks: allTasks.length,
      totalV2Meetings: allMeetings.length,
      // Status sync
      changeCount: changes.length,
      unchangedCount: unchanged.length,
      missingCount: missing.length,
      changes,
      fired: dryRun ? null : fired,
      // New rows
      newRowCount: newRows.length,
      newRows: dryRun ? newRows : newRows.map(r => r.taskTitle),
      created: dryRun ? null : created,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message, detail: err.detail || null, status: err.status || null },
      { status: 500 },
    );
  }
}
