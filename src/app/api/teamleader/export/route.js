// GET /api/teamleader/export?projectId=<uuid>[&format=tsv|json][&debug=1]
//                            [&listProjects=1]
//
// Backfill helper for V2 (nextgen) Teamleader projects. Returns the rows in
// the same column order as the roadmap Google Sheet, ready to paste into
// the next empty row.
//
// Caveats discovered while building this:
//   - The UUID in a Teamleader project URL (/projects/<uuid>/work-breakdown)
//     is NOT the same as the V2 API project ID. We list V2 projects and
//     match against task.project.id to find the right one.
//   - V2 task fields: { id, title, status (open|done|...), start_date,
//     end_date, project: { id }, group: { id } }. There is no `customer`
//     on a V2 task — it lives on the project.
//   - V2 task list does NOT enforce its filter — it silently returns
//     everything. We always client-side filter by task.project.id.
//
// Modes:
//   ?listProjects=1     → returns V2 projects with id + title for picking
//   ?debug=1            → raw API responses (project info + first 2 tasks)
//   ?format=json[&full=1] → structured rows (preview-only by default)
//   default             → TSV for paste-into-sheet
//
// Sheet column order:
//   A clientId   B clientName   C groupLabel   D taskTitle
//   E startMonth F startYear    G weekInMonth  H duration
//   I status     J completionThreshold         K teamleaderIds

import { NextResponse } from 'next/server';
import { getValidToken } from '@/lib/teamleaderAuth';

const TL = 'https://api.focus.teamleader.eu';

const PRICE_SUFFIX = /\s+€[\d.,\s]+$/u;
const LEGAL_TOKENS = /\b(?:BV|BVBA|NV|SA|SRL|SAS|SARL|SPRL|S\.?A\.?|S\.?R\.?L\.?|Ltd\.?|LLC|Inc\.?|GmbH|AG|Plc)\b/giu;
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function stripPrice(s) { return s ? s.replace(PRICE_SUFFIX, '').trim() : null; }
function stripLegal(s) { return s ? s.replace(LEGAL_TOKENS, '').replace(/\s{2,}/g, ' ').trim() : null; }
function slug(s) { return s ? s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null; }

async function tlPost(endpoint, body, token, { retries = 6 } = {}) {
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
    // Retry on 429 (rate limit). Teamleader resets per-minute, so on a hit
    // we back off aggressively: 2s, 4s, 8s, 16s, 30s, 60s.
    if (res.status === 429 && attempt < retries) {
      const waits = [2000, 4000, 8000, 16000, 30000, 60000];
      await new Promise(r => setTimeout(r, waits[attempt]));
      attempt += 1;
      continue;
    }
    return { status: res.status, ok: res.ok, data };
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// V2 task status mapped to sheet status.
function mapStatus(s) {
  if (!s) return 'planned';
  if (s === 'done' || s === 'completed') return 'completed';
  if (s === 'in_progress' || s === 'started') return 'progress';
  return 'planned'; // open, planned, etc.
}

function deriveDateFields(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return {
    startMonth: MONTHS[d.getUTCMonth()],
    startYear: d.getUTCFullYear(),
    weekInMonth: Math.min(5, Math.ceil(d.getUTCDate() / 7)),
  };
}

// Page through a V2 list endpoint. The filter is ignored by the API,
// so we client-side filter; this function supports an early-exit predicate
// to stop once we've collected enough matches for the target project.
async function listAllV2(endpoint, token, { stopWhen, maxPages = 200 } = {}) {
  const all = [];
  let page = 1;
  const size = 100;
  // Sort newest-first so recent projects appear in the first pages.
  // If the API doesn't honor sort, this just gets ignored — no harm.
  while (true) {
    const res = await tlPost(endpoint, {
      page: { size, number: page },
      sort: [{ field: 'created_at', order: 'desc' }],
    }, token);
    if (!res.ok) {
      const err = new Error(`${endpoint} failed (page ${page})`);
      err.detail = res.data; err.status = res.status; throw err;
    }
    const items = res.data?.data || [];
    all.push(...items);
    if (items.length < size) break;
    if (stopWhen && stopWhen(all, page)) break;
    page += 1;
    if (page > maxPages) break;
  }
  return all;
}

const listAllTasks = (token, opts) => listAllV2('projects-v2/tasks.list', token, opts);

// projects-v2/meetings.list ignores pagination and returns everything in one
// call (~600 items for the whole workspace). No need to paginate — doing so
// just burns rate limit.
async function listAllMeetings(token) {
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

async function listAllV2Projects(token) {
  const all = [];
  let page = 1;
  const size = 100;
  let lastErr = null;
  // Try both endpoint name conventions; some docs write projects-v2/projects.list,
  // others projects-v2.list. We use the first one that works.
  const endpoints = ['projects-v2/projects.list', 'projects-v2.list'];

  for (const endpoint of endpoints) {
    page = 1;
    all.length = 0;
    let endpointFailed = false;
    while (true) {
      const res = await tlPost(endpoint, {
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
      if (page > 20) break;
    }
    if (!endpointFailed) return { projects: all, endpoint };
  }
  const err = new Error(`Could not list V2 projects (last endpoint ${lastErr?.endpoint})`);
  err.detail = lastErr?.detail; err.status = lastErr?.status;
  throw err;
}

async function resolveCustomerName(customer, token, cache) {
  if (!customer?.id || !customer?.type) return null;
  const key = `${customer.type}:${customer.id}`;
  if (cache.has(key)) return cache.get(key);
  const endpoint = customer.type === 'contact' ? 'contacts.info' : 'companies.info';
  const res = await tlPost(endpoint, { id: customer.id }, token);
  let name = null;
  if (res.ok) {
    const c = res.data?.data;
    name = customer.type === 'contact'
      ? `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || null
      : c?.name || null;
  }
  cache.set(key, name);
  return name;
}

// Resolve a V2 group id to its name (for groupLabel). Cached per call.
async function resolveGroupName(groupId, token, cache) {
  if (!groupId) return '';
  if (cache.has(groupId)) return cache.get(groupId);
  const res = await tlPost('projects-v2/projectGroups.info', { id: groupId }, token);
  let name = '';
  if (res.ok) name = res.data?.data?.title || res.data?.data?.name || '';
  cache.set(groupId, name);
  return name;
}

function rowToTsvCells(row) {
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
  const projectIdParam = searchParams.get('projectId');
  const format = (searchParams.get('format') || 'tsv').toLowerCase();
  const wantList = searchParams.get('listProjects') === '1';
  const debug = searchParams.get('debug') === '1';

  try {
    const token = await getValidToken();

    // Mode 1: list V2 projects so the user can find the right API ID.
    if (wantList) {
      const { projects, endpoint } = await listAllV2Projects(token);
      return NextResponse.json({
        count: projects.length,
        endpoint,
        projects: projects.map(p => ({
          id: p.id,
          title: p.title || p.name,
          status: p.status,
          customer: p.customer || p.customers?.[0]?.customer || null,
        })),
      });
    }

    if (!projectIdParam) {
      return NextResponse.json(
        { error: 'Provide ?projectId=<v2-uuid>, or ?listProjects=1 to find it.' },
        { status: 400 },
      );
    }

    // Mode 2: debug raw responses + try multiple filter shapes.
    if (debug) {
      const projInfo = await tlPost('projects-v2/projects.info', { id: projectIdParam }, token);

      const filterShapes = [
        { label: 'project_id_string', filter: { project_id: projectIdParam } },
        { label: 'project_object', filter: { project: { id: projectIdParam, type: 'nextgenProject' } } },
        { label: 'project_id_only', filter: { project: projectIdParam } },
        { label: 'ids_array', filter: { ids: [projectIdParam] } },
        { label: 'project_ids_array', filter: { project_ids: [projectIdParam] } },
      ];

      const filterTests = [];
      for (const shape of filterShapes) {
        const r = await tlPost('projects-v2/tasks.list', {
          filter: shape.filter,
          page: { size: 5, number: 1 },
        }, token);
        const items = r.data?.data || [];
        const matchingCount = items.filter(t => t.project?.id === projectIdParam).length;
        filterTests.push({
          label: shape.label,
          status: r.status,
          ok: r.ok,
          returnedCount: items.length,
          matchingProjectCount: matchingCount,
          firstItemProjectId: items[0]?.project?.id || null,
          error: r.ok ? null : r.data,
        });
      }

      // Probe group endpoint variants — pick a real group ID from a task.
      const sampleTaskRes = await tlPost('projects-v2/tasks.list', {
        page: { size: 5, number: 1 },
      }, token);
      const sampleGroupId = sampleTaskRes.data?.data?.find(t => t.group?.id)?.group?.id;

      const groupEndpoints = [
        'projects-v2/groups.info',
        'projects-v2/projectGroups.info',
        'projects-v2/project-groups.info',
        'projects-v2/sections.info',
        'projects-v2/groups.list',
      ];
      const groupTests = [];
      for (const ep of groupEndpoints) {
        const r = await tlPost(ep, sampleGroupId ? { id: sampleGroupId } : { page: { size: 1, number: 1 } }, token);
        groupTests.push({
          endpoint: ep,
          status: r.status,
          ok: r.ok,
          sampleData: r.ok ? (r.data?.data || null) : null,
          error: r.ok ? null : r.data,
        });
      }

      // Probe meeting/event endpoint variants.
      const meetingEndpoints = [
        'projects-v2/meetings.list',
        'projects-v2/events.list',
        'projects-v2/projectMeetings.list',
        'meetings.list',
        'events.list',
        'calendarEvents.list',
      ];
      const meetingTests = [];
      for (const ep of meetingEndpoints) {
        const r = await tlPost(ep, { page: { size: 2, number: 1 } }, token);
        meetingTests.push({
          endpoint: ep,
          status: r.status,
          ok: r.ok,
          returnedCount: r.ok ? (r.data?.data?.length || 0) : 0,
          firstItem: r.ok ? (r.data?.data?.[0] || null) : null,
          error: r.ok ? null : r.data,
        });
      }

      return NextResponse.json({
        projects_v2_info: { status: projInfo.status, ok: projInfo.ok, data: projInfo.data },
        filterTests,
        sampleGroupId,
        groupTests,
        meetingTests,
      });
    }

    // Normal export: fetch tasks AND meetings (both are separate V2 entities
    // but share the same shape: {id, title, status, start_date, end_date,
    // project:{id}, group:{id}}). The API ignores the project filter on both,
    // so client-side filter. Stop scanning early once we've gathered matches
    // and then seen ~10 consecutive pages with no new ones.
    const makeStop = () => {
      let lastMatchPage = 0;
      let prevMatches = 0;
      return (collected, currentPage) => {
        const matches = collected.filter(t => t.project?.id === projectIdParam).length;
        if (matches > prevMatches) {
          lastMatchPage = currentPage;
          prevMatches = matches;
        }
        if (matches > 0 && currentPage - lastMatchPage >= 10) return true;
        return false;
      };
    };

    // Serialize — parallel scans blew past Teamleader's rate limit.
    const allTasks = await listAllTasks(token, { stopWhen: makeStop() });
    const allMeetings = await listAllMeetings(token);
    const tasks = allTasks.filter(t => t.project?.id === projectIdParam);
    const meetings = allMeetings.filter(m => m.project?.id === projectIdParam);
    const items = [
      ...tasks.map(t => ({ ...t, _kind: 'task' })),
      ...meetings.map(m => ({ ...m, _kind: 'meeting' })),
    ];

    if (!items.length) {
      return NextResponse.json(
        {
          error: `No V2 tasks or meetings found for projectId=${projectIdParam}`,
          hint: 'The URL ID may differ from the V2 API ID. Try ?listProjects=1 to find the right one.',
          totalTasksScanned: allTasks.length,
          totalMeetingsScanned: allMeetings.length,
        },
        { status: 404 },
      );
    }

    // Project info for customer.
    let projectCustomer = null;
    let projectTitle = null;
    const projInfo = await tlPost('projects-v2/projects.info', { id: projectIdParam }, token);
    if (projInfo.ok) {
      const p = projInfo.data?.data;
      projectTitle = p?.title || p?.name || null;
      projectCustomer = p?.customer || p?.customers?.[0]?.customer || p?.customers?.[0] || null;
    }

    const customerCache = new Map();
    const groupCache = new Map();
    // Prefer ?clientName= override (for V2 projects that aren't linked to
    // a customer in TL), then resolved customer name, then project title
    // as last resort so rows aren't blank.
    const overrideClient = searchParams.get('clientName');
    const rawClientName = overrideClient
      || await resolveCustomerName(projectCustomer, token, customerCache)
      || projectTitle;
    const clientName = stripLegal(rawClientName);
    const clientId = slug(clientName);

    const rows = [];
    for (const t of items) {
      const groupLabel = await resolveGroupName(t.group?.id, token, groupCache);
      const dateStr = t.end_date || t.start_date || t.date || null;
      const { startMonth, startYear, weekInMonth } = deriveDateFields(dateStr);

      // Meetings are rendered in the roadmap as "Meeting (<date>)" — the
      // TaskBar component detects a "Meeting " prefix. Strip the year since
      // the roadmap header already shows it; "MM-DD" is enough.
      const rawTitle = stripPrice(t.title || null);
      const shortDate = dateStr ? dateStr.slice(5) : ''; // YYYY-MM-DD → MM-DD
      const taskTitle = t._kind === 'meeting'
        ? `Meeting ${shortDate}`.trim()
        : rawTitle;

      rows.push({
        clientId,
        clientName,
        groupLabel,
        taskTitle,
        startMonth,
        startYear,
        weekInMonth,
        duration: 1,
        status: mapStatus(t.status),
        completionThreshold: '',
        // Write the V2 UUID into column K so /api/teamleader/sync-statuses
        // can reconcile task/meeting status back to the sheet.
        teamleaderIds: t.id,
        uuid: t.id,
        kind: t._kind,
        end_date: t.end_date || t.date,
      });
    }

    if (format === 'json') {
      const full = searchParams.get('full') === '1';
      return NextResponse.json({
        count: rows.length,
        projectTitle,
        clientName,
        preview: rows.slice(0, 3),
        ...(full ? { rows } : { hint: 'Add &full=1 for every row, or drop format=json for TSV download.' }),
      });
    }

    const tsv = rows.map(r => rowToTsvCells(r).join('\t')).join('\n');
    return new Response(tsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/tab-separated-values; charset=utf-8',
        'Content-Disposition': `inline; filename="teamleader-export-${projectIdParam}.tsv"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message, detail: err.detail || null, status: err.status || null },
      { status: 500 },
    );
  }
}
