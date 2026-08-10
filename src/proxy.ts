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
import { LOGIN_PATH, pathRequiresAuthentication } from '@/routes';

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

export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDevelopment = process.env.NODE_ENV === 'development';
  const { pathname } = request.nextUrl;

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

  for (const [name, value] of Object.entries(buildSecurityHeaders({ nonce, isDevelopment }))) {
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
