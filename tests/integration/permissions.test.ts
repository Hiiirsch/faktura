/**
 * Die Durchsetzung der Berechtigungen (M8, FA-ROLE-03, NFA-SEC-24).
 *
 * Was hier **nicht** geprüft wird: dass ein Anwendungsfall ohne Nachweis
 * aufrufbar ist. Das kann er nicht — `Authorized<K>` macht es zum Typfehler, und
 * ein Test dafür wäre ein Test des Übersetzers. `authorization.test.ts` bewacht
 * stattdessen die drei Wege, auf denen sich diese Zusage aushebeln ließe.
 *
 * Was hier geprüft wird, ist das, was der Typ nicht sagen kann:
 *
 * 1. **Dass `authorize` wirklich prüft** — an einer echten Sitzung mit einer
 *    echten Rolle aus der Datenbank, nicht an einem gebauten Akteur.
 * 2. **Dass die Ablehnung auch ohne Oberfläche greift.** Der Knopf fehlt, aber
 *    der Knopf ist nicht der Schutz. Deshalb gehen zwei Fälle über HTTP gegen
 *    den laufenden Server, mit dem Sitzungscookie eines eingeschränkten Kontos
 *    und ohne dass je eine Seite gerendert wurde, die einen Knopf verstecken
 *    könnte.
 * 3. **Dass Seiten und Routen unterschiedlich antworten**: Eine Route sagt 403,
 *    eine Seite 404. Eine Seite, die 403 sagt, bestätigt ihre Existenz.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { authorize, authorizeOptional, ForbiddenError } from '@/application/auth/authorize';
import { login } from '@/application/auth/login';
import { type ActiveSession, resolveSession } from '@/application/auth/session-service';
import { getCompanyProfile } from '@/application/company/company-profile';
import { listInvoices } from '@/application/invoices/invoice-queries';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { SESSION_COOKIE_NAME } from '@/infrastructure/auth/session-cookie';
import { createUser } from '@/infrastructure/repositories/auth-repository';
import { DEFAULT_ORGANIZATION_ID } from '@/infrastructure/repositories/organization-context';
import { CSRF_COOKIE_NAME, CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';
import {
  TEST_BASE_URL,
  TEST_RESTRICTED_EMAIL,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from './setup/server';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';
const CONTEXT = { ipAddress: '203.0.113.12', userAgent: 'pruefung' };
const NOW = new Date();

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── Teil 1: die Prüfung selbst ────────────────────────────────────────────

/** Eine angemeldete Sitzung, deren Rolle genau diese Rechte trägt. */
async function sessionWith(permissions: readonly string[]): Promise<ActiveSession> {
  const role = await prisma.role.create({
    data: { organizationId: DEFAULT_ORGANIZATION_ID, name: 'Prüfrolle' },
  });

  await prisma.rolePermission.createMany({
    data: permissions.map((permissionKey) => ({
      organizationId: DEFAULT_ORGANIZATION_ID,
      roleId: role.id,
      permissionKey,
    })),
  });

  await createUser({
    email: 'pruefling@example.org',
    passwordHash: await hashPassword(PASSWORD),
    organizationId: DEFAULT_ORGANIZATION_ID,
    roleId: role.id,
  });

  const result = await login({ email: 'pruefling@example.org', password: PASSWORD }, CONTEXT, NOW);
  expect(result.ok).toBe(true);
  if (!result.ok || result.value.kind !== 'SESSION') throw new Error('keine Sitzung');

  const session = await resolveSession(result.value.session.token, NOW);
  if (session === null) throw new Error('Sitzung nicht auflösbar');
  return session;
}

describe('FA-ROLE-03 `authorize` stellt den Nachweis nur mit Recht aus', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('führt mit Recht zum Anwendungsfall', async () => {
    const session = await sessionWith(['invoice.read']);

    // Der Nachweis entsteht — und der Anwendungsfall nimmt ihn an. Dass er
    // etwas zurückgibt, ist hier nebensächlich; dass er aufrufbar war, ist die
    // Aussage.
    const invoices = await listInvoices(authorize(session, 'invoice.read'), {});

    expect(invoices).toEqual([]);
  });

  it('wirft ohne Recht, bevor irgendetwas geschieht', async () => {
    const session = await sessionWith(['invoice.read']);

    expect(() => authorize(session, 'customer.read')).toThrow(ForbiddenError);
  });

  it('nennt der Fehler den fehlenden Schlüssel — im Serverlog, nicht dem Client', async () => {
    const session = await sessionWith(['invoice.read']);

    try {
      authorize(session, 'invoice.issue');
      throw new Error('hätte werfen müssen');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).permission).toBe('invoice.issue');
    }
  });

  /**
   * Mehrere Schlüssel bedeuten **und**.
   *
   * Das ist die Zusage, an der die ganze Marke hängt: `Authorized<'a' | 'b'>`
   * behauptet, dass beide geprüft wurden. Würde `authorize` schon beim ersten
   * Treffer einen Nachweis ausstellen, wäre die Behauptung falsch — und zwar
   * unbemerkt, weil der Typ dann trotzdem passt.
   */
  it('verlangt bei mehreren Schlüsseln alle', async () => {
    const session = await sessionWith(['invoice.read', 'invoice.update']);

    expect(() => authorize(session, 'invoice.read', 'invoice.update')).not.toThrow();
    expect(() => authorize(session, 'invoice.read', 'invoice.issue')).toThrow(ForbiddenError);
    // Auch in der anderen Reihenfolge — nicht nur der erste Schlüssel zählt.
    expect(() => authorize(session, 'invoice.issue', 'invoice.read')).toThrow(ForbiddenError);
  });

  it('liefert `authorizeOptional` einen Wert statt einer Ausnahme', async () => {
    const session = await sessionWith(['invoice.read']);

    expect(authorizeOptional(session, 'invoice.read')).not.toBeNull();
    expect(authorizeOptional(session, 'customer.read')).toBeNull();
    // Auch hier gilt „und": ein fehlender Schlüssel genügt.
    expect(authorizeOptional(session, 'invoice.read', 'customer.read')).toBeNull();
  });

  /**
   * Die Grundrechte sind keine Rechtefrage.
   *
   * Ein Konto ohne jede Rolle muss den Namen seines Arbeitgebers lesen und sein
   * eigenes Passwort ändern können — sonst hinge die Anmeldeschale selbst an
   * einer Rechtevergabe, und ein Konto ohne Rolle sähe eine leere Anwendung
   * ohne Weg heraus.
   */
  it('trägt jedes Konto die Grundrechte, aber keine Geschäftsdaten', async () => {
    const session = await sessionWith([]);

    const company = await getCompanyProfile(authorize(session, 'companyProfile.read'));
    expect(company).toBeNull();

    expect(() => authorize(session, 'companyProfile.update')).toThrow(ForbiddenError);
    expect(() => authorize(session, 'invoice.read')).toThrow(ForbiddenError);
    expect(() => authorize(session, 'export.run')).toThrow(ForbiddenError);
  });

  /*
   * Dass eine **Rechteänderung sofort wirkt** (NFA-SEC-25), steht nicht hier,
   * sondern in `roles.test.ts`: Dort wird dasselbe Token zweimal aufgelöst, und
   * das ist die Stelle, an der die Frische entsteht. Hier ginge es nur um
   * `authorize`, die den Akteur bekommt und ihn nicht liest.
   */
});

// ─── Teil 2: über HTTP, ohne Oberfläche ────────────────────────────────────

function url(pathname: string): string {
  return `${TEST_BASE_URL}${pathname}`;
}

function cookieValue(rawCookie: string): string {
  return rawCookie.split(';')[0]?.split('=').slice(1).join('=') ?? '';
}

/** Meldet über das echte Formular an und gibt das Sitzungscookie zurück. */
async function signIn(email: string): Promise<string> {
  const page = await fetch(url('/login'), { redirect: 'manual' });
  const html = await page.text();

  const csrfToken = new RegExp(`name="${CSRF_FIELD_NAME}" value="([^"]*)"`).exec(html)?.[1];
  const csrfCookie = page.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`));
  const actionField = /name="(\$ACTION_ID_[^"]*)"/u.exec(html)?.[1];

  expect(csrfToken, 'Anmeldeformular ohne CSRF-Feld').toBeDefined();
  expect(csrfCookie, 'Anmeldeseite ohne CSRF-Cookie').toBeDefined();
  expect(actionField, 'Anmeldeformular ohne Aktionskennung').toBeDefined();

  const body = new FormData();
  body.set(actionField as string, '');
  body.set('email', email);
  body.set('password', TEST_USER_PASSWORD);
  body.set('secondFactor', '');
  body.set(CSRF_FIELD_NAME, csrfToken as string);

  const response = await fetch(url('/login'), {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: TEST_BASE_URL, cookie: `${CSRF_COOKIE_NAME}=${cookieValue(csrfCookie as string)}` },
    body,
  });

  const sessionCookie = response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`));

  expect(sessionCookie, `Anmeldung von ${email} lieferte kein Sitzungscookie`).toBeDefined();
  return `${SESSION_COOKIE_NAME}=${cookieValue(sessionCookie as string)}`;
}

describe('FA-ROLE-03 Die Ablehnung greift auch ohne Oberfläche', () => {
  it('antwortet eine Route ohne Recht mit 403, mit Recht mit 200', async () => {
    const restricted = await signIn(TEST_RESTRICTED_EMAIL);
    const owner = await signIn(TEST_USER_EMAIL);

    /*
     * Der Datenexport ist der schärfste Fall: Er gibt **alle** Daten des
     * Mandanten heraus, und er ist eine Route — von Hand aufrufbar, ohne dass
     * je eine Seite mit einem Knopf gerendert wurde.
     */
    const denied = await fetch(url('/api/export'), { headers: { cookie: restricted } });
    expect(denied.status).toBe(403);

    const body = await denied.text();
    // Kein Hinweis darauf, welches Recht fehlt (NFA-SEC-18).
    expect(body).not.toContain('export.run');

    const allowed = await fetch(url('/api/export'), { headers: { cookie: owner } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('content-disposition')).toContain('attachment');
  });

  it('antwortet eine Seite ohne Recht mit 404 statt mit 403', async () => {
    const restricted = await signIn(TEST_RESTRICTED_EMAIL);

    const response = await fetch(url('/settings/company'), {
      headers: { cookie: restricted },
      redirect: 'manual',
    });

    // 404 und nicht 403: Ein 403 bestätigt, dass es die Seite gibt.
    expect(response.status).toBe(404);
    // Und keine Umleitung zur Anmeldung — die Sitzung ist gültig.
    expect(response.headers.get('location')).toBeNull();
  });

  it('bleibt die Seite erreichbar, für die das Konto das Recht hat', async () => {
    const restricted = await signIn(TEST_RESTRICTED_EMAIL);

    const response = await fetch(url('/invoices'), {
      headers: { cookie: restricted },
      redirect: 'manual',
    });

    expect(response.status).toBe(200);
  });

  /**
   * Die Verwaltungsseiten (M8, B4).
   *
   * Zwei Prüfungen in einer, und die zweite ist die, die kein anderer Test
   * abdeckt: Dass ein Konto **ohne** `organization.administer` 404 bekommt, und
   * dass die Seiten mit dem Recht überhaupt **rendern**. Der Zugriffsschutztest
   * ruft jede Route ohne Sitzung auf und sieht damit nie, was die Seite
   * darstellt; ein Fehler beim Rendern erschiene dort als Weiterleitung.
   */
  it('gibt Mitglieder und Rollen nur der Rechteverwaltung', async () => {
    const restricted = await signIn(TEST_RESTRICTED_EMAIL);
    const owner = await signIn(TEST_USER_EMAIL);

    for (const pathname of ['/settings/members', '/settings/roles']) {
      const denied = await fetch(url(pathname), {
        headers: { cookie: restricted },
        redirect: 'manual',
      });
      expect(denied.status, `${pathname} ohne Recht`).toBe(404);

      const allowed = await fetch(url(pathname), {
        headers: { cookie: owner },
        redirect: 'manual',
      });
      expect(allowed.status, `${pathname} mit Recht`).toBe(200);

      // Die Seite hat wirklich Inhalt gerendert und nicht nur einen leeren
      // Rahmen: Ein Fehler in der Server-Komponente käme als 500 zurück, ein
      // Fehler in den Daten als Seite ohne die eigene Überschrift.
      const html = await allowed.text();
      expect(html, pathname).toContain(
        pathname.endsWith('members') ? 'Mitglieder' : 'Berechtigungen',
      );
    }
  });

  /**
   * Die Seitenleiste zeigt keinen Weg, der mit 404 endet (M8).
   *
   * `requirePermission` antwortet ohne Recht mit „nicht gefunden". Ein Menüpunkt
   * dorthin wäre schlechter als keiner — deshalb hängt jeder Eintrag an dem
   * Recht, das seine Seite verlangt.
   */
  it('führt die Seitenleiste nur erreichbare Bereiche', async () => {
    const restricted = await signIn(TEST_RESTRICTED_EMAIL);
    const html = await (await fetch(url('/invoices'), { headers: { cookie: restricted } })).text();

    // Vorhanden: Belege lesen darf dieses Konto.
    expect(html).toContain('/invoices');
    // Nicht vorhanden: alles andere.
    expect(html).not.toContain('/settings/members');
    expect(html).not.toContain('/settings/roles');
    expect(html).not.toContain('/settings/company');
    expect(html).not.toContain('/customers');
    expect(html).not.toContain('/catalog');
  });

  /**
   * Der Knopf fehlt — aber das ist die Zugabe, nicht der Schutz.
   *
   * Geprüft am ausgelieferten HTML: Ein Konto mit `invoice.read` sieht in der
   * Rechnungsliste keine Aktion zum Anlegen. Fiel diese Prüfung aus, wäre das
   * kein Loch (die Aktion prüft selbst), aber die Oberfläche versprach etwas,
   * was sie nicht hält.
   */
  it('zeigt der Rechnungsliste ohne Anlegerecht keinen Anlegeknopf', async () => {
    const restricted = await signIn(TEST_RESTRICTED_EMAIL);
    const owner = await signIn(TEST_USER_EMAIL);

    const withoutRight = await (
      await fetch(url('/invoices'), { headers: { cookie: restricted } })
    ).text();
    const withRight = await (await fetch(url('/invoices'), { headers: { cookie: owner } })).text();

    expect(withRight).toContain('/invoices/new');
    expect(withoutRight).not.toContain('/invoices/new');
  });
});
