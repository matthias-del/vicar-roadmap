"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import RoadmapGrid from "./RoadmapGrid";
import StatusSidebar from "./StatusSidebar";

const SIDEBAR_WIDTH = 160; // must match --sidebar-width in CSS

export default function RoadmapContainer({ clientData, showBuilder = false }) {
  const router = useRouter();
  const [zoomed, setZoomed] = useState(false);
  const containerRef = useRef(null);
  const [overviewCellWidth, setOverviewCellWidth] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    if (!zoomed) { setOverviewCellWidth(null); return; }
    const container = containerRef.current;
    if (!container) return;
    const totalWeeks = clientData.roadmap.totalWeeks;
    // Available width = container width minus padding (20px each side) minus sidebar
    const available = container.clientWidth - 40 - SIDEBAR_WIDTH - 4;
    const cellWidth = Math.max(8, Math.floor(available / totalWeeks));
    setOverviewCellWidth(cellWidth);
  }, [zoomed, clientData.roadmap.totalWeeks]);

  return (
    <div className={`roadmap-page${showBuilder ? '' : ' client-view'}`}>
      {showBuilder && <StatusSidebar roadmap={clientData.roadmap} />}

      <div className="roadmap-container" ref={containerRef}>
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
        <div className="roadmap-wrapper" style={{ overflowX: zoomed ? 'hidden' : 'auto' }}>
          <div
            className={zoomed ? 'roadmap-overview' : ''}
            style={overviewCellWidth ? { '--cell-min-width': `${overviewCellWidth}px` } : {}}
          >
            <RoadmapGrid roadmap={clientData.roadmap} />
          </div>
        </div>
      </div>
    </div>
  );
}
