"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { applyMilestoneTemplate } from "@/lib/applyMilestoneTemplate";

const input = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const label = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#555",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
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

const primaryBtn = { ...smallBtn, background: "#121212", color: "white", border: "none" };
const section = { background: "white", padding: 16, borderRadius: 8, border: "1px solid #eee" };

function slugify(s) {
  return s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60);
}

function emptyPattern(kind = "monthly") {
  if (kind === "monthly") return { kind, title: "", dayOfMonth: 1 };
  if (kind === "everyNMonths") return { kind, title: "", everyMonths: 2, dayOfMonth: 1 };
  return { kind: "once", title: "", position: "end" };
}

function emptyTemplate() {
  return { id: "", name: "", patterns: [emptyPattern("monthly")], _isNew: true };
}

export default function ManageTemplatesForm({ initialTemplates }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates || []);
  const [selectedId, setSelectedId] = useState(initialTemplates?.[0]?.id || null);
  const [draft, setDraft] = useState(() => {
    if (initialTemplates?.[0]) return { ...initialTemplates[0] };
    return emptyTemplate();
  });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previewStart, setPreviewStart] = useState("2026-01-01");
  const [previewEnd, setPreviewEnd] = useState("2026-12-31");

  function pickTemplate(id) {
    const t = templates.find(x => x.id === id);
    if (t) {
      setDraft({ ...t });
      setSelectedId(id);
      setStatus(null);
    }
  }

  function newTemplate() {
    setDraft(emptyTemplate());
    setSelectedId(null);
    setStatus(null);
  }

  function updatePattern(idx, patch) {
    setDraft(d => ({
      ...d,
      patterns: d.patterns.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  }
  function changePatternKind(idx, kind) {
    setDraft(d => ({
      ...d,
      patterns: d.patterns.map((p, i) => (i === idx ? { ...emptyPattern(kind), title: p.title } : p)),
    }));
  }
  function addPattern() {
    setDraft(d => ({ ...d, patterns: [...d.patterns, emptyPattern("monthly")] }));
  }
  function removePattern(idx) {
    setDraft(d => ({
      ...d,
      patterns: d.patterns.length <= 1 ? d.patterns : d.patterns.filter((_, i) => i !== idx),
    }));
  }

  async function save() {
    if (!draft.name.trim()) { setStatus({ kind: "error", msg: "Name is required" }); return; }
    const id = draft._isNew ? slugify(draft.id || draft.name) : draft.id;
    if (!id) { setStatus({ kind: "error", msg: "ID could not be generated" }); return; }

    setBusy(true);
    setStatus(null);
    try {
      const body = { id, name: draft.name.trim(), patterns: draft.patterns };
      const res = await fetch("/api/admin/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const saved = data.template;
      setTemplates(ts => {
        const idx = ts.findIndex(t => t.id === saved.id);
        if (idx >= 0) {
          const next = [...ts];
          next[idx] = saved;
          return next;
        }
        return [...ts, saved];
      });
      setDraft({ ...saved });
      setSelectedId(saved.id);
      setStatus({ kind: "ok", msg: "Saved" });
    } catch (err) {
      setStatus({ kind: "error", msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selectedId) return;
    if (!confirm(`Delete template "${draft.name}"? This cannot be undone.`)) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/templates?id=${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setTemplates(ts => ts.filter(t => t.id !== selectedId));
      setSelectedId(null);
      setDraft(emptyTemplate());
      setStatus({ kind: "ok", msg: "Deleted" });
    } catch (err) {
      setStatus({ kind: "error", msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  const preview = useMemo(() => {
    try {
      return applyMilestoneTemplate(draft, { startDate: previewStart, endDate: previewEnd });
    } catch {
      return { name: draft.name, tasks: [] };
    }
  }, [draft, previewStart, previewEnd]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Milestone templates</h1>
        <button type="button" onClick={() => router.push("/")} style={smallBtn}>← Dashboard</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
        {/* Sidebar list */}
        <div style={{ ...section, alignSelf: "start", padding: 12 }}>
          <button type="button" onClick={newTemplate} style={{ ...primaryBtn, width: "100%", marginBottom: 8 }}>
            + New template
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {templates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t.id)}
                style={{
                  ...smallBtn,
                  textAlign: "left",
                  background: t.id === selectedId ? "#f4f4f4" : "white",
                  border: t.id === selectedId ? "1px solid #121212" : "1px solid #eee",
                }}
              >
                {t.name}
              </button>
            ))}
            {templates.length === 0 && (
              <div style={{ color: "#999", fontSize: 12, padding: "8px 4px" }}>No templates yet</div>
            )}
          </div>
        </div>

        {/* Editor */}
        <div>
          <div style={{ ...section, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={label}>Name</label>
                <input
                  style={input}
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="Socials"
                />
              </div>
              <div>
                <label style={label}>ID (slug)</label>
                <input
                  style={{ ...input, background: draft._isNew ? "white" : "#f4f4f4" }}
                  value={draft._isNew ? draft.id : draft.id}
                  disabled={!draft._isNew}
                  onChange={e => setDraft(d => ({ ...d, id: slugify(e.target.value) }))}
                  placeholder={draft._isNew ? "(auto from name)" : ""}
                />
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>
              Patterns
            </div>

            {draft.patterns.map((p, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 8,
                  background: "#fafafa",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={label}>Kind</label>
                    <select
                      style={input}
                      value={p.kind}
                      onChange={e => changePatternKind(idx, e.target.value)}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="everyNMonths">Every N months</option>
                      <option value="once">Once</option>
                    </select>
                  </div>
                  <div>
                    <label style={label}>Title</label>
                    <input
                      style={input}
                      value={p.title}
                      onChange={e => updatePattern(idx, { title: e.target.value })}
                      placeholder={
                        p.kind === "once"
                          ? "Einde"
                          : p.kind === "monthly"
                          ? "Inplannen {month}"
                          : "Opmaak {month} en {monthPlus1}"
                      }
                    />
                  </div>
                  <div style={{ alignSelf: "end" }}>
                    <button
                      type="button"
                      onClick={() => removePattern(idx)}
                      style={smallBtn}
                      disabled={draft.patterns.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {(p.kind === "monthly" || p.kind === "everyNMonths") && (
                    <div>
                      <label style={label}>Day of month</label>
                      <input
                        style={input}
                        type="number"
                        min="1"
                        max="31"
                        value={p.dayOfMonth ?? 1}
                        onChange={e => updatePattern(idx, { dayOfMonth: Number(e.target.value) })}
                      />
                    </div>
                  )}
                  {p.kind === "everyNMonths" && (
                    <div>
                      <label style={label}>Every N months</label>
                      <input
                        style={input}
                        type="number"
                        min="1"
                        max="24"
                        value={p.everyMonths ?? 2}
                        onChange={e => updatePattern(idx, { everyMonths: Number(e.target.value) })}
                      />
                    </div>
                  )}
                  {p.kind === "once" && (
                    <>
                      <div>
                        <label style={label}>Position</label>
                        <select
                          style={input}
                          value={p.position || "end"}
                          onChange={e => updatePattern(idx, { position: e.target.value })}
                        >
                          <option value="start">Start</option>
                          <option value="end">End</option>
                          <option value="offsetDays">Offset from start</option>
                        </select>
                      </div>
                      {p.position === "offsetDays" && (
                        <div>
                          <label style={label}>Offset (days)</label>
                          <input
                            style={input}
                            type="number"
                            value={p.offsetDays ?? 0}
                            onChange={e => updatePattern(idx, { offsetDays: Number(e.target.value) })}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                  Placeholders: <code>{"{month}"}</code> <code>{"{monthPlus1}"}</code>{" "}
                  <code>{"{monthPlus2}"}</code> <code>{"{year}"}</code>
                </div>
              </div>
            ))}

            <button type="button" onClick={addPattern} style={smallBtn}>
              + Add pattern
            </button>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={save} disabled={busy} style={primaryBtn}>
                {busy ? "Saving…" : "Save template"}
              </button>
              {!draft._isNew && selectedId && (
                <button type="button" onClick={remove} disabled={busy} style={smallBtn}>
                  Delete
                </button>
              )}
              {status && (
                <div
                  style={{
                    alignSelf: "center",
                    color: status.kind === "ok" ? "#1a6b3a" : "#d33",
                    fontSize: 13,
                  }}
                >
                  {status.msg}
                </div>
              )}
            </div>
          </div>

          {/* Preview panel */}
          <div style={section}>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>
              Preview
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div>
                <label style={label}>Milestone start</label>
                <input style={input} type="date" value={previewStart} onChange={e => setPreviewStart(e.target.value)} />
              </div>
              <div>
                <label style={label}>Milestone end</label>
                <input style={input} type="date" value={previewEnd} onChange={e => setPreviewEnd(e.target.value)} />
              </div>
            </div>

            {preview.tasks.length === 0 ? (
              <div style={{ color: "#888", fontSize: 13 }}>
                No tasks generated — check dates and patterns.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13 }}>
                {preview.tasks.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 1fr",
                      padding: "4px 8px",
                      borderBottom: "1px solid #f4f4f4",
                    }}
                  >
                    <code style={{ color: "#666" }}>{t.dueOn}</code>
                    <div>{t.title}</div>
                  </div>
                ))}
                <div style={{ color: "#888", fontSize: 12, marginTop: 6 }}>
                  {preview.tasks.length} task{preview.tasks.length === 1 ? "" : "s"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
