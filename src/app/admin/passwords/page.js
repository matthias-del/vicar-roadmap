import { cookies } from 'next/headers';
import { adminToken, ADMIN_COOKIE } from '@/lib/authCookie';
import { fetchSheetRows, getAllClientsFromRows } from '@/lib/googleSheets';
import { getAllClientPasswords } from '@/lib/clientPasswords';
import LoginForm from '@/components/LoginForm';
import ManagePasswordsForm from '@/components/ManagePasswordsForm';

export const dynamic = 'force-dynamic';

export default async function ManagePasswordsPage() {
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
    console.warn('[admin/passwords] Sheet fetch failed:', err.message);
  }

  const stored = await getAllClientPasswords();
  const haveKeys = new Set(
    Object.entries(stored)
      .filter(([, v]) => v && v.toString().trim())
      .map(([k]) => k),
  );

  const rows = [];
  for (const c of clients) {
    for (const p of c.projects) {
      const key = `${c.id}/${p.id}`;
      rows.push({
        clientId: c.id,
        clientName: c.name,
        projectId: p.id,
        projectTitle: p.title,
        hasPassword: haveKeys.has(key),
      });
    }
  }

  return <ManagePasswordsForm rows={rows} />;
}
