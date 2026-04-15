// GET /api/teamleader/export?projectId=<uuid>[&format=tsv|json]
//
// Backfill helper: lists every task on a Teamleader project and returns the
// rows in the same column order as the roadmap Google Sheet, ready to paste
// into the next empty row.
//
// Default response is TSV (Excel/Sheets pastes it across the right columns).
// Pass ?format=json to inspect the structured payload instead.
//
// Column order matches the sheet:
//   A clientId   B clientName   C groupLabel   D taskTitle
//   E startMonth F startYear    G weekInMonth  H duration
//   I status     J completionThreshold         K teamleaderIds
//
// Notes:
//   - groupLabel is left blank — Teamleader's tasks API does not expose
//     which group/section a task belongs to. Fill it in manually after paste.
//   - completionThreshold is left blank (defaults to 100 in the UI).
//   - teamleaderIds is left blank for backfilled rows. Teamleader does not
//     expose a UUID→legacy-int reverse lookup, so the task_deleted webhook
//     Zap will not be able to auto-remove these rows. Paste the int IDs by
//     hand if you need that, or just rely on the future flow for new tasks.

import { NextResponse } from 'next/server';
import { getValidToken } from '@/lib/teamleaderAuth';

const TL = 'https://api.focus.teamleader.eu';

// ── Same normalization the resolve endpoint uses ─────────────────────────────
const PRICE_SUFFIX = /\s+€[\d.,\s]+$/u;
const LEGAL_TOKENS = /\b(?:BV|BVBA|NV|SA|SRL|SAS|SARL|SPRL|S\.?A\.?|S\.?R\.?L\.?|Ltd\.?|LLC|Inc\.?|GmbH|AG|Plc)\b/giu;
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function stripPrice(title) {
  return title ? title.replace(PRICE_SUFFIX, '').trim() : null;
}

function stripLegal(name) {
  return name ? name.replace(LEGAL_TOKENS, '').replace(/\s{2,}/g, ' ').trim() : null;
}

function slug(s) {
  return s ? s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null;
}

async function tlPost(endpoint, body, token) {
  const res = await fetch(`${TL}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

// Page through tasks for a project. Tries the new Projects V2 endpoint first
// (the project URLs in the TL UI under /projects/<uuid>/work-breakdown are V2)
// and falls back to legacy tasks.list if that 4xx's.
async function listAllTasks(projectId, token) {
  const endpoints = ['projects-v2/tasks.list', 'tasks.list'];
  let lastErr = null;

  for (const endpoint of endpoints) {
    const all = [];
    let page = 1;
    const size = 100;
    let endpointFailed = false;

    while (true) {
      const res = await tlPost(endpoint, {
        filter: { project_id: projectId },
        page: { size, number: page },
      }, token);

      if (!res.ok) {
        lastErr = { endpoint, page, status: res.status, detail: res.data };
        endpointFailed = true;
        break;
      }

      const items = res.data?.data || [];
      all.push(...items);
      if (items.length < size) break;
      page += 1;
      if (page > 50) break; // safety
    }

    if (!endpointFailed) return { tasks: all, endpoint };
  }

  const err = new Error(`tasks.list failed on all endpoints (last: ${lastErr.endpoint} page ${lastErr.page})`);
  err.detail = lastErr.detail;
  err.status = lastErr.status;
  throw err;
}

// Resolve a customer (company or contact) to a display name. Cached per call.
async function resolveCustomerName(customer, token, cache) {
  if (!customer?.id || !customer?.type) return null;
  const key = `${customer.type}:${customer.id}`;
  if (cache.has(key)) return cache.get(key);

  const endpoint = customer.type === 'contact' ? 'contacts.info' : 'companies.info';
  const res = await tlPost(endpoint, { id: customer.id }, token);
  let name = null;
  if (res.ok) {
    const c = res.data?.data;
    if (customer.type === 'contact') {
      name = `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || null;
    } else {
      name = c?.name || null;
    }
  }
  cache.set(key, name);
  return name;
}

function deriveDateFields(due_on) {
  const d = due_on ? new Date(due_on) : new Date();
  return {
    startMonth: MONTHS[d.getUTCMonth()],
    startYear: d.getUTCFullYear(),
    weekInMonth: Math.min(5, Math.ceil(d.getUTCDate() / 7)),
  };
}

function rowToTsvCells(row) {
  // Column order A..K. Empty cells are kept as empty strings so paste lands
  // in the right column.
  return [
    row.clientId ?? '',
    row.clientName ?? '',
    row.groupLabel ?? '',
    row.taskTitle ?? '',
    row.startMonth ?? '',
    row.startYear ?? '',
    row.weekInMonth ?? '',
    row.duration ?? '',
    row.status ?? '',
    row.completionThreshold ?? '',
    row.teamleaderIds ?? '',
  ].map(v => String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const format = (searchParams.get('format') || 'tsv').toLowerCase();

  if (!projectId) {
    return NextResponse.json(
      { error: 'Provide ?projectId=<uuid>' },
      { status: 400 },
    );
  }

  try {
    const token = await getValidToken();

    // Debug mode: dump raw API responses so we can see actual field shapes.
    if (searchParams.get('debug') === '1') {
      const projInfo = await tlPost('projects-v2.info', { id: projectId }, token);
      const tasksRes = await tlPost('projects-v2/tasks.list', {
        filter: { project_id: projectId },
        page: { size: 2, number: 1 },
      }, token);
      return NextResponse.json({
        projects_v2_info: { status: projInfo.status, ok: projInfo.ok, data: projInfo.data },
        projects_v2_tasks_list_first2: {
          status: tasksRes.status,
          ok: tasksRes.ok,
          data: tasksRes.data,
        },
      });
    }

    const { tasks, endpoint: usedEndpoint } = await listAllTasks(projectId, token);

    // V2 project tasks don't carry a customer field — the customer lives on
    // the project itself. Try projects-v2.info once; whatever we get becomes
    // the default customer for every task that doesn't have its own.
    let projectCustomer = null;
    if (usedEndpoint === 'projects-v2/tasks.list') {
      const projInfo = await tlPost('projects-v2.info', { id: projectId }, token);
      if (projInfo.ok) {
        const p = projInfo.data?.data;
        // V2 project may expose customer either as `customer` (single) or
        // `customers[0]` (array). Cover both.
        projectCustomer = p?.customer || p?.customers?.[0]?.customer || p?.customers?.[0] || null;
      }
    }

    const customerCache = new Map();
    const rows = [];

    for (const t of tasks) {
      const taskTitle = stripPrice(t.title || t.description || null);
      const customer = t.customer || projectCustomer;
      const rawClientName = await resolveCustomerName(customer, token, customerCache);
      const clientName = stripLegal(rawClientName);
      const clientId = slug(clientName);
      const { startMonth, startYear, weekInMonth } = deriveDateFields(t.due_on);

      rows.push({
        clientId,
        clientName,
        groupLabel: '',
        taskTitle,
        startMonth,
        startYear,
        weekInMonth,
        duration: 1,
        status: t.completed ? 'completed' : 'planned',
        completionThreshold: '',
        teamleaderIds: '', // see header comment — int ID unavailable from list
        // For debugging / json mode
        uuid: t.id,
        due_on: t.due_on || null,
      });
    }

    if (format === 'json') {
      // Default to a small preview to keep responses scannable. Pass
      // ?full=1 to return every row.
      const full = searchParams.get('full') === '1';
      return NextResponse.json({
        count: rows.length,
        endpoint: usedEndpoint,
        preview: rows.slice(0, 3),
        ...(full ? { rows } : { hint: 'Add &full=1 to include every row, or drop format=json to download as TSV.' }),
      });
    }

    // TSV: tab-separated, newline between rows, no header (so it pastes
    // cleanly under the existing header row in the sheet).
    const tsv = rows.map(r => rowToTsvCells(r).join('\t')).join('\n');
    return new Response(tsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/tab-separated-values; charset=utf-8',
        'Content-Disposition': `inline; filename="teamleader-export-${projectId}.tsv"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message, detail: err.detail || null, status: err.status || null },
      { status: 500 },
    );
  }
}
