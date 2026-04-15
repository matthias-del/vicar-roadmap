import { fetchSheetRows, getAllClientsFromRows } from "@/lib/googleSheets";
import ClientPicker from "@/components/ClientPicker";

export const dynamic = 'force-dynamic';

export default async function Home() {
  let clients = [];

  try {
    const rows = await fetchSheetRows();
    clients = getAllClientsFromRows(rows);
  } catch (err) {
    console.warn("[Home] Sheet fetch failed:", err.message);
  }

  return <ClientPicker clients={clients} />;
}
