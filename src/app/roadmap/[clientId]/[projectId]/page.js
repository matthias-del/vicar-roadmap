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
  const expectedPassword = getRoadmapPassword(rows, clientId, projectId);
  let clientAuthed = !expectedPassword; // empty/missing password → public
  if (expectedPassword) {
    const cookieVal = cookieStore.get(roadmapCookieName(clientId, projectId))?.value;
    clientAuthed = cookieVal === roadmapToken(clientId, projectId, expectedPassword);
  }

  if (!clientAuthed) {
    return <LoginForm clientId={clientId} projectId={projectId} />;
  }

  // ── Admin auth check (only when ?edit=1) ──────────────────────────────────
  let adminAuthed = false;
  if (wantsBuilder) {
    const adminPass = process.env.ADMIN_PASSWORD;
    if (adminPass) {
      const cookieVal = cookieStore.get(ADMIN_COOKIE)?.value;
      adminAuthed = cookieVal === adminToken(adminPass);
    }
    if (!adminAuthed) {
      return <LoginForm clientId={clientId} projectId={projectId} adminMode />;
    }
  }

  return <RoadmapContainer clientData={clientData} showBuilder={wantsBuilder && adminAuthed} />;
}
