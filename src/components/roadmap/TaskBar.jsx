import React from "react";

export default function TaskBar({ task, gridRow, startColumn, endColumn }) {
  const isMeeting = task.title.startsWith('Meeting ');
  const meetingDate = isMeeting ? task.title.slice('Meeting '.length) : null;

  return (
    <div
      className={`task-bar${isMeeting ? ' meeting-bar' : ''}`}
      data-status={task.status}
      style={{
        gridRow: gridRow,
        gridColumn: `${startColumn} / ${endColumn}`
      }}
      title={task.title}
    >
      {isMeeting ? (
        <span className="task-title">Meeting ({meetingDate})</span>
      ) : (
        <span className="task-title">{task.title}</span>
      )}
    </div>
  );
}
