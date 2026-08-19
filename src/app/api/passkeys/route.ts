import { NextResponse } from 'next/server';

import { assertJsonRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { authorizeRequest } from '@/application/auth/authorize';
import {
  beginPasskeyRegistration,
  completePasskeyRegistration,
  type PasskeyOwner,
} from '@/application/auth/passkey-registration';
import { requireSessionOrThrow } from '@/application/auth/require-session';

export const dynamic = 'force-dynamic';

/**
 * Die Zeremonie zum Anlegen eines Passkeys — Mandantenkonto (M9, FA-PASS-03).
 *
 * **Zwei Schritte, ein Pfad.** `GET` holt die Aufgabe, `POST` reicht die Antwort
 * des Authenticators ein. Zwei Routen dafür wären zwei Einträge im
 * Routenverzeichnis und zwei Sitzungsprüfungen für einen Vorgang.
 *
 * **Hinter der Sitzung.** Registrieren darf nur, wer schon angemeldet ist; ein
 * Passkey, den jemand ohne Anmeldung anlegen könnte, wäre ein zweiter Weg
 * hinein. `security.update` ist dabei ein Grundrecht — die eigene Sicherheit zu
 * verwalten hängt an keiner Rolle.
 *
 * Die Herkunftsprüfung läuft über `assertJsonRequestIntegrity`: Hier kommt kein
 * Formular an, also trägt der CSRF-Token eine Kopfzeile statt eines Feldes.
 */

async function ownerOf(): Promise<PasskeyOwner | null> {
  const session = await requireSessionOrThrow();

  if (authorizeRequest(session, 'security.update') === null) {
    return null;
  }

  return { kind: 'user', id: session.userId, email: session.email, name: session.name };
}

export async function GET(): Promise<NextResponse> {
  const owner = await ownerOf();
  if (owner === null) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const offer = await beginPasskeyRegistration(owner);
  return NextResponse.json(offer, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await assertJsonRequestIntegrity();
  } catch {
    return NextResponse.json({ error: 'rejected' }, { status: 403 });
  }

  const owner = await ownerOf();
  if (owner === null) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

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
