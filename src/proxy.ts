/**
 * Sicherheits-Header, CSRF-Token und grober Zugriffsschutz (NFA-SEC-01, -10, -17).
 *
 * Seit Next.js 16 heißt diese Datei `proxy.ts`; `middleware.ts` ist
 * abgekündigt. Der Proxy läuft vor jeder Anfrage, aber in einer Umgebung ohne
 * Datenbankzugriff. Er kann deshalb nur prüfen, *ob* ein Sitzungscookie
 * vorliegt, nicht ob es gültig ist. Genau darum verlangt Spec §11.2
 * zusätzlich `requireSession()` in jeder Server Action und jeder Seite — der
 * Proxy ist die schnelle erste Hürde, nicht die eigentliche Prüfung.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/infrastructure/auth/session-cookie';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { buildSecurityHeaders } from '@/infrastructure/security/security-headers';
import { LOGIN_PATH, pathRequiresAuthentication, securityProfileFor } from '@/routes';

function generateNonce(): string {
  // Web Crypto statt node:crypto — der Proxy läuft in der Edge-Laufzeit.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

/**
 * Meldet einmalig, wenn die aufgerufene Adresse nicht zu `APP_HOST_URL` passt.
 *
 * Läuft `APP_URL` von der tatsächlichen Adresse auseinander, lehnt die
 * Herkunftsprüfung jede schreibende Aktion ab — auch die Anmeldung. Ohne diesen
 * Hinweis merkt man das erst, wenn nichts mehr geht, und sieht dann nur
 * „Anfrage abgelehnt".
 *
 * Nur für Seitenaufrufe: Der Healthcheck des Containers ruft
 * `127.0.0.1:3000/api/health` auf und würde sonst dauerhaft warnen.
 */
let originMismatchReported = false;

/**
 * Die Adresse, unter der die Anwendung tatsächlich aufgerufen wurde.
 *
 * `nextUrl.origin` liefert hinter einem Reverse Proxy die interne
 * Bindeadresse (`http://0.0.0.0:3000`) — als Hinweis wäre das irreführend.
 * Maßgeblich sind die vom Proxy weitergereichten Kopfzeilen.
 */
function publicOrigin(request: NextRequest): string | null {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host === null || host.length === 0) {
    return null;
  }

  const protocol =
    request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');

  return `${protocol}://${host}`;
}

function warnOnOriginMismatch(requestOrigin: string | null, pathname: string): void {
  if (requestOrigin === null) {
    return;
  }

  if (originMismatchReported || isApiPath(pathname)) {
    return;
  }

  const configured = process.env.APP_URL ?? '';
  if (configured.length === 0) {
    return;
  }

  try {
    if (new URL(configured).origin === requestOrigin) {
      return;
    }
  } catch {
    return;
  }

  originMismatchReported = true;
  console.warn(
    `[konfiguration] Die Anwendung wird unter ${requestOrigin} aufgerufen, APP_URL steht aber ` +
      `auf ${configured}. Solange beide auseinanderlaufen, wird jede schreibende Aktion ` +
      'abgelehnt — auch die Anmeldung. Bitte APP_URL anpassen und den Dienst neu starten.',
  );
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDevelopment = process.env.NODE_ENV === 'development';
  const { pathname } = request.nextUrl;

  warnOnOriginMismatch(publicOrigin(request), pathname);

  const existingCsrfToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const csrfToken = existingCsrfToken ?? generateCsrfToken();

  // Nonce und CSRF-Token an die Serverkomponenten weiterreichen. Beim ersten
  // Aufruf ist das CSRF-Cookie noch nicht in der Anfrage enthalten — ohne
  // diesen Weg könnte das Anmeldeformular kein gültiges Feld rendern.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(CSRF_HEADER_NAME, csrfToken);

  const hasSessionCookie = (request.cookies.get(SESSION_COOKIE_NAME)?.value ?? '').length > 0;

  let response: NextResponse;

  if (pathRequiresAuthentication(pathname) && !hasSessionCookie) {
    if (isApiPath(pathname)) {
      response = NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    } else {
      const target = new URL(LOGIN_PATH, request.url);
      response = NextResponse.redirect(target, { status: 303 });
    }
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Die Kopfzeilen werden **nach** dem Routenhandler gesetzt und überschreiben,
  // was dieser gesetzt hat. Deshalb entscheidet das Routenverzeichnis über das
  // Profil, nicht die Route selbst — sonst schriebe eine Route eine engere
  // Richtlinie, die anschließend still verworfen würde.
  const profile = securityProfileFor(pathname);

  for (const [name, value] of Object.entries(
    buildSecurityHeaders({ nonce, isDevelopment, profile }),
  )) {
    response.headers.set(name, value);
  }

  if (existingCsrfToken === undefined) {
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      // Aus dem Protokoll der Anfrage statt aus der Konfiguration: Die
      // Der Proxy läuft in der Edge-Laufzeit, in der das Nachladen des
      // Konfigurationsmoduls unnötiger Ballast wäre.
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
    });
  }

  return response;
}

export const config = {
  // Statische Dateien des Frameworks brauchen weder Prüfung noch Header.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
