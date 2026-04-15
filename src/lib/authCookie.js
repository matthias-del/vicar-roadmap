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
