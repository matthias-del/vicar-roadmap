"use client";

import { useRouter } from "next/navigation";

export default function ClientPicker({ clients }) {
  const router = useRouter();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: '32px',
      padding: '40px 24px',
    }}>
      <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>Agency Dashboard</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: '480px' }}>
        {clients.map(client => (
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

        {clients.length === 0 && (
          <p style={{ color: '#888', textAlign: 'center' }}>No roadmaps found in the sheet.</p>
        )}
      </div>
    </div>
  );
}
