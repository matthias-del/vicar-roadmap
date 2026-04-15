import { generatePhases, totalWeeksFromPhases } from './calendarUtils';

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSLX1S4Qqedr5eDExBtFcrG3sGGjOu4x_xPnnx1Ey49E5XQxUDqn8TbzVJWpTJfN4oAqslabhaNc9FW/pub?output=csv';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── CSV parser (handles quoted fields) ────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

// ── Fetch and parse the sheet ─────────────────────────────────────────────────
export async function fetchSheetRows() {
  const res = await fetch(SHEET_CSV_URL, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

// ── Build a client roadmap from sheet rows ────────────────────────────────────
export function buildClientRoadmapFromRows(rows, clientId) {
  const clientRows = rows.filter(r => r.clientId === clientId);
  if (!clientRows.length) return null;

  const clientName = clientRows[0].clientName;

  // Find timeline bounds from the task data
  const monthYears = clientRows.map(r => ({
    monthIndex: MONTHS.indexOf(r.startMonth),
    year: Number(r.startYear),
    weekInMonth: Number(r.weekInMonth),
    duration: Number(r.duration),
  })).filter(r => r.monthIndex !== -1);

  if (!monthYears.length) return null;

  // Earliest month = timeline start
  monthYears.sort((a, b) => (a.year * 12 + a.monthIndex) - (b.year * 12 + b.monthIndex));
  const { monthIndex: startMonthIndex, year: startYear } = monthYears[0];

  // Find the month the last task ends in
  let maxAbsoluteMonth = 0;
  for (const t of monthYears) {
    const absMonth = t.year * 12 + t.monthIndex;
    const weeksUsed = t.weekInMonth + t.duration;
    const extraMonths = Math.ceil(weeksUsed / 5); // 5 = max Fridays a month can have
    maxAbsoluteMonth = Math.max(maxAbsoluteMonth, absMonth + extraMonths + 1); // +1 buffer
  }
  const durationMonths = Math.max(1, maxAbsoluteMonth - (startYear * 12 + startMonthIndex));

  const phases = generatePhases(startMonthIndex, startYear, durationMonths);
  const totalWeeks = totalWeeksFromPhases(phases);

  // Build a lookup: 'November-2025' → phase
  const phaseMap = {};
  for (const phase of phases) {
    phaseMap[`${phase.title}-${phase.year}`] = phase;
  }

  // Group rows by groupLabel
  const groupMap = new Map();
  for (const row of clientRows) {
    const phase = phaseMap[`${row.startMonth}-${row.startYear}`];
    if (!phase) continue;

    const startWeek = phase.start + Number(row.weekInMonth) - 1;
    const taskId = `sheet-${clientId}-${row.groupLabel}-${row.taskTitle}`
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    if (!groupMap.has(row.groupLabel)) {
      const groupId = `group-${row.groupLabel.toLowerCase().replace(/\s+/g, '-')}`;
      groupMap.set(row.groupLabel, {
        id: groupId,
        label: row.groupLabel.toUpperCase(),
        rows: [{ id: `row-${groupId}`, tasks: [] }],
      });
    }

    // teamleaderIds column: comma-separated UUIDs, e.g. "uuid-1,uuid-2"
    const teamleaderIds = row.teamleaderIds
      ? row.teamleaderIds.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const completionThreshold = row.completionThreshold
      ? Math.min(100, Math.max(1, Number(row.completionThreshold)))
      : 100;

    groupMap.get(row.groupLabel).rows[0].tasks.push({
      id: taskId,
      title: row.taskTitle,
      startWeek,
      duration: Number(row.duration),
      status: row.status === 'completed' ? 'completed' : row.status === 'progress' ? 'progress' : 'planned',
      teamleaderIds,
      completionThreshold,
      teamleaderTaskStatuses: {},
    });
  }

  return {
    id: clientId,
    name: clientName,
    roadmap: {
      startMonthIndex,
      startYear,
      durationMonths,
      totalWeeks,
      phases,
      groups: [...groupMap.values()],
    },
  };
}

// ── Get all unique client IDs from the sheet ──────────────────────────────────
export function getAllClientsFromRows(rows) {
  const seen = new Set();
  return rows
    .filter(r => r.clientId && !seen.has(r.clientId) && seen.add(r.clientId))
    .map(r => ({ id: r.clientId, name: r.clientName }));
}
