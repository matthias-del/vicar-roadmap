import { NextResponse } from 'next/server';
import { saveTokens } from '@/lib/teamleaderAuth';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return new Response(`<h1>OAuth Error</h1><p>${error}</p>`, { headers: { 'Content-Type': 'text/html' }, status: 400 });
  }

  if (!code) {
    return new Response('<h1>No code received</h1>', { headers: { 'Content-Type': 'text/html' }, status: 400 });
  }

  const clientId = process.env.TEAMLEADER_CLIENT_ID?.trim();
  const clientSecret = process.env.TEAMLEADER_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TEAMLEADER_REDIRECT_URI?.trim();

  const tokenRes = await fetch('https://focus.teamleader.eu/oauth2/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return new Response(`<h1>Token exchange failed</h1><pre>${errText}</pre>`, {
      headers: { 'Content-Type': 'text/html' },
      status: 500,
    });
  }

  const tokens = await tokenRes.json();

  // ✅ Persist tokens (KV in prod, file in dev) — auto-refresh handles expiry from here
  await saveTokens(tokens);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Teamleader Connected</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 80px auto; padding: 20px; text-align: center; }
    h1 { color: #1a7a5e; font-size: 2rem; margin-bottom: 8px; }
    p { color: #555; font-size: 1.1rem; }
    .badge { display: inline-block; background: #e6f4ef; color: #1a7a5e; border-radius: 20px; padding: 8px 20px; font-weight: 600; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>✅ Teamleader Connected</h1>
  <p>Tokens saved successfully. The roadmap will now sync automatically.</p>
  <div class="badge">You can close this tab</div>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
