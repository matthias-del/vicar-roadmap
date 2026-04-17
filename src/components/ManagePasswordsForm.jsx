"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontFamily: "inherit",
  boxSizing: "border-box",
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

export default function ManagePasswordsForm({ rows }) {
  const router = useRouter();
  const [status, setStatus] = useState({});
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState({});

  function keyFor(r) {
    return `${r.clientId}/${r.projectId}`;
  }

  async function save(r) {
    const key = keyFor(r);
    const password = (values[key] || "").trim();
    if (!password) {
      setStatus(s => ({ ...s, [key]: { kind: "error", msg: "Enter a password" } }));
      return;
    }
    setBusy(b => ({ ...b, [key]: true }));
    setStatus(s => ({ ...s, [key]: null }));
    try {
      const res = await fetch("/api/admin/passwords", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: r.clientId, projectId: r.projectId, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setStatus(s => ({ ...s, [key]: { kind: "ok", msg: "Saved" } }));
      setValues(v => ({ ...v, [key]: "" }));
      r.hasPassword = true;
    } catch (err) {
      setStatus(s => ({ ...s, [key]: { kind: "error", msg: err.message } }));
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  }

  async function clearPassword(r) {
    const key = keyFor(r);
    if (!confirm(`Remove password for ${r.clientName} — ${r.projectTitle}? The roadmap will be locked until you set a new one.`)) return;
    setBusy(b => ({ ...b, [key]: true }));
    setStatus(s => ({ ...s, [key]: null }));
    try {
      const url = `/api/admin/passwords?clientId=${encodeURIComponent(r.clientId)}&projectId=${encodeURIComponent(r.projectId)}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setStatus(s => ({ ...s, [key]: { kind: "ok", msg: "Removed" } }));
      r.hasPassword = false;
    } catch (err) {
      setStatus(s => ({ ...s, [key]: { kind: "error", msg: err.message } }));
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  }

  const grouped = rows.reduce((acc, r) => {
    (acc[r.clientName] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Roadmap passwords</h1>
        <button type="button" onClick={() => router.push("/")} style={smallBtn}>← Dashboard</button>
      </div>
      <p style={{ fontSize: 13, color: "#666", marginTop: 0, marginBottom: 24 }}>
        Passwords are stored in KV (no env var edits needed). A roadmap without a password is locked for everyone except admins.
      </p>

      {Object.keys(grouped).length === 0 && (
        <p style={{ color: "#888" }}>No projects found in the sheet.</p>
      )}

      {Object.entries(grouped).map(([clientName, clientRows]) => (
        <div key={clientName} style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.08em", color: "#888", marginBottom: 8,
          }}>
            {clientName}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {clientRows.map(r => {
              const key = keyFor(r);
              const st = status[key];
              return (
                <div key={key} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr auto auto",
                  gap: 8, alignItems: "center",
                  padding: "10px 12px",
                  background: "white",
                  border: "1px solid #eee",
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 14 }}>{r.projectTitle}</div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px",
                    borderRadius: 10,
                    background: r.hasPassword ? "#eefaf1" : "#fff2f2",
                    color: r.hasPassword ? "#1a6b3a" : "#a33",
                  }}>
                    {r.hasPassword ? "set" : "none"}
                  </div>
                  <input
                    type="text"
                    placeholder={r.hasPassword ? "Enter new password to replace" : "Enter password"}
                    value={values[key] || ""}
                    onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
                    style={input}
                  />
                  <button
                    type="button"
                    onClick={() => save(r)}
                    disabled={busy[key]}
                    style={{ ...smallBtn, background: "#121212", color: "white", border: "none" }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => clearPassword(r)}
                    disabled={busy[key] || !r.hasPassword}
                    style={{ ...smallBtn, opacity: r.hasPassword ? 1 : 0.4 }}
                  >
                    Clear
                  </button>
                  {st && (
                    <div style={{
                      gridColumn: "1 / -1", fontSize: 12,
                      color: st.kind === "ok" ? "#1a6b3a" : "#d33",
                    }}>
                      {st.msg}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
