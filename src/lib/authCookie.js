// Simple HMAC-based cookie signing.
// If the sheet password changes, old cookies invalidate automatically because
// the password is part of the signed payload.

import crypto from 'node:crypto';

const SECRET = process.env.ROADMAP_AUTH_SECRET || 'dev-secret-change-me';

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

export function roadmapToken(clientId, projectId, password) {
  return sign(`roadmap:${clientId}:${projectId}:${password}`);
}

export function adminToken(adminPassword) {
  return sign(`admin:${adminPassword}`);
}

export function roadmapCookieName(clientId, projectId) {
  return `ra_${clientId}_${projectId}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

export const ADMIN_COOKIE = 'ra_admin';

// ── API route auth ──────────────────────────────────────────────────────────
// Checks admin cookie OR ?key= query param (for cron/Zapier).
// Returns true if authorised, false otherwise.
export function isAdminAuthed(request, cookieStore) {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) return true; // no password configured → open (dev mode)

  // 1. Check ?key= query param (for automated calls)
  const { searchParams } = new URL(request.url);
  const apiKey = searchParams.get('key');
  if (apiKey && apiKey === process.env.API_SECRET) return true;

  // 2. Check admin cookie (for browser access)
  if (cookieStore) {
    const cookieVal = cookieStore.get(ADMIN_COOKIE)?.value;
    if (cookieVal === adminToken(adminPass)) return true;
  }

  return false;
}
