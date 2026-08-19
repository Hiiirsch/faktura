import { NextResponse } from 'next/server';

import { requireAdminSessionOrThrow } from '@/application/admin/require-admin-session';
import { assertJsonRequestIntegrity } from '@/application/auth/assert-request-integrity';
import {
  beginPasskeyRegistration,
  completePasskeyRegistration,
  type PasskeyOwner,
} from '@/application/auth/passkey-registration';

export const dynamic = 'force-dynamic';

/**
 * Dieselbe Zeremonie für ein **Betreiberkonto** (M9, FA-PASS-03).
 *
 * Eigene Route und nicht ein Zweig in der Mandantenroute: Die Trennung der
 * beiden Identitäten liegt in Sitzung und Cookie, und sie soll auch im
 * Routenverzeichnis sichtbar bleiben. Eine Route, die je nach mitgesendetem
 * Cookie das eine oder das andere tut, wäre die erste Stelle, an der die
 * Trennung verschwimmt.
 *
 * Der Vorgang selbst kommt aus derselben Datei — die Zeremonie ist dieselbe, nur
 * das Konto ein anderes.
 */

async function ownerOf(): Promise<PasskeyOwner> {
  const session = await requireAdminSessionOrThrow();
  return { kind: 'admin', id: session.adminUserId, email: session.email, name: null };
}

export async function GET(): Promise<NextResponse> {
  const offer = await beginPasskeyRegistration(await ownerOf());
  return NextResponse.json(offer, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await assertJsonRequestIntegrity();
  } catch {
    return NextResponse.json({ error: 'rejected' }, { status: 403 });
  }

  const owner = await ownerOf();

  const body: unknown = await request.json();
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'rejected' }, { status: 400 });
  }

  const { challengeId, response, label } = body as {
    challengeId?: unknown;
    response?: unknown;
    label?: unknown;
  };

  if (typeof challengeId !== 'string' || typeof label !== 'string' || typeof response !== 'object') {
    return NextResponse.json({ error: 'rejected' }, { status: 400 });
  }

  const result = await completePasskeyRegistration(
    owner,
    challengeId,
    response as Parameters<typeof completePasskeyRegistration>[2],
    label,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error.kind }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
