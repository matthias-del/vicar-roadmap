"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyMilestoneTemplate } from "@/lib/applyMilestoneTemplate";

const emptyTask = () => ({ title: "", dueOn: "", description: "", lastAutoTitle: null, lastAutoDueOn: null });
const emptyMilestone = () => ({
  name: "",
  startDate: "",
  dueOn: "",
  tasks: [emptyTask()],
  templateId: "",
});

const input = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const label = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#555",
  marginBottom: 4,
};

const section = {
  background: "white",
  padding: 20,
  borderRadius: 8,
  border: "1px solid #eee",
  marginBottom: 16,
};

const smallBtn = {
  padding: "6px 10px",
  fontSize: 12,
  border: "1px solid #ccc",
  background: "white",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
};

export default function CreateProjectForm({ templates = [] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [customerType, setCustomerType] = useState("company");
  const [customerId, setCustomerId] = useState("");
  const [milestones, setMilestones] = useState([emptyMilestone()]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function effectiveStart(ms) {
    return ms.startDate || startsOn || "";
  }

  // Build a new tasks list by running the template expansion and preserving any
  // tasks the user manually edited (title or dueOn no longer match the auto values).
  function computeTasksFromTemplate(ms, template, { start, end }) {
    if (!template || !start || !end) return ms.tasks;
    const expanded = applyMilestoneTemplate(template, { startDate: start, endDate: end });
    const existing = ms.tasks || [];

    const manuallyEdited = existing.filter(
      t =>
        (t.title && t.title !== t.lastAutoTitle) ||
        (t.dueOn && t.dueOn !== t.lastAutoDueOn),
    );

    const autoTasks = expanded.tasks.map(t => ({
      title: t.title,
      dueOn: t.dueOn,
      description: "",
      lastAutoTitle: t.title,
      lastAutoDueOn: t.dueOn,
    }));

    const merged = [...autoTasks, ...manuallyEdited];
    return merged.length ? merged : [emptyTask()];
  }

  function updateMilestone(idx, patch) {
    setMilestones(ms =>
      ms.map((m, i) => {
        if (i !== idx) return m;
        const next = { ...m, ...patch };
        // If start / end changed and a template is selected, recompute.
        const affectsDates = "startDate" in patch || "dueOn" in patch;
        if (affectsDates && next.templateId) {
          const template = templates.find(t => t.id === next.templateId);
          const start = next.startDate || startsOn;
          const end = next.dueOn;
          if (template && start && end) {
            next.tasks = computeTasksFromTemplate(next, template, { start, end });
          }
        }
        return next;
      }),
    );
  }

  function applyTemplateToMilestone(idx, templateId) {
    setMilestones(ms =>
      ms.map((m, i) => {
        if (i !== idx) return m;
        if (!templateId) return { ...m, templateId: "" };
        const template = templates.find(t => t.id === templateId);
        if (!template) return m;
        const start = m.startDate || startsOn;
        const end = m.dueOn;
        const hasContent =
          m.tasks.some(t => t.title.trim()) || m.name.trim();
        if (hasContent && !confirm(`Load "${template.name}" template? Existing tasks will be replaced (manual edits are kept).`)) {
          return m;
        }
        const next = { ...m, templateId };
        if (!next.name.trim()) next.name = template.name;
        if (start && end) {
          next.tasks = computeTasksFromTemplate(m, template, { start, end });
        }
        return next;
      }),
    );
  }

  function updateTask(mIdx, tIdx, patch) {
    setMilestones(ms =>
      ms.map((m, i) =>
        i === mIdx
          ? { ...m, tasks: m.tasks.map((t, j) => (j === tIdx ? { ...t, ...patch } : t)) }
          : m,
      ),
    );
  }
  function addMilestone() {
    setMilestones(ms => [...ms, emptyMilestone()]);
  }
  function removeMilestone(idx) {
    setMilestones(ms => (ms.length <= 1 ? ms : ms.filter((_, i) => i !== idx)));
  }
  function addTask(mIdx) {
    setMilestones(ms =>
      ms.map((m, i) => (i === mIdx ? { ...m, tasks: [...m.tasks, emptyTask()] } : m)),
    );
  }
  function removeTask(mIdx, tIdx) {
    setMilestones(ms =>
      ms.map((m, i) =>
        i === mIdx
          ? { ...m, tasks: m.tasks.length <= 1 ? m.tasks : m.tasks.filter((_, j) => j !== tIdx) }
          : m,
      ),
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);

    const cleanMilestones = milestones
      .filter(m => m.name.trim())
      .map(m => ({
        name: m.name.trim(),
        dueOn: m.dueOn || undefined,
        tasks: m.tasks
          .filter(t => t.title.trim())
          .map(t => ({
            title: t.title.trim(),
            dueOn: t.dueOn || undefined,
            description: t.description.trim() || undefined,
          })),
      }));

    if (!title.trim()) {
      setError("Project title is required");
      setSubmitting(false);
      return;
    }
    if (cleanMilestones.length === 0) {
      setError("At least one milestone with a name is required");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/teamleader/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: {
            title: title.trim(),
            description: description.trim() || undefined,
            startsOn: startsOn || undefined,
            customerType: customerId.trim() ? customerType : undefined,
            customerId: customerId.trim() || undefined,
          },
          milestones: cleanMilestones,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        setResult(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Create Teamleader project</h1>
        <button type="button" onClick={() => router.push("/")} style={smallBtn}>
          ← Dashboard
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={section}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={label}>Project title *</label>
              <input
                style={input}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Antwerpen Moos — 2026 Retainer"
                autoFocus
              />
            </div>
            <div>
              <label style={label}>Description</label>
              <textarea
                style={{ ...input, minHeight: 64, resize: "vertical" }}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Start date</label>
                <input
                  style={input}
                  type="date"
                  value={startsOn}
                  onChange={e => setStartsOn(e.target.value)}
                />
              </div>
              <div>
                <label style={label}>Customer type</label>
                <select
                  style={input}
                  value={customerType}
                  onChange={e => setCustomerType(e.target.value)}
                >
                  <option value="company">Company</option>
                  <option value="contact">Contact</option>
                </select>
              </div>
              <div>
                <label style={label}>Customer UUID</label>
                <input
                  style={input}
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  placeholder="optional"
                />
              </div>
            </div>
          </div>
        </div>

        {milestones.map((ms, mIdx) => (
          <div key={mIdx} style={section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Milestone {mIdx + 1}
              </div>
              <button type="button" onClick={() => removeMilestone(mIdx)} style={smallBtn} disabled={milestones.length <= 1}>
                Remove
              </button>
            </div>

            {templates.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={label}>Load from template</label>
                <select
                  style={input}
                  value={ms.templateId || ""}
                  onChange={e => applyTemplateToMilestone(mIdx, e.target.value)}
                >
                  <option value="">— none —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={label}>Name *</label>
                <input
                  style={input}
                  value={ms.name}
                  onChange={e => updateMilestone(mIdx, { name: e.target.value })}
                  placeholder="e.g. Socials"
                />
              </div>
              <div>
                <label style={label}>Start date</label>
                <input
                  style={input}
                  type="date"
                  value={ms.startDate}
                  onChange={e => updateMilestone(mIdx, { startDate: e.target.value })}
                  placeholder={startsOn}
                />
              </div>
              <div>
                <label style={label}>End / due date</label>
                <input
                  style={input}
                  type="date"
                  value={ms.dueOn}
                  onChange={e => updateMilestone(mIdx, { dueOn: e.target.value })}
                />
              </div>
            </div>

            {ms.tasks.map((t, tIdx) => (
              <div
                key={tIdx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr auto",
                  gap: 8,
                  marginBottom: 8,
                  alignItems: "end",
                }}
              >
                <div>
                  <label style={label}>Task {tIdx + 1}</label>
                  <input
                    style={input}
                    value={t.title}
                    onChange={e => updateTask(mIdx, tIdx, { title: e.target.value })}
                    placeholder="Task title"
                  />
                </div>
                <div>
                  <label style={label}>Due</label>
                  <input
                    style={input}
                    type="date"
                    value={t.dueOn}
                    onChange={e => updateTask(mIdx, tIdx, { dueOn: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeTask(mIdx, tIdx)}
                  style={smallBtn}
                  disabled={ms.tasks.length <= 1}
                >
                  ×
                </button>
              </div>
            ))}

            <button type="button" onClick={() => addTask(mIdx)} style={smallBtn}>
              + Add task
            </button>
          </div>
        ))}

        <button type="button" onClick={addMilestone} style={{ ...smallBtn, marginBottom: 24 }}>
          + Add milestone
        </button>

        {error && (
          <div style={{ color: "#d33", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: 12,
            background: "#121212",
            color: "white",
            border: "none",
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 500,
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.6 : 1,
            fontFamily: "inherit",
          }}
        >
          {submitting ? "Creating…" : "Create in Teamleader"}
        </button>
      </form>

      {result && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 6,
            background: result.success ? "#eefaf1" : "#fff4e5",
            border: `1px solid ${result.success ? "#b7e4c4" : "#f2c48b"}`,
            fontSize: 13,
          }}
        >
          {result.success ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Created in Teamleader</div>
              <div>Project ID: <code>{result.projectId}</code></div>
              <div>Milestones: {result.milestones?.length || 0}</div>
              <div>Tasks: {result.taskIds?.length || 0}</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Partial failure</div>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
