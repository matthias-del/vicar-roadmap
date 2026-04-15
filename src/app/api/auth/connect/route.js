import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.TEAMLEADER_CLIENT_ID?.trim();
  const redirectUri = process.env.TEAMLEADER_REDIRECT_URI?.trim();

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Missing TEAMLEADER_CLIENT_ID or TEAMLEADER_REDIRECT_URI env vars' }, { status: 500 });
  }

  const authUrl = new URL('https://focus.teamleader.eu/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', 'vicar-roadmap-' + Date.now());

  return NextResponse.redirect(authUrl.toString());
}
