import React from "react";

export default function TaskBar({ task, gridRow, startColumn, endColumn }) {
  const isMeeting = task.title.startsWith('Meeting ');
  const isShoot = task.title.startsWith('Shoot ');
  const isEvent = isMeeting || isShoot;
  const prefix = isMeeting ? 'Meeting' : isShoot ? 'Shoot' : null;
  const eventDate = isEvent ? task.title.slice(prefix.length + 1) : null;

  return (
    <div
      className={`task-bar${isEvent ? ' meeting-bar' : ''}`}
      data-status={task.status}
      style={{
        gridRow: gridRow,
        gridColumn: `${startColumn} / ${endColumn}`
      }}
      title={[task.title, task.teamleaderIds?.length ? `ID: ${task.teamleaderIds.join(', ')}` : null].filter(Boolean).join('\n')}
    >
      {isEvent ? (
        <span className="task-title">{prefix} ({eventDate})</span>
      ) : (
        <span className="task-title">{task.title}</span>
      )}
    </div>
  );
}
