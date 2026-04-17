// Pure helper — used by both the server (template store) and the browser
// (CreateProjectForm, preview panel). No fs / no network imports.

const DUTCH_MONTHS = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function monthName(monthIndex) {
  return DUTCH_MONTHS[((monthIndex % 12) + 12) % 12];
}

function fillPlaceholders(title, { year, monthIndex }) {
  return title
    .replace(/\{month\}/g, monthName(monthIndex))
    .replace(/\{monthPlus1\}/g, monthName(monthIndex + 1))
    .replace(/\{monthPlus2\}/g, monthName(monthIndex + 2))
    .replace(/\{year\}/g, String(year));
}

export function applyMilestoneTemplate(template, { startDate, endDate }) {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
  if (!start || !end || end < start) {
    return { name: template?.name || '', tasks: [] };
  }

  const startYear = start.getFullYear();
  const startMonthIndex = start.getMonth();
  const endYear = end.getFullYear();
  const endMonthIndex = end.getMonth();
  const totalMonths = (endYear - startYear) * 12 + (endMonthIndex - startMonthIndex) + 1;

  const tasks = [];

  for (const pattern of template?.patterns || []) {
    const kind = pattern.kind;

    if (kind === 'monthly' || kind === 'everyNMonths') {
      const step = kind === 'everyNMonths' ? Math.max(1, Number(pattern.everyMonths) || 1) : 1;
      const day = Math.max(1, Math.min(31, Number(pattern.dayOfMonth) || 1));

      for (let i = 0; i < totalMonths; i += step) {
        const absoluteMonthIndex = startMonthIndex + i;
        const year = startYear + Math.floor(absoluteMonthIndex / 12);
        const monthIndex = ((absoluteMonthIndex % 12) + 12) % 12;
        const lastDay = new Date(year, monthIndex + 1, 0).getDate();
        const dueDate = new Date(year, monthIndex, Math.min(day, lastDay));
        if (dueDate < start || dueDate > end) continue;
        const title = fillPlaceholders(pattern.title || '', { year, monthIndex });
        tasks.push({ title, dueOn: toISO(dueDate) });
      }
      continue;
    }

    if (kind === 'once') {
      let dueDate;
      if (pattern.position === 'end') dueDate = end;
      else if (pattern.position === 'start') dueDate = start;
      else {
        const offset = Number(pattern.offsetDays) || 0;
        dueDate = new Date(start);
        dueDate.setDate(dueDate.getDate() + offset);
        if (dueDate > end) dueDate = end;
      }
      const title = fillPlaceholders(pattern.title || '', {
        year: dueDate.getFullYear(),
        monthIndex: dueDate.getMonth(),
      });
      tasks.push({ title, dueOn: toISO(dueDate) });
      continue;
    }
  }

  tasks.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  return { name: template?.name || '', tasks };
}
