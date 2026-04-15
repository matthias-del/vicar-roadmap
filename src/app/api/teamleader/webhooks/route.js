// GET /api/teamleader/webhooks
//   ?list=1                       → list current webhook subscriptions
//   ?register=1&url=<zap-hook-url> → register V2 task+meeting events for that URL
//   ?unregister=1&url=<url>&types=<csv> → remove specific event types from a URL
//
// Teamleader Focus webhook types used by this app:
//   legacy tasks:      task.completed, task.reopened, task.updated
//   V2 nextgen tasks:  nextgenProjectsTask.completed, nextgenProjectsTask.reopened, nextgenProjectsTask.updated
//   V2 meetings:       nextgenProjectsMeeting.completed, nextgenProjectsMeeting.reopened, nextgenProjectsMeeting.updated

import { NextResponse } from 'next/server';
import { getValidToken } from '@/lib/teamleaderAuth';

const TL = 'https://api.focus.teamleader.eu';

const V2_EVENTS = [
  'nextgenProjectsTask.completed',
  'nextgenProjectsTask.reopened',
  'nextgenProjectsTask.updated',
  'nextgenProjectsMeeting.completed',
  'nextgenProjectsMeeting.reopened',
  'nextgenProjectsMeeting.updated',
];

async function tlPost(endpoint, body, token) {
  const res = await fetch(`${TL}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const list = searchParams.get('list') === '1';
  const register = searchParams.get('register') === '1';
  const unregister = searchParams.get('unregister') === '1';
  const url = searchParams.get('url');
  const typesParam = searchParams.get('types');

  try {
    const token = await getValidToken();

    if (list) {
      const res = await tlPost('webhooks.list', {}, token);
      return NextResponse.json({ status: res.status, ok: res.ok, data: res.data });
    }

    if (register) {
      if (!url) {
        return NextResponse.json(
          { error: 'Provide &url=<webhook-url>' }, { status: 400 },
        );
      }
      const types = typesParam ? typesParam.split(',').map(s => s.trim()) : V2_EVENTS;
      const results = [];
      for (const type of types) {
        const res = await tlPost('webhooks.register', { url, types: [type] }, token);
        results.push({ type, status: res.status, ok: res.ok, error: res.ok ? null : res.data });
      }
      return NextResponse.json({ url, results });
    }

    if (unregister) {
      if (!url || !typesParam) {
        return NextResponse.json(
          { error: 'Provide &url=<webhook-url>&types=<comma-separated>' }, { status: 400 },
        );
      }
      const types = typesParam.split(',').map(s => s.trim());
      const res = await tlPost('webhooks.unregister', { url, types }, token);
      return NextResponse.json({ status: res.status, ok: res.ok, data: res.data });
    }

    return NextResponse.json({
      usage: {
        list: '/api/teamleader/webhooks?list=1',
        register: '/api/teamleader/webhooks?register=1&url=<zap-hook-url>[&types=csv]',
        unregister: '/api/teamleader/webhooks?unregister=1&url=<url>&types=csv',
      },
      v2EventTypes: V2_EVENTS,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message, detail: err.detail || null, status: err.status || null },
      { status: 500 },
    );
  }
}
