"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientPicker({ clients }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();
  const filtered = q
    ? clients.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.projects.some(p => p.title.toLowerCase().includes(q))
      )
    : clients;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100vh', gap: '24px',
      padding: '40px 24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '480px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>Agency Dashboard</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => router.push('/admin/templates')}
            style={{
              padding: '8px 12px', fontSize: '13px', fontWeight: 500,
              background: 'white', color: '#121212', border: '1px solid #ccc',
              borderRadius: '6px', cursor: 'pointer',
            }}
          >
            Templates
          </button>
          <button
            onClick={() => router.push('/admin/passwords')}
            style={{
              padding: '8px 12px', fontSize: '13px', fontWeight: 500,
              background: 'white', color: '#121212', border: '1px solid #ccc',
              borderRadius: '6px', cursor: 'pointer',
            }}
          >
            Passwords
          </button>
          <button
            onClick={() => router.push('/admin/create-project')}
            style={{
              padding: '8px 12px', fontSize: '13px', fontWeight: 500,
              background: '#121212', color: 'white', border: 'none',
              borderRadius: '6px', cursor: 'pointer',
            }}
          >
            + New project
          </button>
        </div>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search clients or projects..."
        style={{
          width: '100%', maxWidth: '480px',
          padding: '10px 14px', fontSize: '14px',
          borderRadius: '6px', border: '1px solid #e5e5e5',
          outline: 'none',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#121212'; }}
        onBlur={e => { e.currentTarget.style.borderColor = '#e5e5e5'; }}
      />

      <div style={{
        display: 'flex', flexDirection: 'column', gap: '24px',
        width: '100%', maxWidth: '480px',
        flex: 1, overflowY: 'auto',
      }}>
        {filtered.map(client => (
          <div key={client.id}>
            <div style={{
              fontSize: '13px', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: '#888', marginBottom: '8px',
            }}>
              {client.name}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {client.projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => router.push(`/roadmap/${client.id}/${project.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '12px 16px', fontSize: '14px', borderRadius: '6px',
                    background: '#fff', border: '1px solid #e5e5e5',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#121212'; e.currentTarget.style.background = '#fafafa'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.background = '#fff'; }}
                >
                  <span style={{ fontSize: '16px' }}>→</span>
                  <span>{project.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && search && (
          <p style={{ color: '#888', textAlign: 'center' }}>No matches for "{search}"</p>
        )}

        {clients.length === 0 && (
          <p style={{ color: '#888', textAlign: 'center' }}>No roadmaps found in the sheet.</p>
        )}
      </div>

      <div style={{ fontSize: '12px', color: '#aaa' }}>
        {filtered.length} of {clients.length} clients
      </div>
    </div>
  );
}
