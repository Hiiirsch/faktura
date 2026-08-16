/**
 * NFA-SEC-01 — Ohne gültige Session liefert jede Server Action, API- und
 * Download-Route 401 oder 403, nachgewiesen durch einen Test, der alle Routen
 * automatisiert durchläuft.
 *
 * Zusätzlich geprüft: die Attribute des Sitzungscookies (NFA-SEC-07), die
 * Sicherheits-Header (NFA-SEC-17), der CSRF-Schutz (NFA-SEC-10) und die
 * Ununterscheidbarkeit der Fehlermeldungen (NFA-SEC-02, Kontoenumeration).
 *
 * Der Test läuft gegen die gebaute Anwendung. Voraussetzung ist ein
 * `npm run build`; das Startskript bricht andernfalls mit klarer Meldung ab.
 */
import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { authenticatedRoutes, LOGIN_PATH, probePathFor, publicRoutes, routes } from '@/routes';
import { CSRF_COOKIE_NAME, CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { SESSION_COOKIE_NAME } from '@/infrastructure/auth/session-cookie';

import {
  TEST_BASE_URL,
  TEST_DATABASE_URL,
  TEST_LOCKOUT_EMAIL,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from './setup/server';

function url(pathname: string): string {
  return `${TEST_BASE_URL}${pathname}`;
}

/** Liest ein Cookie aus den `Set-Cookie`-Kopfzeilen einer Antwort. */
function readSetCookie(response: Response, name: string): string | undefined {
  return response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${name}=`));
}

function cookieValue(rawCookie: string): string {
  return rawCookie.split(';')[0]?.split('=').slice(1).join('=') ?? '';
}

/**
 * Liest das Anmeldeformular so aus, wie ein Browser ohne JavaScript es
 * abschicken würde: Next.js rendert dafür ein verstecktes Feld `$ACTION_ID_…`,
 * über das der Server die aufzurufende Server Action bestimmt. Ohne dieses
 * Feld liefe der POST ins Leere — der Test würde dann Sicherheit prüfen, die
 * gar nicht zur Anwendung kommt.
 */
type LoginForm = {
  readonly actionField: string;
  readonly csrfToken: string;
  readonly csrfCookie: string;
};

async function loadLoginForm(): Promise<LoginForm> {
  const response = await fetch(url('/login'), { redirect: 'manual' });
  const html = await response.text();

  const actionField = /name="(\$ACTION_ID_[0-9a-f]+)"/.exec(html)?.[1];
  const csrfToken = new RegExp(`name="${CSRF_FIELD_NAME}" value="([^"]*)"`).exec(html)?.[1];
  const rawCookie = readSetCookie(response, CSRF_COOKIE_NAME);

  expect(actionField, 'Das Anmeldeformular muss eine Aktionskennung enthalten').toBeDefined();
  expect(csrfToken, 'Das Anmeldeformular muss ein CSRF-Feld enthalten').toBeDefined();
  expect(rawCookie, 'Die Anmeldeseite muss ein CSRF-Cookie setzen').toBeDefined();

  return {
    actionField: actionField as string,
    csrfToken: csrfToken as string,
    csrfCookie: `${CSRF_COOKIE_NAME}=${cookieValue(rawCookie as string)}`,
  };
}

type LoginOverrides = {
  readonly origin?: string;
  readonly csrfToken?: string | null;
};

type LoginResult = {
  readonly response: Response;
  readonly sessionCookie: string | undefined;
};

async function attemptLogin(
  email: string,
  password: string,
  secondFactor = '',
  overrides: LoginOverrides = {},
): Promise<LoginResult> {
  const form = await loadLoginForm();

  const body = new FormData();
  body.set(form.actionField, '');
  body.set('email', email);
  body.set('password', password);
  body.set('secondFactor', secondFactor);

  const csrfToken = overrides.csrfToken === undefined ? form.csrfToken : overrides.csrfToken;
  if (csrfToken !== null) {
    body.set(CSRF_FIELD_NAME, csrfToken);
  }

  const response = await fetch(url('/login'), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      origin: overrides.origin ?? TEST_BASE_URL,
      cookie: form.csrfCookie,
    },
    body,
  });

  return { response, sessionCookie: readSetCookie(response, SESSION_COOKIE_NAME) };
}

describe('NFA-SEC-01 Zugriffsschutz ohne Sitzung', () => {
  it('deckt jede im Verzeichnis geführte Route ab', () => {
    // Der Test wäre wertlos, wenn das Verzeichnis leer oder unvollständig wäre.
    // tests/architecture/routes.test.ts stellt den Abgleich mit dem Dateisystem
    // sicher; hier wird nur bestätigt, dass überhaupt geprüft wird.
    expect(routes.length).toBeGreaterThan(0);
    expect(authenticatedRoutes().length).toBeGreaterThan(0);
  });

  it.each(authenticatedRoutes().map((route) => [route.path, probePathFor(route)] as const))(
    'verweigert %s ohne Sitzung',
    async (pattern, pathname) => {
      const response = await fetch(url(pathname), { redirect: 'manual' });
      const route = routes.find((entry) => entry.path === pattern);

      if (route?.kind === 'api') {
        expect([401, 403]).toContain(response.status);
      } else {
        // Seiten leiten zur Anmeldung um, statt Inhalte auszuliefern.
        expect([302, 303, 307]).toContain(response.status);
        expect(response.headers.get('location')).toContain('/login');
      }

      const body = await response.text();
      expect(body).not.toContain(TEST_USER_EMAIL);
    },
  );

  it.each(
    publicRoutes()
      .filter((route) => route.requiresPendingLogin !== true)
      .map((route) => probePathFor(route)),
  )('liefert die öffentliche Route %s aus', async (pathname) => {
    const response = await fetch(url(pathname), { redirect: 'manual' });
    expect(response.status).toBe(200);
  });

  /**
   * Öffentlich, aber nicht offen.
   *
   * Der zweite Anmeldeschritt braucht keine Sitzung — er liegt davor — und
   * trotzdem einen Nachweis. Eine `200`-Antwort ohne ihn wäre hier der Fehler,
   * nicht der Normalfall: Sie hieße, dass sich die Seite mit dem Codefeld
   * jedem zeigt, der die Adresse kennt.
   */
  it.each(
    publicRoutes()
      .filter((route) => route.requiresPendingLogin === true)
      .map((route) => probePathFor(route)),
  )('weist die Route %s ohne Nachweis an den Anfang zurück', async (pathname) => {
    const response = await fetch(url(pathname), { redirect: 'manual' });

    expect([302, 303, 307]).toContain(response.status);
    expect(response.headers.get('location')).toContain(LOGIN_PATH);
  });

  it('gibt auf einem unbekannten Pfad keine Inhalte preis', async () => {
    const response = await fetch(url('/gibt-es-nicht'), { redirect: 'manual' });
    // Unbekannte Pfade gelten als geschützt (src/routes.ts).
    expect([302, 303, 307]).toContain(response.status);
  });

  it('verweigert eine Server Action ohne Sitzung', async () => {
    const form = await loadLoginForm();
    const body = new FormData();
    body.set(CSRF_FIELD_NAME, form.csrfToken);

    const response = await fetch(url('/settings/security'), {
      method: 'POST',
      redirect: 'manual',
      headers: { origin: TEST_BASE_URL, cookie: form.csrfCookie },
      body,
    });

    // Ohne Sitzungscookie greift bereits die Middleware.
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toContain(TEST_USER_EMAIL);
  });
});

describe('NFA-SEC-17 Sicherheits-Header', () => {
  it('setzt die geforderten Header auf jeder Antwort', async () => {
    const response = await fetch(url('/login'), { redirect: 'manual' });

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');

    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src [^;]*'nonce-/);
  });

  it('nennt sich nicht selbst gegenüber dem Client', async () => {
    const response = await fetch(url('/login'), { redirect: 'manual' });
    expect(response.headers.get('x-powered-by')).toBeNull();
  });
});

describe('NFA-SEC-10 CSRF-Schutz', () => {
  it('lehnt eine Anmeldung ohne CSRF-Token ab', async () => {
    const { response, sessionCookie } = await attemptLogin(
      TEST_USER_EMAIL,
      TEST_USER_PASSWORD,
      '',
      { csrfToken: null },
    );

    expect(sessionCookie).toBeUndefined();
    expect(response.headers.get('location')).toContain('error=rejected');
  });

  it('lehnt eine Anmeldung mit fremder Herkunft ab', async () => {
    const { sessionCookie } = await attemptLogin(TEST_USER_EMAIL, TEST_USER_PASSWORD, '', {
      origin: 'https://angreifer.example.com',
    });

    expect(sessionCookie).toBeUndefined();
  });

  it('lehnt ein nicht zum Cookie passendes Token ab', async () => {
    const { sessionCookie } = await attemptLogin(TEST_USER_EMAIL, TEST_USER_PASSWORD, '', {
      csrfToken: 'ein-erfundenes-token',
    });

    expect(sessionCookie).toBeUndefined();
  });
});

describe('Anmeldung (NFA-SEC-07)', () => {
  it('weist ein falsches Passwort zurück', async () => {
    const { response, sessionCookie } = await attemptLogin(TEST_USER_EMAIL, 'falsches-passwort');
    expect(sessionCookie).toBeUndefined();
    expect(response.headers.get('location')).toContain('error=invalid');
  });

  it('unterscheidet unbekanntes Konto nicht von falschem Passwort', async () => {
    const unknown = await attemptLogin('gibt-es-nicht@example.org', 'irgendein-passwort');
    const wrongPassword = await attemptLogin(TEST_USER_EMAIL, 'auch-falsch-genug');

    expect(unknown.response.headers.get('location')).toBe(
      wrongPassword.response.headers.get('location'),
    );
  });

  it('meldet mit gültigen Zugangsdaten an und setzt ein abgesichertes Cookie', async () => {
    const { response, sessionCookie } = await attemptLogin(TEST_USER_EMAIL, TEST_USER_PASSWORD);

    expect(sessionCookie, 'Es muss ein Sitzungscookie gesetzt werden').toBeDefined();
    const raw = sessionCookie as string;

    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=lax');
    expect(raw).toContain('Path=/');
    // `Secure` fehlt hier bewusst: Der Prüfaufbau läuft über HTTP. Das
    // Zusammenspiel von APP_URL und dem Attribut prüft der Unit-Test in
    // tests/unit/infrastructure/security.test.ts.

    expect(response.headers.get('location')).toContain('/');
  });

  it('erzeugt bei jeder Anmeldung ein neues Token (Rotation)', async () => {
    const first = await attemptLogin(TEST_USER_EMAIL, TEST_USER_PASSWORD);
    const second = await attemptLogin(TEST_USER_EMAIL, TEST_USER_PASSWORD);

    expect(cookieValue(first.sessionCookie as string)).not.toBe(
      cookieValue(second.sessionCookie as string),
    );
  });

  it('gibt geschützte Seiten mit gültiger Sitzung frei', async () => {
    const { sessionCookie } = await attemptLogin(TEST_USER_EMAIL, TEST_USER_PASSWORD);
    const token = cookieValue(sessionCookie as string);

    for (const route of authenticatedRoutes().filter((entry) => entry.kind === 'page')) {
      const response = await fetch(url(probePathFor(route)), {
        redirect: 'manual',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });

      // `/customers/[id]` wird mit einer erfundenen Kennung geprüft: Dort ist
      // 404 die richtige Antwort — entscheidend ist, dass die Sitzung greift
      // und nicht zur Anmeldung umgeleitet wird.
      const acceptable = route.probePath === undefined ? [200] : [200, 404];
      expect(acceptable, `${route.path} sollte mit Sitzung erreichbar sein`).toContain(
        response.status,
      );
    }
  });

  it('weist ein gefälschtes Sitzungstoken zurück', async () => {
    const response = await fetch(url('/'), {
      redirect: 'manual',
      headers: { cookie: `${SESSION_COOKIE_NAME}=frei-erfundenes-token` },
    });

    // Die Middleware sieht ein Cookie und lässt passieren; requireSession()
    // löst es auf, findet nichts und leitet zur Anmeldung um. Genau deshalb
    // verlangt Spec §11.2 beide Ebenen.
    expect([302, 303, 307]).toContain(response.status);
    expect(response.headers.get('location')).toContain('/login');
  });
});

/**
 * NFA-SEC-08 — Nach zehn fehlgeschlagenen Loginversuchen wird der Zugang für
 * 15 Minuten gesperrt; Fehlversuche werden protokolliert.
 *
 * Steht bewusst am Ende der Datei: Der Test sperrt ein Konto, und Vitest führt
 * die Prüfungen einer Datei in Reihenfolge aus. Er nutzt zudem ein eigenes
 * Konto, damit die übrigen Anmeldungen unberührt bleiben.
 */
describe('NFA-SEC-08 Sperre und Protokollierung', () => {
  it('sperrt nach zehn Fehlversuchen und protokolliert sie', async () => {
    for (let attempt = 1; attempt <= 9; attempt += 1) {
      const { response } = await attemptLogin(TEST_LOCKOUT_EMAIL, 'immer-falsch-genug');
      expect(
        response.headers.get('location'),
        `Versuch ${String(attempt)} darf noch nicht sperren`,
      ).toContain('error=invalid');
    }

    const tenth = await attemptLogin(TEST_LOCKOUT_EMAIL, 'immer-falsch-genug');
    expect(tenth.sessionCookie).toBeUndefined();

    // Ab jetzt greift die Sperre — auch das richtige Passwort hilft nicht mehr.
    const withCorrectPassword = await attemptLogin(TEST_LOCKOUT_EMAIL, TEST_USER_PASSWORD);
    expect(withCorrectPassword.sessionCookie).toBeUndefined();
    expect(withCorrectPassword.response.headers.get('location')).toContain('error=locked');
    expect(withCorrectPassword.response.headers.get('location')).toContain('minutes=15');
  });

  it('schreibt Anmeldeereignisse ins Audit-Log, ohne Passwörter abzulegen', async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

    try {
      const entries = await prisma.auditLog.findMany();
      const actions = entries.map((entry) => entry.action);

      expect(actions).toContain('LOGIN_FAILED');
      expect(actions).toContain('LOGIN_SUCCEEDED');
      expect(actions).toContain('ACCOUNT_LOCKED');

      // NFA-BETR-10: keine Passwörter, keine Token im Protokoll.
      const serialized = JSON.stringify(entries);
      expect(serialized).not.toContain(TEST_USER_PASSWORD);
      expect(serialized).not.toContain('immer-falsch-genug');
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('Sicherheitsprofil der Antwort (NFA-SEC-17)', () => {
  it('legt auf Routen mit Fremdmarkup das Dokumentprofil', async () => {
    // Ohne Sitzung antwortet bereits der Proxy — die Kopfzeilen setzt er
    // trotzdem, und am Pfad hängt das Profil.
    const response = await fetch(url('/api/assets/probe-kennung'), { redirect: 'manual' });

    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
  });

  it('legt auf erzeugten Belegen das PDF-Profil', async () => {
    const response = await fetch(url('/api/invoices/probe-kennung/pdf'), { redirect: 'manual' });

    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    expect(response.headers.get('content-security-policy')).not.toContain('sandbox');
  });

  it('lässt die Oberfläche selbst nicht einbetten', async () => {
    const response = await fetch(url('/login'), { redirect: 'manual' });

    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
});
