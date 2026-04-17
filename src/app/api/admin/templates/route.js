import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminAuthed } from '@/lib/authCookie';
import {
  listTemplates,
  saveTemplate,
  deleteTemplate,
} from '@/lib/milestoneTemplates';

export const dynamic = 'force-dynamic';

async function requireAdmin(request) {
  const cookieStore = await cookies();
  if (!isAdminAuthed(request, cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request) {
  const deny = await requireAdmin(request);
  if (deny) return deny;
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}

export async function PUT(request) {
  const deny = await requireAdmin(request);
  if (deny) return deny;
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body?.id || !body?.name) {
    return NextResponse.json({ error: 'id and name are required' }, { status: 400 });
  }
  if (!Array.isArray(body.patterns)) {
    return NextResponse.json({ error: 'patterns must be an array' }, { status: 400 });
  }

  const template = {
    id: String(body.id).trim(),
    name: String(body.name).trim(),
    patterns: body.patterns.map(p => ({
      kind: p.kind,
      title: String(p.title || '').trim(),
      ...(p.kind === 'monthly' || p.kind === 'everyNMonths'
        ? { dayOfMonth: Number(p.dayOfMonth) || 1 }
        : {}),
      ...(p.kind === 'everyNMonths'
        ? { everyMonths: Math.max(1, Number(p.everyMonths) || 1) }
        : {}),
      ...(p.kind === 'once'
        ? {
            position: p.position === 'end' || p.position === 'start' ? p.position : 'offsetDays',
            ...(p.position !== 'start' && p.position !== 'end'
              ? { offsetDays: Number(p.offsetDays) || 0 }
              : {}),
          }
        : {}),
    })),
  };

  await saveTemplate(template);
  return NextResponse.json({ ok: true, template });
}

export async function DELETE(request) {
  const deny = await requireAdmin(request);
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  const removed = await deleteTemplate(id);
  return NextResponse.json({ ok: true, removed });
}
