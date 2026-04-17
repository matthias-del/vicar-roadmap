import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminAuthed } from '@/lib/authCookie';
import {
  getAllClientPasswords,
  setClientPassword,
  deleteClientPassword,
} from '@/lib/clientPasswords';

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
  const map = await getAllClientPasswords();
  // Return which keys have a password, but not the passwords themselves.
  const entries = Object.entries(map).map(([key, value]) => ({
    key,
    hasPassword: Boolean(value && value.trim()),
  }));
  return NextResponse.json({ entries });
}

export async function PUT(request) {
  const deny = await requireAdmin(request);
  if (deny) return deny;
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { clientId, projectId, password } = body || {};
  if (!clientId || !projectId) {
    return NextResponse.json({ error: 'clientId and projectId are required' }, { status: 400 });
  }
  if (!password || !password.trim()) {
    return NextResponse.json({ error: 'password is required' }, { status: 400 });
  }
  await setClientPassword(clientId, projectId, password);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const deny = await requireAdmin(request);
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const projectId = searchParams.get('projectId');
  if (!clientId || !projectId) {
    return NextResponse.json({ error: 'clientId and projectId are required' }, { status: 400 });
  }
  await deleteClientPassword(clientId, projectId);
  return NextResponse.json({ ok: true });
}
