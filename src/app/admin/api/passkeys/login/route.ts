import { NextResponse } from 'next/server';

import { assertJsonRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { beginPasskeyLogin, completePasskeyLogin } from '@/application/auth/passkey-login';
import { readRequestContext } from '@/application/auth/request-context';
import {
  ADMIN_SESSION_COOKIE_NAME,
  adminSessionCookieOptions,
} from '@/infrastructure/auth/session-cookie';

export const dynamic = 'force-dynamic';

/**
 * Passwortlose Anmeldung eines **Betreiberkontos** (M9, FA-PASS-06, FA-ADM-08).
 *
 * **Ein Passkey erfüllt die Zweifaktorpflicht.** FA-ADM-08 verlangt mehr als
 * einen Faktor; ein Passkey mit Nutzerverifikation bringt beide mit — Besitz des
 * Geräts und Gerätesperre. Deshalb entsteht hier unmittelbar eine Sitzung,
 * anders als beim Passwortweg, der über einen zweiten Schritt führt.
 *
 * **Öffentlich und trotzdem nicht offen.** Wer hier ankommt, ist noch niemand —
 * der Nachweis ist die Signatur eines Passkeys, und die prüft
 * `completePasskeyLogin`. Ohne gültige Antwort entsteht keine Sitzung.
 *
 * `GET` holt die Aufgabe, `POST` reicht die Antwort ein. Die Aufgabe ist an kein
 * Konto gebunden: Bei einem auffindbaren Passkey nennt der Authenticator selbst,
 * zu wem er gehört.
 *
 * **Die Antwort ist immer dieselbe, wenn es nicht geht.** Unbekannter Schlüssel,
 * gesperrtes Konto, stillgelegtes Unternehmen, Passkey eines Betreiberkontos —
 * ein `401` ohne Auskunft. Sonst ließe sich mit fremden Schlüsseln erkunden,
 * welche Konten es gibt.
 */
export async function GET(): Promise<NextResponse> {
  const offer = await beginPasskeyLogin();
  return NextResponse.json(offer, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await assertJsonRequestIntegrity();
  } catch {
    return NextResponse.json({ error: 'rejected' }, { status: 403 });
  }

  const body: unknown = await request.json();
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'rejected' }, { status: 400 });
  }

  const { challengeId, response } = body as { challengeId?: unknown; response?: unknown };
  if (typeof challengeId !== 'string' || typeof response !== 'object' || response === null) {
    return NextResponse.json({ error: 'rejected' }, { status: 400 });
  }

  const context = await readRequestContext();
  const result = await completePasskeyLogin(
    'admin',
    challengeId,
    response as Parameters<typeof completePasskeyLogin>[2],
    context,
  );

  if (!result.ok || result.value.kind !== 'admin') {
    return NextResponse.json({ error: 'rejected' }, { status: 401 });
  }

  const answer = NextResponse.json({ ok: true });
  answer.cookies.set(
    ADMIN_SESSION_COOKIE_NAME,
    result.value.session.token,
    adminSessionCookieOptions(result.value.session.expiresAt),
  );
  return answer;
}
