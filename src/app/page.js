import { fetchSheetRows, getAllClientsFromRows } from "@/lib/googleSheets";
import { getAllClients } from "@/data/mockRoadmapData";
import ClientPicker from "@/components/ClientPicker";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const localClients = getAllClients().map(c => ({ id: c.id, name: c.name }));
  let sheetClients = [];

  try {
    const rows = await fetchSheetRows();
    sheetClients = getAllClientsFromRows(rows);
  } catch (err) {
    console.warn("[Home] Sheet fetch failed:", err.message);
  }

  const seen = new Set(sheetClients.map(c => c.id));
  const clients = [
    ...sheetClients,
    ...localClients.filter(c => !seen.has(c.id)),
  ];

  return <ClientPicker clients={clients} />;
}
