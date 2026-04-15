"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import RoadmapGrid from "./RoadmapGrid";
import StatusSidebar from "./StatusSidebar";

export default function RoadmapContainer({ clientData }) {
  const router = useRouter();
  const [zoomed, setZoomed] = useState(false);
  const wrapperRef = useRef(null);
  const gridRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    if (!zoomed) { setScale(1); return; }
    const wrapper = wrapperRef.current;
    const grid = gridRef.current;
    if (!wrapper || !grid) return;
    const availableWidth = wrapper.clientWidth;
    const naturalWidth = grid.scrollWidth;
    const s = Math.min(1, availableWidth / naturalWidth);
    setScale(s);
  }, [zoomed]);

  return (
    <div className="roadmap-page">
      <StatusSidebar roadmap={clientData.roadmap} />

      <div className="roadmap-container">
        <div className="roadmap-header">
          <h1>{clientData.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setZoomed(z => !z)}
              style={{
                padding: '6px 14px', fontSize: '12px', borderRadius: '4px',
                border: '1px solid #ccc', background: zoomed ? '#121212' : '#fff',
                color: zoomed ? '#fff' : '#121212', cursor: 'pointer',
                fontWeight: 500, transition: 'all 0.15s',
              }}
            >
              {zoomed ? 'Zoom In' : 'Overview'}
            </button>
            <div className="logo">
              <img src="/vicar-logo.png" alt="VICAR" style={{ height: '22px' }} />
            </div>
          </div>
        </div>
        <div className="roadmap-wrapper" ref={wrapperRef}>
          <div
            ref={gridRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: zoomed ? `${100 / scale}%` : '100%',
              transition: 'transform 0.3s ease',
            }}
          >
            <RoadmapGrid roadmap={clientData.roadmap} />
          </div>
        </div>
      </div>
    </div>
  );
}
