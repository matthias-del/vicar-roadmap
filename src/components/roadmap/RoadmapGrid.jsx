import React from "react";
import TaskBar from "./TaskBar";

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

                  {/* Tasks */}
                  {row.tasks.map((task) => {
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
