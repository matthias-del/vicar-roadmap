import { NextResponse } from 'next/server';
import { fetchSheetRows, getRoadmapPassword } from '@/lib/googleSheets';
import { roadmapToken, adminToken, roadmapCookieName, ADMIN_COOKIE } from '@/lib/authCookie';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { clientId, projectId, password, admin } = body || {};

  // ── Admin login (for ?edit=1) ──────────────────────────────────────────────
  if (admin) {
    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminPass) {
      return NextResponse.json({ ok: false, error: 'ADMIN_PASSWORD not configured' }, { status: 500 });
    }
    if (password !== adminPass) {
      return NextResponse.json({ ok: false, error: 'Invalid password' }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, adminToken(adminPass), {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  // ── Client-roadmap login ───────────────────────────────────────────────────
  if (!clientId || !projectId) {
    return NextResponse.json({ ok: false, error: 'Missing clientId/projectId' }, { status: 400 });
  }

  let rows;
  try {
    rows = await fetchSheetRows();
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'Sheet fetch failed' }, { status: 500 });
  }

  const expected = getRoadmapPassword(rows, clientId, projectId);
  if (!expected) {
    // No password set for this client → already public
    return NextResponse.json({ ok: true, public: true });
  }
  if (password !== expected) {
    return NextResponse.json({ ok: false, error: 'Invalid password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(roadmapCookieName(clientId, projectId), roadmapToken(clientId, projectId, expected), {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
