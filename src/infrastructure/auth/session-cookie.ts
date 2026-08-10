/**
 * Sitzungscookie (NFA-SEC-07, Spec §11.1).
 *
 * `HttpOnly` — für JavaScript unlesbar, damit ein XSS-Fund die Sitzung nicht
 * mitnehmen kann. `SameSite=Lax` — wird bei fremd ausgelösten schreibenden
 * Anfragen nicht mitgesendet. `Secure` — nur über HTTPS.
 */
import { getEnv } from '@/infrastructure/config/env';

export const SESSION_COOKIE_NAME = 'faktura_session';

export type CookieOptions = {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: '/';
  readonly expires?: Date;
  readonly maxAge?: number;
};

/**
 * `Secure` richtet sich danach, ob die Anwendung über HTTPS ausgeliefert wird.
 * Fest auf `true` gesetzt wäre die Anmeldung im lokalen Entwicklungsbetrieb
 * über HTTP unmöglich — der Browser sendete das Cookie schlicht nie zurück.
 */
export function isSecureContext(appUrl: string = getEnv().APP_URL): boolean {
  return appUrl.startsWith('https://');
}

export function sessionCookieOptions(expiresAt: Date, appUrl?: string): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureContext(appUrl),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

/** Optionen zum Löschen des Cookies beim Abmelden. */
export function clearedSessionCookieOptions(appUrl?: string): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureContext(appUrl),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  };
}
