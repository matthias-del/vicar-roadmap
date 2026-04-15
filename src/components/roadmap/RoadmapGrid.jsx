import React from "react";
import TaskBar from "./TaskBar";

// Groups that should render as one continuous bar spanning their task range,
// instead of as individual task bars. Compared case-insensitively.
const MERGED_GROUPS = new Set(['SOCIALS', 'ADS']);

// Roll up a list of tasks into a single "merged" task: earliest start to
// latest end, with a sensible status (completed if all done, progress if any
// in progress, else planned).
function rollupTasks(label, tasks) {
  if (!tasks.length) return null;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  let anyProgress = false;
  let allCompleted = true;
  for (const t of tasks) {
    const start = t.startWeek;
    const end = t.startWeek + t.duration;
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
    if (t.status === 'progress') anyProgress = true;
    if (t.status !== 'completed') allCompleted = false;
  }
  const status = allCompleted ? 'completed' : anyProgress ? 'progress' : 'planned';
  return {
    id: `merged-${label}`,
    title: label.charAt(0) + label.slice(1).toLowerCase(), // "Socials", "Ads"
    startWeek: minStart,
    duration: maxEnd - minStart,
    status,
  };
}

export default function RoadmapGrid({ roadmap }) {
  const { totalWeeks, phases, groups } = roadmap;

  // 1. Column definitions
  // 1 col for Groups vertical text
  // 1 col for empty space or future labels if needed (actually just 1 sidebar col is fine)
  // totalWeeks cols for the weeks
  const gridStyle = {
    "--total-weeks": totalWeeks
  };

  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);

  // Compute how many actual rows the grid will have (needed for vertical spans)
  let totalRows = 0;
  groups.forEach(g => { totalRows += g.rows.length; });

  let currentRowCount = 3; // header row 1, header row 2, and then data starts at row 3

  return (
    <div className="roadmap-grid" style={gridStyle}>
      {/* HEADER TIER 1: Phases */}
      <div className="roadmap-timeline-header phases-header" style={{ gridRow: 1 }}>
        <div className="timeline-header-cell empty-corner" style={{ gridColumn: 1 }}></div>
        {phases.map((phase, idx) => {
          const startCol = phase.start + 1; // +1 because col 1 is sidebar
          const endCol = startCol + phase.span;
          return (
            <div
              key={`phase-${idx}`}
              className="timeline-phase-cell"
              style={{ gridColumn: `${startCol} / ${endCol}` }}
            >
              {phase.title}
            </div>
          );
        })}
      </div>

      {/* HEADER TIER 2: Weeks */}
      <div className="roadmap-timeline-header weeks-header" style={{ gridRow: 2 }}>
        <div className="timeline-header-cell empty-corner" style={{ gridColumn: 1 }}></div>
        {weeks.map((week) => {
          const phase = phases.find(p => week >= p.start && week < p.start + p.span);
          const weekInPhase = phase ? week - phase.start + 1 : week;
          return (
            <div key={`header-w${week}`} className="timeline-week-cell" style={{ gridColumn: week + 1 }}>
              Week {weekInPhase}
            </div>
          );
        })}
      </div>

      {/* GROUPS AND ROWS */}
      {groups.map((group) => {
        const groupStartRow = currentRowCount;
        const groupRowCount = group.rows.length;
        const groupEndRow = groupStartRow + groupRowCount;

        const groupContent = (
          <React.Fragment key={group.id}>
            {/* Sidebar Label bridging all rows of this group */}
            <div
              className="vertical-group-label"
              style={{
                gridRow: `${groupStartRow} / ${groupEndRow}`,
                gridColumn: "1"
              }}
            >
              <span>{group.label}</span>
            </div>

            {/* Render Rows */}
            {group.rows.map((row, rIdx) => {
              const actualGridRow = groupStartRow + rIdx;

              return (
                <div key={row.id} className="roadmap-data-row" style={{ display: 'contents' }}>
                  {/* Background Lanes */}
                  {weeks.map((week) => (
                    <div
                      key={`bg-${row.id}-w${week}`}
                      className="grid-lane-cell"
                      style={{
                        gridRow: actualGridRow,
                        gridColumn: week + 1
                      }}
                    />
                  ))}

                  {/* Tasks — merged into one bar for SOCIALS / ADS, individual otherwise */}
                  {MERGED_GROUPS.has(group.label?.toUpperCase()) ? (() => {
                    const merged = rollupTasks(group.label, row.tasks);
                    if (!merged) return null;
                    const startColumn = merged.startWeek + 1;
                    const endColumn = startColumn + merged.duration;
                    return (
                      <TaskBar
                        key={merged.id}
                        task={merged}
                        gridRow={actualGridRow}
                        startColumn={startColumn}
                        endColumn={endColumn}
                      />
                    );
                  })() : row.tasks.map((task) => {
                    const startColumn = task.startWeek + 1;
                    const endColumn = startColumn + task.duration;

                    return (
                      <TaskBar
                        key={task.id}
                        task={task}
                        gridRow={actualGridRow}
                        startColumn={startColumn}
                        endColumn={endColumn}
                      />
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        );

        currentRowCount += groupRowCount;
        return groupContent;
      })}
    </div>
  );
}
