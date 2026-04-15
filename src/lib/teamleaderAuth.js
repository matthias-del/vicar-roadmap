// src/lib/teamleaderAuth.js
// Manages Teamleader OAuth tokens with automatic refresh.
//
// Storage backends (auto-selected):
//   • Production (Vercel): Upstash KV via REST API — tokens survive refreshes
//     across cold starts. Requires KV_REST_API_URL + KV_REST_API_TOKEN env vars.
//   • Local dev: src/data/tl-tokens.json on disk.

import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(process.cwd(), 'src/data/tl-tokens.json');
const KV_KEY     = 'teamleader:tokens';

const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// ── Upstash KV REST helpers ───────────────────────────────────────────────────
async function kvGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`KV GET failed: ${res.status} ${await res.text()}`);
  const { result } = await res.json();
  if (result == null) return null;
  try { return JSON.parse(result); } catch { return result; }
}

async function kvSet(key, value) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`KV SET failed: ${res.status} ${await res.text()}`);
}

// ── File-based fallback (local dev) ───────────────────────────────────────────
function fileGet() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function fileSet(data) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

// ── Public API ────────────────────────────────────────────────────────────────
async function readTokens() {
  return USE_KV ? await kvGet(KV_KEY) : fileGet();
}

async function writeTokens(data) {
  if (USE_KV) await kvSet(KV_KEY, data);
  else fileSet(data);
  return data;
}

export async function saveTokens({ access_token, refresh_token, expires_in }) {
  return writeTokens({
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
  });
}

async function refreshAccessToken(refresh_token) {
  const res = await fetch('https://focus.teamleader.eu/oauth2/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.TEAMLEADER_CLIENT_ID,
      client_secret: process.env.TEAMLEADER_CLIENT_SECRET,
      refresh_token,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  return saveTokens(await res.json());
}

// Returns a valid access token — refreshes automatically if <60s remain.
export async function getValidToken() {
  const tokens = await readTokens();

  if (!tokens) {
    throw new Error(
      USE_KV
        ? 'No tokens in KV. Seed via POST /api/auth/seed or OAuth connect flow.'
        : 'No tokens found. Visit http://localhost:3000/api/auth/connect to authorize.'
    );
  }

  if (Date.now() >= tokens.expires_at - 60_000) {
    console.log('[TeamleaderAuth] Token expired — refreshing...');
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    return refreshed.access_token;
  }

  return tokens.access_token;
}
