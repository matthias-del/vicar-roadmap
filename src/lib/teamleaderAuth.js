// src/lib/teamleaderAuth.js
// Manages Teamleader OAuth tokens with automatic refresh.
// Tokens are persisted in src/data/tl-tokens.json (local dev only).

import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(process.cwd(), 'src/data/tl-tokens.json');

function readTokens() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function saveTokens({ access_token, refresh_token, expires_in }) {
  const data = {
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
  };
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const tokens = await res.json();
  return saveTokens(tokens);
}

// Returns a valid access token — refreshes automatically if expired.
export async function getValidToken() {
  const tokens = readTokens();

  if (!tokens) {
    throw new Error('No tokens found. Visit http://localhost:3000/api/auth/connect to authorize.');
  }

  // Refresh if less than 60 seconds left
  if (Date.now() >= tokens.expires_at - 60_000) {
    console.log('[TeamleaderAuth] Token expired — refreshing...');
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    return refreshed.access_token;
  }

  return tokens.access_token;
}
