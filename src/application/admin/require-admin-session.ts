/**
 * Der Sitzungswächter der Verwaltung (M8, FA-ADM-01, NFA-SEC-01).
 *
 * Das Gegenstück zu `src/application/auth/require-session.ts`. Dieselbe Regel
 * wie dort gilt auch hier: Der Proxy fängt den Regelfall früh ab, aber die
 * Prüfung, auf die es ankommt, steht als **erste Anweisung** jeder Adminseite
 * und jeder Adminaktion (Spec §11.2).
 *
 * Eine Mandantensitzung nützt hier nichts: Gelesen wird ein anderes Cookie aus
 * einer anderen Tabelle. Das ist der Punkt — ein angemeldeter Buchhalter kommt
 * nicht dadurch in die Verwaltung, dass er die Adresse kennt.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { type AdminSession, resolveAdminSession } from '@/application/admin/admin-session-service';
import { ADMIN_SESSION_COOKIE_NAME } from '@/infrastructure/auth/session-cookie';
import { ADMIN_LOGIN_PATH } from '@/routes';

export async function getOptionalAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (token === undefined || token.length === 0) {
    return null;
  }
  return resolveAdminSession(token);
}

/** Für Seiten: leitet ohne gültige Adminsitzung zur Adminanmeldung um. */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getOptionalAdminSession();
  if (session === null) {
    redirect(ADMIN_LOGIN_PATH);
  }
  return session;
}

export class UnauthenticatedAdminError extends Error {
  constructor() {
    super('Keine gültige Adminsitzung');
    this.name = 'UnauthenticatedAdminError';
  }
}

/** Für Aktionen und Routenhandler: meldet das Fehlen als Wert, nicht als Umleitung. */
export async function requireAdminSessionOrThrow(): Promise<AdminSession> {
  const session = await getOptionalAdminSession();
  if (session === null) {
    throw new UnauthenticatedAdminError();
  }
  return session;
}
