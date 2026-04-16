import { cookies } from "next/headers";
import { fetchSheetRows, buildClientRoadmapFromRows, getRoadmapPassword } from "@/lib/googleSheets";
import { roadmapToken, adminToken, roadmapCookieName, ADMIN_COOKIE } from "@/lib/authCookie";
import RoadmapContainer from "@/components/roadmap/RoadmapContainer";
import LoginForm from "@/components/LoginForm";

export default async function ProjectRoadmapPage({ params, searchParams }) {
  const { clientId, projectId } = await params;
  const sp = (await searchParams) || {};
  const wantsBuilder = sp.edit === "1";

  let rows = [];
  let clientData = null;

  try {
    rows = await fetchSheetRows();
    clientData = buildClientRoadmapFromRows(rows, clientId, projectId);
  } catch (err) {
    console.warn("[Sheet] Failed to fetch:", err.message);
  }

  if (!clientData) {
    return <div style={{ padding: 40 }}>Roadmap not found for: {clientId} / {projectId}</div>;
  }

  const cookieStore = await cookies();

  // ── Client-roadmap auth check ─────────────────────────────────────────────
  // Admin cookie always grants access to any roadmap.
  const adminPass = process.env.ADMIN_PASSWORD;
  let isAdmin = false;
  if (adminPass) {
    const adminCookieVal = cookieStore.get(ADMIN_COOKIE)?.value;
    isAdmin = adminCookieVal === adminToken(adminPass);
  }

  const expectedPassword = getRoadmapPassword(rows, clientId, projectId);
  let clientAuthed = false;

  if (isAdmin) {
    clientAuthed = true;
  } else if (expectedPassword) {
    // Client has a dedicated password → check their cookie.
    const cookieVal = cookieStore.get(roadmapCookieName(clientId, projectId))?.value;
    clientAuthed = cookieVal === roadmapToken(clientId, projectId, expectedPassword);
  }
  // No password configured + not admin → locked (must set a password first).

  if (!clientAuthed) {
    return <LoginForm clientId={clientId} projectId={projectId} />;
  }

  // ── Admin auth check (only when ?edit=1) ──────────────────────────────────
  if (wantsBuilder && !isAdmin) {
    return <LoginForm clientId={clientId} projectId={projectId} adminMode />;
  }

  return <RoadmapContainer clientData={clientData} showBuilder={wantsBuilder && isAdmin} />;
}
