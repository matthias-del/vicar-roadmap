"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RoadmapGrid from "./RoadmapGrid";
import StatusSidebar from "./StatusSidebar";

export default function RoadmapContainer({ clientData }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="roadmap-page">
      <StatusSidebar roadmap={clientData.roadmap} />

      <div className="roadmap-container">
        <div className="roadmap-header">
          <h1>{clientData.name}</h1>
          <div className="logo">
            <img src="/vicar-logo.png" alt="VICAR" style={{ height: '22px' }} />
          </div>
        </div>
        <div className="roadmap-wrapper">
          <RoadmapGrid roadmap={clientData.roadmap} />
        </div>
      </div>
    </div>
  );
}
