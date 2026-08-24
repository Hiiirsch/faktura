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

import { Secret, TOTP } from 'otpauth';

import {
  ADMIN_SESSION_COOKIE_NAME,
  PENDING_LOGIN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '@/infrastructure/auth/session-cookie';
import { getEnv } from '@/infrastructure/config/env';
import {
  CSRF_COOKIE_NAME,
  CSRF_FIELD_NAME,
  CSRF_REQUEST_HEADER_NAME,
} from '@/infrastructure/security/csrf';
import {
  ADMIN_LOGIN_CODE_PATH,
  ADMIN_LOGIN_PATH,
  authenticatedRoutes,
  LOGIN_PATH,
  platformAdminRoutes,
  probePathFor,
  publicRoutes,
  routes,
} from '@/routes';

import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_TOTP_SECRET,
  TEST_BASE_URL,
  TEST_CUSTOMER_NAME,
  TEST_DATABASE_URL,
  TEST_INVOICE_NUMBER_PREFIX,
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

/**
 * Meldet sich als Betreiber an — über **beide** Schritte.
 *
 * Der zweite Faktor ist für Betreiberkonten verpflichtend (FA-ADM-08); ein
 * Helfer, der nur das Passwort schickt, bekäme deshalb nie eine Sitzung. Das
 * Einmalkennwort entsteht zur **echten** Uhr: `verifyTotpCode` liest die
 * Systemzeit, und ein Code für einen erfundenen Zeitpunkt gilt nicht.
 */
async function signInAsAdmin(): Promise<string> {
  const first = await fetch(url(ADMIN_LOGIN_PATH), { redirect: 'manual' });
  const html = await first.text();

  const csrfToken = new RegExp(`name="${CSRF_FIELD_NAME}" value="([^"]*)"`).exec(html)?.[1];
  const csrfCookie = readSetCookie(first, CSRF_COOKIE_NAME);
  const actionField = /name="(\$ACTION_ID_[^"]*)"/u.exec(html)?.[1];

  expect(csrfToken, 'Adminanmeldung ohne CSRF-Feld').toBeDefined();
  expect(csrfCookie, 'Adminanmeldung ohne CSRF-Cookie').toBeDefined();
  expect(actionField, 'Adminanmeldung ohne Aktionskennung').toBeDefined();

  const csrf = `${CSRF_COOKIE_NAME}=${cookieValue(csrfCookie as string)}`;

  const step1 = new FormData();
  step1.set(actionField as string, '');
  step1.set('email', TEST_ADMIN_EMAIL);
  step1.set('password', TEST_USER_PASSWORD);
  step1.set(CSRF_FIELD_NAME, csrfToken as string);

  const pending = await fetch(url(ADMIN_LOGIN_PATH), {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: TEST_BASE_URL, cookie: csrf },
    body: step1,
  });

  const pendingRaw = pending.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${PENDING_LOGIN_COOKIE_NAME}=`));
  expect(pendingRaw, 'Der erste Adminschritt muss einen Nachweis setzen').toBeDefined();

  const withPending = `${csrf}; ${PENDING_LOGIN_COOKIE_NAME}=${cookieValue(pendingRaw as string)}`;

  const codePage = await fetch(url(ADMIN_LOGIN_CODE_PATH), {
    redirect: 'manual',
    headers: { cookie: withPending },
  });
  const codeHtml = await codePage.text();
  const codeAction = /name="(\$ACTION_ID_[^"]*)"/u.exec(codeHtml)?.[1];
  expect(codeAction, 'Die Codeseite muss eine Aktionskennung tragen').toBeDefined();

  const code = new TOTP({
    issuer: getEnv().APP_NAME,
    label: 'verify',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(TEST_ADMIN_TOTP_SECRET),
  }).generate();

  const step2 = new FormData();
  step2.set(codeAction as string, '');
  step2.set('code', code);
  step2.set(CSRF_FIELD_NAME, csrfToken as string);

  const done = await fetch(url(ADMIN_LOGIN_CODE_PATH), {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: TEST_BASE_URL, cookie: withPending },
    body: step2,
  });

  const sessionRaw = done.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`));

  expect(sessionRaw, 'Der zweite Adminschritt muss eine Sitzung eröffnen').toBeDefined();
  return `${ADMIN_SESSION_COOKIE_NAME}=${cookieValue(sessionRaw as string)}`;
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
      .filter(
        (route) =>
          route.requiresPendingLogin !== true &&
          route.requiresRedemptionToken !== true &&
          route.optionalContent !== true,
      )
      .map((route) => probePathFor(route)),
  )('liefert die öffentliche Route %s aus', async (pathname) => {
    const response = await fetch(url(pathname), { redirect: 'manual' });
    expect(response.status).toBe(200);
  });

  /**
   * Öffentlich, aber erst vorhanden, wenn jemand sie füllt (M13).
   *
   * Das Impressum antwortet mit `404`, solange der Betreiber keines hinterlegt
   * hat. Die Frage dieses Tests bleibt dieselbe — ist die Seite geschützt? —,
   * nur ist „gibt es nicht" hier eine gültige Antwort. **Eine Umleitung zur
   * Anmeldung wäre es nicht:** Sie hieße, dass ein Impressum eine Sitzung
   * verlangt.
   */
  it.each(
    publicRoutes()
      .filter((route) => route.optionalContent === true)
      .map((route) => probePathFor(route)),
  )('lässt %s ohne Sitzung zu — vorhanden oder nicht', async (pathname) => {
    const response = await fetch(url(pathname), { redirect: 'manual' });

    expect([200, 404]).toContain(response.status);
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

  /**
   * Einlöseseiten: `200`, aber ohne Auskunft (M8, FA-MEMB-05).
   *
   * Hier ist die `200` richtig und die Umleitung wäre falsch: Wer einen
   * abgelaufenen Einladungslink öffnet, soll lesen können, dass er nicht mehr
   * gilt. Was er **nicht** lesen darf, ist irgendetwas über das Unternehmen —
   * sonst ließe sich mit geratenen Token ausprobieren, wer eingeladen wurde.
   */
  it.each(
    publicRoutes()
      .filter((route) => route.requiresRedemptionToken === true)
      .map((route) => probePathFor(route)),
  )('liefert %s ohne gültigen Token neutral aus', async (pathname) => {
    const response = await fetch(url(pathname), { redirect: 'manual' });

    expect(response.status).toBe(200);

    const body = await response.text();
    expect(body).not.toContain(TEST_USER_EMAIL);
    // Kein Formular: Ohne gültigen Token gibt es nichts einzugeben.
    expect(body).not.toContain('name="password"');
  });

  /**
   * Adminrouten: drei Anfragen, und die mittlere ist die neue (M8).
   *
   * Ohne Cookie abgewiesen zu werden, ist der einfache Fall. Der Fall, der
   * einen späteren Umbau überlebt haben muss, ist der andere: **eine gültige
   * Mandantensitzung darf hier nichts öffnen.** Genau das würde eine
   * zusammengelegte Sitzungsprüfung stillschweigend kaputtmachen, und der
   * Zugriffsschutztest bliebe grün, solange er nur ohne Cookie prüft.
   */
  it.each(platformAdminRoutes().map((route) => probePathFor(route)))(
    'weist die Adminroute %s ohne Nachweis ab',
    async (pathname) => {
      const response = await fetch(url(pathname), { redirect: 'manual' });

      expect([302, 303, 307, 401]).toContain(response.status);
      if (response.status !== 401) {
        expect(response.headers.get('location')).toContain(ADMIN_LOGIN_PATH);
      }
    },
  );

  it.each(platformAdminRoutes().map((route) => probePathFor(route)))(
    'öffnet die Adminroute %s auch mit gültiger Mandantensitzung nicht',
    async (pathname) => {
      const { sessionCookie } = await attemptLogin(TEST_USER_EMAIL, TEST_USER_PASSWORD);
      expect(sessionCookie, 'Der Test braucht eine gültige Mandantensitzung').toBeDefined();

      const response = await fetch(url(pathname), {
        redirect: 'manual',
        headers: { cookie: sessionCookie as string },
      });

      expect([302, 303, 307, 401]).toContain(response.status);
      if (response.status !== 401) {
        expect(response.headers.get('location')).toContain(ADMIN_LOGIN_PATH);
      }

      const body = await response.text();
      expect(body).not.toContain(TEST_USER_EMAIL);
    },
  );

  /**
   * Die **dritte** Anfrage: mit Admincookie (M8, B5).
   *
   * Ohne sie prüfte der Zugriffsschutz nur, dass die Adminrouten verschlossen
   * sind — nicht, dass sie sich mit dem richtigen Nachweis öffnen. Eine Route,
   * die für **jeden** verschlossen ist, bestünde die beiden Prüfungen darüber
   * mühelos und wäre trotzdem kaputt.
   */
  it.each(
    platformAdminRoutes()
      // Die Sicherung ist ein Download und keine Seite; sie hat ihren eigenen
      // Test in `backup.test.ts`.
      .filter((route) => route.kind === 'page')
      .map((route) => probePathFor(route)),
  )('öffnet die Adminroute %s mit Adminsitzung', async (pathname) => {
    const cookie = await signInAsAdmin();

    const response = await fetch(url(pathname), { redirect: 'manual', headers: { cookie } });

    /*
     * `200` für die echten Seiten, `404` für die Sondierungsadresse einer
     * dynamischen Route: `/admin/organizations/probe-kennung` gibt es nicht, und
     * die Seite antwortet mit `notFound()` statt mit 403 — ein 403 bestätigte,
     * dass es das Unternehmen gibt.
     */
    expect([200, 404]).toContain(response.status);

    // Was sie **nicht** tut: zur Anmeldung umleiten.
    expect(response.headers.get('location')).toBeNull();
  });

  /**
   * Und die Verwaltung liefert keine Geschäftsdaten aus (FA-ADM-02, H5).
   *
   * `platform-repository.test.ts` prüft das am Quelltext — in zwei Formen, weil
   * ein `include: { invoices: true }` einem `_count` ähnlich sieht. Hier steht
   * die Prüfung am ausgelieferten HTML: Die Rechnungsnummer des Bestands darf in
   * der Verwaltung nirgends auftauchen.
   */
  it('nennt die Übersicht der Verwaltung keine Belegdaten', async () => {
    const cookie = await signInAsAdmin();

    const html = await (await fetch(url('/admin'), { headers: { cookie } })).text();

    expect(html).not.toContain(TEST_CUSTOMER_NAME);
    // Keine Belegnummer irgendeiner Form — nicht einmal ihr Präfix.
    expect(html).not.toContain(TEST_INVOICE_NUMBER_PREFIX);
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

/**
 * Die Zeremonie-Routen prüfen Herkunft und Token über eine **Kopfzeile**
 * (NFA-SEC-27, M9).
 *
 * **Warum das eine eigene Prüfung braucht.** `assertRequestIntegrity` liest den
 * Token aus einem `FormData`-Feld; hier geht kein Formular hinaus, sondern JSON
 * aus einem `fetch`. Die Prüfung ist deshalb eine andere Funktion — und eine
 * zweite Funktion ist eine zweite Stelle, an der sie fehlen kann. Die
 * Anwendungstests in `passkeys.test.ts` sehen sie nicht: Sie rufen die
 * Anwendungsschicht auf, und die Kopfzeile gibt es nur über HTTP.
 *
 * Geprüft wird an der **Anmelde**route, weil sie öffentlich ist: Was sie abweist,
 * weist sie wegen der Herkunft ab und nicht wegen einer fehlenden Sitzung.
 */
describe('NFA-SEC-27 Die JSON-Routen der Passkey-Zeremonie', () => {
  async function csrf(): Promise<{ readonly token: string; readonly cookie: string }> {
    const response = await fetch(url('/login'), { redirect: 'manual' });
    const html = await response.text();

    const token = new RegExp(`name="${CSRF_FIELD_NAME}" value="([^"]*)"`).exec(html)?.[1];
    const rawCookie = readSetCookie(response, CSRF_COOKIE_NAME);

    expect(token, 'Die Anmeldeseite muss ein CSRF-Feld enthalten').toBeDefined();
    expect(rawCookie, 'Die Anmeldeseite muss ein CSRF-Cookie setzen').toBeDefined();

    return {
      token: token as string,
      cookie: `${CSRF_COOKIE_NAME}=${cookieValue(rawCookie as string)}`,
    };
  }

  it('weist eine Anfrage fremder Herkunft ab', async () => {
    const { token, cookie } = await csrf();

    const response = await fetch(url('/api/passkeys/login'), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        origin: 'https://angreifer.example',
        cookie,
        [CSRF_REQUEST_HEADER_NAME]: token,
      },
      body: JSON.stringify({ challengeId: 'egal', response: {} }),
    });

    expect(response.status).toBe(403);
  });

  it('weist eine Anfrage ohne Kopfzeile ab', async () => {
    const { cookie } = await csrf();

    const response = await fetch(url('/api/passkeys/login'), {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: TEST_BASE_URL, cookie },
      body: JSON.stringify({ challengeId: 'egal', response: {} }),
    });

    expect(response.status).toBe(403);
  });

  it('lässt eine Anfrage eigener Herkunft mit Kopfzeile durch', async () => {
    // Der Gegenbeweis: Ohne ihn bestünden die beiden Prüfungen oben auch dann,
    // wenn die Route jede Anfrage mit 403 beantwortete.
    const { token, cookie } = await csrf();

    const response = await fetch(url('/api/passkeys/login'), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        origin: TEST_BASE_URL,
        cookie,
        [CSRF_REQUEST_HEADER_NAME]: token,
      },
      body: JSON.stringify({ nichts: true }),
    });

    // 400, nicht 403: Die Herkunftsprüfung ist bestanden, der Inhalt taugt nur
    // nichts.
    expect(response.status).toBe(400);
  });
});
