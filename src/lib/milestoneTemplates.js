// Milestone templates — reusable patterns that expand into a list of tasks
// over a milestone's start → end date range.
//
// Backends (auto-selected, same pattern as clientPasswords.js):
//   • Production (Vercel): Upstash KV.
//   • Local dev: src/data/milestone-templates.json.
//
// The pure `applyMilestoneTemplate` helper lives in ./applyMilestoneTemplate so
// client components can import it without pulling in fs.

import fs from 'fs';
import path from 'path';

export { applyMilestoneTemplate } from './applyMilestoneTemplate';

const FILE = path.join(process.cwd(), 'src/data/milestone-templates.json');
const KV_KEY = 'roadmap:milestone-templates';
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

async function readAll() {
  const raw = USE_KV ? await kvGet(KV_KEY) : fileGet();
  return Array.isArray(raw) ? raw : [];
}

async function writeAll(templates) {
  if (USE_KV) await kvSet(KV_KEY, templates);
  else fileSet(templates);
  return templates;
}

export async function listTemplates() {
  return readAll();
}

export async function getTemplate(id) {
  const all = await readAll();
  return all.find(t => t.id === id) || null;
}

export async function saveTemplate(template) {
  if (!template?.id) throw new Error('template.id is required');
  const all = await readAll();
  const idx = all.findIndex(t => t.id === template.id);
  if (idx >= 0) all[idx] = template;
  else all.push(template);
  await writeAll(all);
  return template;
}

export async function deleteTemplate(id) {
  const all = await readAll();
  const next = all.filter(t => t.id !== id);
  if (next.length === all.length) return false;
  await writeAll(next);
  return true;
}

