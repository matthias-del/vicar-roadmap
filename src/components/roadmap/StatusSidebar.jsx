"use client";

import { useState, useEffect } from "react";
import { generatePhases, totalWeeksFromPhases, buildWeekOptions } from "@/lib/calendarUtils";

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const STATUSES = ["completed", "planned"];
const STATUS_LABELS = { completed: "Done", planned: "Not done" };

// ── API helpers ────────────────────────────────────────────────────────────────
async function api(method, body) {
  await fetch("/api/admin", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StatusSidebar({ roadmap: initialRoadmap }) {
  const [roadmap, setRoadmap] = useState(initialRoadmap);

  // Sync when server pushes fresh data via router.refresh()
  useEffect(() => {
    if (initialRoadmap) setRoadmap(initialRoadmap);
  }, [initialRoadmap]);

  if (!roadmap) return null;

  // ── Timeline ────────────────────────────────────────────────────────────────
  function handleTimeline(field, value) {
    const startMonthIndex = field === "startMonthIndex" ? Number(value) : roadmap.startMonthIndex;
    const startYear       = field === "startYear"       ? Number(value) : (roadmap.startYear ?? new Date().getFullYear());
    const durationMonths  = field === "durationMonths"  ? Math.max(1, Number(value)) : roadmap.durationMonths;

    const phases     = generatePhases(startMonthIndex, startYear, durationMonths);
    const totalWeeks = totalWeeksFromPhases(phases);

    setRoadmap(prev => ({ ...prev, startMonthIndex, startYear, durationMonths, totalWeeks, phases }));
    api("PUT", { startMonthIndex, startYear, durationMonths });
  }

  // ── Groups ──────────────────────────────────────────────────────────────────
  function handleAddGroup() {
    const label = prompt("Service name:");
    if (!label?.trim()) return;
    const groupId = `group-${Date.now()}`;
    setRoadmap(prev => ({
      ...prev,
      groups: [...prev.groups, { id: groupId, label: label.trim().toUpperCase(), rows: [] }],
    }));
    api("POST", { operation: "add-group", label: label.trim() });
  }

  function handleDeleteGroup(groupId) {
    if (!confirm("Remove this service and all its tasks?")) return;
    setRoadmap(prev => ({ ...prev, groups: prev.groups.filter(g => g.id !== groupId) }));
    api("DELETE", { operation: "delete-group", groupId });
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────
  function handleAddTask(groupId) {
    const title = prompt("Task name:");
    if (!title?.trim()) return;
    const taskId = `task-${Date.now()}`;
    const rowId  = `row-${Date.now()}`;
    const newTask = { id: taskId, title: title.trim(), startWeek: 1, duration: 2, status: "planned" };
    setRoadmap(prev => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id !== groupId ? g : { ...g, rows: [...g.rows, { id: rowId, tasks: [newTask] }] }
      ),
    }));
    api("POST", { operation: "add-task", groupId, title: title.trim() });
  }

  function handleDeleteTask(taskId) {
    setRoadmap(prev => ({
      ...prev,
      groups: prev.groups.map(g => ({
        ...g,
        rows: g.rows.filter(row => !row.tasks.some(t => t.id === taskId)),
      })),
    }));
    api("DELETE", { operation: "delete-task", taskId });
  }

  function updateTask(taskId, field, value) {
    setRoadmap(prev => ({
      ...prev,
      groups: prev.groups.map(g => ({
        ...g,
        rows: g.rows.map(row => ({
          ...row,
          tasks: row.tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t),
        })),
      })),
    }));
  }

  function handleTaskField(taskId, field, value) {
    const parsed = field === "title" ? value : Math.max(1, Number(value) || 1);
    updateTask(taskId, field, parsed);
    api("PATCH", { taskId, [field]: parsed });
  }

  function handleStatus(taskId, status) {
    updateTask(taskId, "status", status);
    api("PATCH", { taskId, status });
  }

  function handleTeamleaderIds(taskId, raw) {
    // raw is a comma-separated string of UUIDs typed by the user
    const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
    updateTask(taskId, "teamleaderIds", ids);
    api("PATCH", { taskId, teamleaderIds: ids });
  }

  function handleThreshold(taskId, value) {
    const threshold = Math.min(100, Math.max(1, Number(value) || 100));
    updateTask(taskId, "completionThreshold", threshold);
    api("PATCH", { taskId, completionThreshold: threshold });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="admin-sidebar">
      <div className="admin-sidebar-title">Roadmap Builder</div>

      {/* ── Timeline ── */}
      <section className="builder-section">
        <div className="builder-section-label">Timeline</div>

        <div className="builder-field-row">
          <label className="builder-label">Start</label>
          <select
            className="builder-select"
            value={roadmap.startMonthIndex}
            onChange={e => handleTimeline("startMonthIndex", e.target.value)}
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <input
            className="builder-input-sm"
            type="number"
            min="2020"
            max="2099"
            value={roadmap.startYear ?? new Date().getFullYear()}
            onChange={e => handleTimeline("startYear", e.target.value)}
          />
        </div>

        <div className="builder-field-row">
          <label className="builder-label">Duration</label>
          <input
            className="builder-input-sm"
            type="number"
            min="1"
            max="24"
            value={roadmap.durationMonths}
            onChange={e => handleTimeline("durationMonths", e.target.value)}
          />
          <span className="builder-unit">months</span>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="builder-section">
        <div className="builder-section-label">Services</div>

        {roadmap.groups.map(group => (
          <div key={group.id} className="builder-group">
            <div className="builder-group-header">
              <span className="builder-group-name">{group.label}</span>
              <button className="builder-icon-btn danger" onClick={() => handleDeleteGroup(group.id)} title="Remove service">✕</button>
            </div>

            {group.rows.flatMap(row => row.tasks).map(task => (
              <div key={task.id} className="builder-task-row">
                <input
                  className="builder-task-title"
                  value={task.title}
                  onChange={e => updateTask(task.id, "title", e.target.value)}
                  onBlur={e => handleTaskField(task.id, "title", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && e.target.blur()}
                />

                <div className="builder-task-meta">
                  <label className="builder-meta-label">Start</label>
                  <select
                    className="builder-select builder-select-sm"
                    value={task.startWeek}
                    onChange={e => handleTaskField(task.id, "startWeek", Number(e.target.value))}
                  >
                    {buildWeekOptions(roadmap.phases).map(opt => (
                      <option key={opt.startWeek} value={opt.startWeek}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="builder-task-meta">
                  <label className="builder-meta-label">Dur</label>
                  <input
                    className="builder-meta-input"
                    type="number" min="1"
                    value={task.duration}
                    onChange={e => updateTask(task.id, "duration", e.target.value)}
                    onBlur={e => handleTaskField(task.id, "duration", e.target.value)}
                    onKeyDown={e => e.key === "Enter" && e.target.blur()}
                  />
                  <span className="builder-unit">wks</span>
                </div>

                <div className="builder-task-footer">
                  <div className="builder-status-dots">
                    {STATUSES.map(s => (
                      <button
                        key={s}
                        className="builder-dot"
                        data-status={s}
                        data-active={task.status === s}
                        title={STATUS_LABELS[s]}
                        onClick={() => handleStatus(task.id, s)}
                      />
                    ))}
                  </div>
                  <button className="builder-icon-btn danger" onClick={() => handleDeleteTask(task.id)} title="Remove task">✕</button>
                </div>

                {/* Teamleader linking */}
                <div className="builder-tl-section">
                  <label className="builder-meta-label" style={{ marginBottom: 2 }}>TL task IDs</label>
                  <input
                    className="builder-task-title"
                    placeholder="uuid-1, uuid-2, ..."
                    value={(task.teamleaderIds ?? []).join(', ')}
                    onChange={e => updateTask(task.id, "teamleaderIds", e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    onBlur={e => handleTeamleaderIds(task.id, e.target.value)}
                    onKeyDown={e => e.key === "Enter" && e.target.blur()}
                  />
                  <div className="builder-task-meta" style={{ marginTop: 4 }}>
                    <label className="builder-meta-label">Done at</label>
                    <input
                      className="builder-meta-input"
                      type="number" min="1" max="100"
                      value={task.completionThreshold ?? 100}
                      onChange={e => updateTask(task.id, "completionThreshold", Number(e.target.value))}
                      onBlur={e => handleThreshold(task.id, e.target.value)}
                      onKeyDown={e => e.key === "Enter" && e.target.blur()}
                    />
                    <span className="builder-unit">%</span>
                  </div>
                </div>
              </div>
            ))}

            <button className="builder-add-btn" onClick={() => handleAddTask(group.id)}>
              + Add task
            </button>
          </div>
        ))}

        <button className="builder-add-service-btn" onClick={handleAddGroup}>
          + Add service
        </button>
      </section>
    </div>
  );
}
