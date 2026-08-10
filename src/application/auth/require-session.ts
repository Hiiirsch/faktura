/**
 * Der zentrale Sitzungswächter (NFA-SEC-01, Spec §11.2).
 *
 * Spec §11.2 verlangt ausdrücklich: „Jede Server Action prüft die Session als
 * erste Anweisung. Ein zentrales `requireSession()`-Helper, kein Verlass auf
 * Middleware allein." Die Middleware fängt den Regelfall früh ab; diese
 * Funktion ist die Prüfung, auf die es ankommt.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { type ActiveSession, resolveSession } from '@/application/auth/session-service';
import { SESSION_COOKIE_NAME } from '@/infrastructure/auth/session-cookie';
import { LOGIN_PATH } from '@/routes';

/** Liefert die Sitzung oder `null` — ohne Weiterleitung. */
export async function getOptionalSession(): Promise<ActiveSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token === undefined || token.length === 0) {
    return null;
  }
  return resolveSession(token);
}

/**
 * Für Seiten: leitet ohne gültige Sitzung zur Anmeldung um. `redirect` wirft
 * intern, der Rückgabetyp ist deshalb nie `null`.
 */
export async function requireSession(): Promise<ActiveSession> {
  const session = await getOptionalSession();
  if (session === null) {
    redirect(LOGIN_PATH);
  }
  return session;
}

/**
 * Für Server Actions und Routenhandler: signalisiert das Fehlen der Sitzung als
 * Wert, damit der Aufrufer mit 401 antworten kann, statt eine Weiterleitung zu
 * senden, die ein Programm nicht als Ablehnung erkennt.
 */
export class UnauthenticatedError extends Error {
  constructor() {
    super('Keine gültige Sitzung');
    this.name = 'UnauthenticatedError';
  }
}

export async function requireSessionOrThrow(): Promise<ActiveSession> {
  const session = await getOptionalSession();
  if (session === null) {
    throw new UnauthenticatedError();
  }
  return session;
}
