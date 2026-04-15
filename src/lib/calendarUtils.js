const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Count how many Fridays (day=5) fall in a given month
export function fridaysInMonth(year, monthIndex) {
  let count = 0;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    if (new Date(year, monthIndex, day).getDay() === 5) count++;
  }
  return count;
}

// Build phases array with correct Friday-based spans
export function generatePhases(startMonthIndex, startYear, durationMonths) {
  const phases = [];
  let cursor = 1;
  for (let i = 0; i < durationMonths; i++) {
    const monthIndex = (startMonthIndex + i) % 12;
    const year = startYear + Math.floor((startMonthIndex + i) / 12);
    const span = fridaysInMonth(year, monthIndex);
    phases.push({ title: MONTHS[monthIndex], monthIndex, year, start: cursor, span });
    cursor += span;
  }
  return phases;
}

// Total weeks = sum of all phase spans
export function totalWeeksFromPhases(phases) {
  return phases.reduce((sum, p) => sum + p.span, 0);
}

// Build a flat list of every selectable week slot for the start picker
// Returns [{ label: 'November — Week 1', startWeek: 1 }, ...]
export function buildWeekOptions(phases) {
  const options = [];
  for (const phase of phases) {
    for (let w = 1; w <= phase.span; w++) {
      options.push({
        label: `${phase.title} — Week ${w}`,
        startWeek: phase.start + w - 1,
      });
    }
  }
  return options;
}
