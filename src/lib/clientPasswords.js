// Client-roadmap password storage.
//
// Backends (auto-selected, same pattern as teamleaderAuth.js):
//   • Production (Vercel): Upstash KV. Requires KV_REST_API_URL + KV_REST_API_TOKEN.
//   • Local dev: src/data/roadmap-passwords.json on disk.
//
// Map shape: { "clientId/projectId": "password", ... }
//
// Legacy: if nothing is stored yet, falls back to the CLIENT_PASSWORDS env var
// so older deployments don't break.

import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'src/data/roadmap-passwords.json');
const KV_KEY = 'roadmap:passwords';

const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

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

function fileGet() {
  try {
    if (!fs.existsSync(FILE)) return null;
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { return null; }
}

function fileSet(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function legacyEnvMap() {
  const raw = process.env.CLIENT_PASSWORDS;
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function makeKey(clientId, projectId) {
  return projectId ? `${clientId}/${projectId}` : clientId;
}

export async function getAllClientPasswords() {
  const stored = USE_KV ? await kvGet(KV_KEY) : fileGet();
  if (stored && typeof stored === 'object') return stored;
  return legacyEnvMap();
}

export async function getClientPassword(clientId, projectId = null) {
  const map = await getAllClientPasswords();
  const value = map[makeKey(clientId, projectId)];
  return (value || '').toString().trim();
}

export async function setClientPassword(clientId, projectId, password) {
  const map = await getAllClientPasswords();
  const key = makeKey(clientId, projectId);
  const trimmed = (password || '').toString().trim();
  if (trimmed) map[key] = trimmed;
  else delete map[key];
  if (USE_KV) await kvSet(KV_KEY, map);
  else fileSet(map);
  return map;
}

export async function deleteClientPassword(clientId, projectId) {
  return setClientPassword(clientId, projectId, '');
}
