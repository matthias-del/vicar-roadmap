// POST /api/auth/seed
// One-time endpoint to seed Vercel KV with Teamleader OAuth tokens.
//
// Headers:  x-seed-secret: <SEED_SECRET env var>
// Body:     { "access_token": "...", "refresh_token": "...", "expires_at": 1712345678901 }
//
// Safe to delete after first successful seed. In the meantime, the SEED_SECRET
// env var acts as a gate so nobody else can overwrite the stored tokens.

import { NextResponse } from 'next/server';

export async function POST(request) {
  const expected = process.env.SEED_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'SEED_SECRET not configured on server' }, { status: 500 });
  }
  if (request.headers.get('x-seed-secret') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { access_token, refresh_token, expires_at } = await request.json();
  if (!access_token || !refresh_token || !expires_at) {
    return NextResponse.json(
      { error: 'Body must include access_token, refresh_token, expires_at' },
      { status: 400 },
    );
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return NextResponse.json({ error: 'KV not configured on server' }, { status: 500 });
  }

  const res = await fetch(`${url}/set/teamleader:tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ access_token, refresh_token, expires_at }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: 'KV write failed', detail: await res.text() },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    expiresInSeconds: Math.round((expires_at - Date.now()) / 1000),
  });
}
