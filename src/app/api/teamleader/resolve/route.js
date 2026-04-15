// GET /api/teamleader/resolve?intId=<legacy integer id>
//
// Resolves a Teamleader legacy integer task id (what webhooks send) into
// { uuid, title, completed }. This is the lookup key Zapier uses to find
// the matching row in the roadmap sheet.

import { NextResponse } from 'next/server';
import { getValidToken } from '@/lib/teamleaderAuth';

const TL = 'https://api.focus.teamleader.eu';

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
  const intIdRaw = searchParams.get('intId');
  const uuidParam = searchParams.get('uuid');

  if (!intIdRaw && !uuidParam) {
    return NextResponse.json(
      { error: 'Provide ?intId=<legacyInt> or ?uuid=<uuid>' },
      { status: 400 },
    );
  }

  try {
    const token = await getValidToken();

    // Resolve to UUID
    let uuid = uuidParam;
    if (!uuid) {
      const intId = Number(intIdRaw);
      if (!Number.isFinite(intId)) {
        return NextResponse.json({ error: 'intId must be an integer' }, { status: 400 });
      }
      const mig = await tlPost('migrate.id', { id: intId, type: 'task' }, token);
      if (!mig.ok) {
        return NextResponse.json(
          { error: 'migrate.id failed', detail: mig.data, status: mig.status },
          { status: 502 },
        );
      }
      uuid = mig.data?.data?.id;
      if (!uuid) {
        return NextResponse.json({ error: 'No UUID returned by migrate.id' }, { status: 404 });
      }
    }

    // Fetch task details
    const info = await tlPost('tasks.info', { id: uuid }, token);
    if (!info.ok) {
      return NextResponse.json(
        { error: 'tasks.info failed', detail: info.data, status: info.status },
        { status: 502 },
      );
    }

    const t = info.data?.data;
    const rawTitle = t?.title || t?.description || null;
    // Strip trailing price suffix like " €1050" or " €1.050,00" so titles match
    // what's stored in the Google Sheet (which omits pricing).
    const title = rawTitle
      ? rawTitle.replace(/\s+€[\d.,\s]+$/u, '').trim()
      : null;

    // Enrich with customer name (for disambiguating duplicate task titles
    // across clients when looking up rows in the sheet).
    let rawClientName = null;
    const customer = t?.customer;
    if (customer?.id && customer?.type) {
      const endpoint = customer.type === 'contact' ? 'contacts.info' : 'companies.info';
      const custRes = await tlPost(endpoint, { id: customer.id }, token);
      if (custRes.ok) {
        const c = custRes.data?.data;
        if (customer.type === 'contact') {
          const first = c?.first_name || '';
          const last = c?.last_name || '';
          rawClientName = `${first} ${last}`.trim() || null;
        } else {
          rawClientName = c?.name || null;
        }
      }
    }

    // Strip common legal-entity tokens (BV, BVBA, NV, SA, SRL, Ltd, GmbH, ...)
    // whether they appear as a leading or trailing word. Sheet uses bare names.
    const LEGAL_TOKENS = /\b(?:BV|BVBA|NV|SA|SRL|SAS|SARL|SPRL|S\.?A\.?|S\.?R\.?L\.?|Ltd\.?|LLC|Inc\.?|GmbH|AG|Plc)\b/giu;
    const clientName = rawClientName
      ? rawClientName.replace(LEGAL_TOKENS, '').replace(/\s{2,}/g, ' ').trim()
      : null;

    return NextResponse.json({
      uuid,
      title,
      rawTitle,
      clientName,
      rawClientName,
      description: t?.description || null,
      completed: !!t?.completed,
      due_on: t?.due_on || null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
