import { fetchSheetRows, buildClientRoadmapFromRows } from "@/lib/googleSheets";
import { getClientRoadmap } from "@/data/mockRoadmapData";
import RoadmapContainer from "@/components/roadmap/RoadmapContainer";

export default async function ClientRoadmapPage({ params }) {
  const { clientId } = await params;

  let clientData = null;

  // Try Google Sheet first
  try {
    const rows = await fetchSheetRows();
    clientData = buildClientRoadmapFromRows(rows, clientId);
  } catch (err) {
    console.warn("[Sheet] Failed to fetch, falling back to JSON:", err.message);
  }

  // Fall back to local JSON
  if (!clientData) {
    clientData = getClientRoadmap(clientId);
  }

  if (!clientData) {
    return <div style={{ padding: 40 }}>Client roadmap not found for: {clientId}</div>;
  }

  return <RoadmapContainer clientData={clientData} />;
}
