"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientPicker({ clients }) {
  const router = useRouter();
  const [selected, setSelected] = useState(clients[0]?.id ?? "");

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '16px'
    }}>
      <h1>Agency Dashboard</h1>

      <div style={{ display: 'flex', gap: '8px' }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{
            padding: '10px 16px', fontSize: '15px', borderRadius: '4px',
            border: '1px solid #ccc', background: '#fff', cursor: 'pointer',
            minWidth: '200px'
          }}
        >
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <button
          onClick={() => selected && router.push(`/roadmap/${selected}`)}
          style={{
            padding: '10px 24px', fontSize: '15px', borderRadius: '4px',
            background: '#121212', color: 'white', border: 'none', cursor: 'pointer'
          }}
        >
          View Roadmap →
        </button>
      </div>
    </div>
  );
}
