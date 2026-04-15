import { fetchSheetRows, buildClientRoadmapFromRows } from "@/lib/googleSheets";
import RoadmapContainer from "@/components/roadmap/RoadmapContainer";

export default async function ProjectRoadmapPage({ params, searchParams }) {
  const { clientId, projectId } = await params;
  const sp = (await searchParams) || {};
  const showBuilder = sp.edit === "1";

  let clientData = null;

  try {
    const rows = await fetchSheetRows();
    clientData = buildClientRoadmapFromRows(rows, clientId, projectId);
  } catch (err) {
    console.warn("[Sheet] Failed to fetch:", err.message);
  }

  if (!clientData) {
    return <div style={{ padding: 40 }}>Roadmap not found for: {clientId} / {projectId}</div>;
  }

  return <RoadmapContainer clientData={clientData} showBuilder={showBuilder} />;
}
