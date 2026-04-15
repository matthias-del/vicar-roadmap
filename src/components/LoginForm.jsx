"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ clientId, projectId, adminMode = false }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, projectId, password, admin: adminMode }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'white',
          padding: 32,
          borderRadius: 8,
          boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
          width: 320,
        }}
      >
        <img src="/vicar-logo.png" alt="VICAR" style={{ height: 22, marginBottom: 24 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px' }}>
          {adminMode ? 'Admin access' : 'Roadmap access'}
        </h2>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 4,
            marginBottom: 12,
            fontFamily: 'inherit',
          }}
        />
        {error && (
          <div style={{ color: '#d33', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px',
            background: '#121212',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {loading ? '…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
