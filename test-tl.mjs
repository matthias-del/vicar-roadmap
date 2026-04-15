// Quick verification that Teamleader API + token refresh are working.
// Run: node test-tl.mjs

import fs from 'fs';

// Tiny .env.local loader
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const TOKEN_FILE = 'src/data/tl-tokens.json';

function readTokens() {
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
}

function saveTokens({ access_token, refresh_token, expires_in }) {
  const data = { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000 };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
  return data;
}

async function refreshAccessToken(refresh_token) {
  const res = await fetch('https://focus.teamleader.eu/oauth2/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.TEAMLEADER_CLIENT_ID,
      client_secret: process.env.TEAMLEADER_CLIENT_SECRET,
      refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  return saveTokens(await res.json());
}

async function getValidToken() {
  const t = readTokens();
  if (Date.now() >= t.expires_at - 60_000) {
    console.log('   (token expired — refreshing...)');
    return (await refreshAccessToken(t.refresh_token)).access_token;
  }
  return t.access_token;
}

async function tlPost(endpoint, body) {
  const token = await getValidToken();
  const res = await fetch(`https://api.focus.teamleader.eu/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok, body: res.ok ? await res.json() : await res.text() };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('1) Token refresh + users.me');
const me = await tlPost('users.me', {});
console.log('   status:', me.status);
if (!me.ok) { console.error('   ✗ failed:', me.body); process.exit(1); }
console.log('   ✓ Authenticated as:', me.body.data.first_name, me.body.data.last_name, '<' + me.body.data.email + '>');

console.log('\n2) tasks.info with integer ID 50252275 (webhook-style)');
const t1 = await tlPost('tasks.info', { id: '50252275' });
console.log('   status:', t1.status);
if (t1.ok) {
  console.log('   ✓ Task:', t1.body.data.description || t1.body.data.title);
  console.log('   UUID:', t1.body.data.id, '| completed:', t1.body.data.completed);
} else {
  console.log('   response:', String(t1.body).slice(0, 400));
}

console.log('\n3) tasks.list (first 3 tasks) — to see what IDs look like');
const list = await tlPost('tasks.list', { page: { size: 3 } });
console.log('   status:', list.status);
if (list.ok) {
  for (const t of list.body.data) {
    console.log('   -', t.id, '|', t.description?.slice(0, 50) || '(no description)', '| completed:', t.completed);
  }
}
