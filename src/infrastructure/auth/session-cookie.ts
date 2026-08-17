/**
 * Sitzungscookie (NFA-SEC-07, Spec §11.1).
 *
 * `HttpOnly` — für JavaScript unlesbar, damit ein XSS-Fund die Sitzung nicht
 * mitnehmen kann. `SameSite=Lax` — wird bei fremd ausgelösten schreibenden
 * Anfragen nicht mitgesendet. `Secure` — nur über HTTPS.
 */
import { getEnv } from '@/infrastructure/config/env';

export const SESSION_COOKIE_NAME = 'faktura_session';

/**
 * Der Nachweis zwischen Passwort und zweitem Faktor (M6.2).
 *
 * Eigener Name und eigener Pfad: Er wird ausschließlich an `/login` gesendet
 * und liegt damit bei keiner anderen Anfrage bei. Ein Nachweis, der auf jeder
 * Seite mitreist, wäre ein Geheimnis, das ohne Not durch die ganze Anwendung
 * wandert.
 */
export const PENDING_LOGIN_COOKIE_NAME = 'faktura_pending';

/**
 * Die Sitzung der zentralen Verwaltung (M8, FA-ADM-01).
 *
 * Eigener Name **und eigener Pfad**: Das Admintoken wird ausschließlich an
 * `/admin` gesendet und liegt bei keiner Anfrage an `/invoices` bei. Wer den
 * Browser eines Administrators dazu bringt, eine Mandantenseite zu laden,
 * bekommt damit kein Admintoken mitgeliefert — und umgekehrt gilt dasselbe.
 */
export const ADMIN_SESSION_COOKIE_NAME = 'faktura_admin_session';

export type CookieOptions = {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: '/' | '/login' | '/admin';
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

export function pendingLoginCookieOptions(expiresAt: Date, appUrl?: string): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureContext(appUrl),
    sameSite: 'lax',
    path: '/login',
    expires: expiresAt,
  };
}

export function clearedPendingLoginCookieOptions(appUrl?: string): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureContext(appUrl),
    sameSite: 'lax',
    path: '/login',
    maxAge: 0,
  };
}

export function adminSessionCookieOptions(expiresAt: Date, appUrl?: string): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureContext(appUrl),
    sameSite: 'lax',
    path: '/admin',
    expires: expiresAt,
  };
}

export function clearedAdminSessionCookieOptions(appUrl?: string): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureContext(appUrl),
    sameSite: 'lax',
    path: '/admin',
    maxAge: 0,
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
