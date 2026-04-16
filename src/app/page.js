import { cookies } from "next/headers";
import { fetchSheetRows, getAllClientsFromRows } from "@/lib/googleSheets";
import { adminToken, ADMIN_COOKIE } from "@/lib/authCookie";
import ClientPicker from "@/components/ClientPicker";
import LoginForm from "@/components/LoginForm";

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Gate the dashboard behind ADMIN_PASSWORD
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminPass) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(ADMIN_COOKIE)?.value;
    const authed = cookieVal === adminToken(adminPass);
    if (!authed) return <LoginForm adminMode />;
  }

  let clients = [];

  try {
    const rows = await fetchSheetRows();
    clients = getAllClientsFromRows(rows);
  } catch (err) {
    console.warn("[Home] Sheet fetch failed:", err.message);
  }

  return <ClientPicker clients={clients} />;
}
