/**
 * Unternehmensverwaltung des Betreibers (M8, B5).
 *
 * Die Identität der Verwaltung ist in `admin-session.test.ts` geprüft. Hier geht
 * es um das, was sie **tut** — und um die vier Zusagen, die dabei still brechen
 * können:
 *
 * - Das Anlegen ist **eine** Transaktion. Bräche sie in der Mitte ab, gäbe es
 *   eine Organisation ohne Rolle: ein Unternehmen, in das niemand hineinkommt,
 *   auch der Betreiber nicht.
 * - Der Betreiber erfährt **kein** Mandantenpasswort. Was er weitergibt, ist
 *   eine Einladung; gesetzt wird das Passwort von dem, der es danach kennt.
 * - Nummernkreise gelten **je Unternehmen** (FA-NUM-02, FA-ORG-05). Zwei
 *   Unternehmen, die am selben Tag festschreiben, bekommen beide die Nummer
 *   `RE-2026-0001`. Ein gemeinsamer Zähler wäre in einem Test mit einem Mandanten
 *   unsichtbar.
 * - Stilllegen wirkt **sofort** und **ohne Datenverlust**.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { adminLogin, completeAdminSecondFactor } from '@/application/admin/admin-login';
import {
  type PlatformContext,
  resolveAdminSession,
} from '@/application/admin/admin-session-service';
import {
  createManagedOrganization,
  getManagedOrganization,
  getOrganizationAccounts,
  listManagedOrganizations,
  OWNER_ROLE_NAME,
  reissueInvitation,
  setOrganizationSuspended,
  setPlatformUserDisabled,
  startTenantPasswordReset,
} from '@/application/admin/organization-admin';
import { fullyAuthorized } from '@/application/auth/authorize';
import { login } from '@/application/auth/login';
import { resolveSession } from '@/application/auth/session-service';
import {
  acceptInvitation,
  completePasswordReset,
  loadInvitation,
} from '@/application/members/redeem';
import { EMPTY_COMPANY_PROFILE, saveCompanyProfile } from '@/application/company/company-profile';
import { createDraftInvoice } from '@/application/invoices/invoice-service';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { ALL_PERMISSION_KEYS } from '@/domain/policy/can';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { generateTotpSecret } from '@/infrastructure/auth/totp';
import { getEnv } from '@/infrastructure/config/env';
import { createAdminUser } from '@/infrastructure/repositories/platform-repository';
import { organizationContextOf } from '@/infrastructure/repositories/organization-context';
import { Secret, TOTP } from 'otpauth';

import { freeBuyer } from '../support/buyer';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const ADMIN_EMAIL = 'betreiber@example.org';
const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';
const OWNER_PASSWORD = 'Quittenbrot-am-Sonntagmorgen-3';
const CONTEXT = { ipAddress: '203.0.113.30', userAgent: 'pruefung' };
/** Die echte Uhr — ein Einmalkennwort ist an sie gebunden. */
const NOW = new Date();

beforeEach(async () => {
  /*
   * **Erst trennen, dann tauschen** (M10).
   *
   * `resetDatabase()` ersetzt die Datenbankdatei und trennt dafür den Client der
   * **Anwendung**; den eines Testmoduls kennt es nicht. Bleibt der offen, hängt
   * er an der abgehängten alten Datei: Lesezugriffe liefern veraltete oder gar
   * keine Zeilen, Schreibzugriffe scheitern an Fremdschlüsseln auf Zeilen, die
   * es dort nie gab. Beides ist aufgetreten, und beides sah nach einem Fehler in
   * der Fachlogik aus.
   */
  await prisma.$disconnect();
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Eine echte Adminsitzung, über beide Anmeldeschritte.
 *
 * Nicht `platformContextOf(...)` von Hand: Der Kontext soll auf demselben Weg
 * entstehen wie im Betrieb, sonst prüfte der Test eine Abkürzung.
 */
async function platformContext(): Promise<{
  readonly platform: PlatformContext;
  readonly adminUserId: string;
}> {
  const secret = generateTotpSecret();
  const admin = await createAdminUser({
    email: ADMIN_EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    totpSecret: secret,
    totpEnabled: true,
  });

  const first = await adminLogin({ email: ADMIN_EMAIL, password: PASSWORD }, CONTEXT, NOW);
  if (!first.ok) throw new Error('kein Nachweis');

  const code = new TOTP({
    issuer: getEnv().APP_NAME,
    label: 'verify',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate({ timestamp: NOW.getTime() });

  const second = await completeAdminSecondFactor(first.value.token, code, CONTEXT, NOW);
  if (!second.ok) throw new Error('keine Sitzung');

  const session = await resolveAdminSession(second.value.token, NOW);
  if (session === null) throw new Error('Sitzung nicht auflösbar');

  return { platform: session.platform, adminUserId: admin.id };
}

describe('FA-ORG-02 / FA-ADM-05 Ein Unternehmen entsteht in einem Vorgang', () => {
  it('legt Organisation, Inhaberrolle und Einladung zusammen an', async () => {
    const { platform, adminUserId } = await platformContext();

    const result = await createManagedOrganization(
      platform,
      { name: 'Schreinerei Bosch', ownerEmail: 'Chef@Bosch.example' },
      adminUserId,
      null,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const organizationId = result.value.organizationId;

    const role = await prisma.role.findFirstOrThrow({ where: { organizationId } });
    expect(role.name).toBe(OWNER_ROLE_NAME);

    // Alle Schlüssel des Katalogs — sonst könnte der Inhaber sein Unternehmen
    // nicht einrichten, und die Aussperrsicherung hätte kein Konto.
    const keys = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionKey: true },
    });
    expect(keys).toHaveLength(ALL_PERMISSION_KEYS.length);
    expect(keys.map((entry) => entry.permissionKey)).toContain('organization.administer');

    const invitation = await prisma.invitation.findFirstOrThrow({ where: { organizationId } });
    // Kleingeschrieben abgelegt, damit es die Adresse nicht zweimal gibt.
    expect(invitation.email).toBe('chef@bosch.example');
    expect(invitation.roleId).toBe(role.id);
    // Eingeladen hat der Betreiber — der ist kein `User`.
    expect(invitation.invitedById).toBeNull();
    // Der Token steht nirgends in der Datenbank.
    expect(JSON.stringify(invitation)).not.toContain(result.value.token);
  });

  /**
   * Der stärkste Beleg für „keine Geschäftsdaten", den das System liefern kann.
   *
   * Der Betreiber hat ein Unternehmen angelegt und kennt trotzdem kein Passwort
   * darin. Geprüft wird beides: dass die Einladung keines trägt, und dass das
   * Konto danach mit dem selbst gewählten Passwort arbeitet.
   */
  it('erfährt der Betreiber kein Mandantenpasswort', async () => {
    const { platform, adminUserId } = await platformContext();

    const created = await createManagedOrganization(
      platform,
      { name: 'Schreinerei Bosch', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    if (!created.ok) throw new Error('nicht angelegt');

    const invitation = await prisma.invitation.findFirstOrThrow();
    expect(Object.keys(invitation)).not.toContain('passwordHash');

    const accepted = await acceptInvitation(
      created.value.token,
      { name: 'Bosch', password: OWNER_PASSWORD },
      null,
      NOW,
    );
    expect(accepted.ok).toBe(true);

    // Das Konto arbeitet mit dem Passwort, das nur sein Inhaber gesetzt hat.
    const signedIn = await login(
      { email: 'chef@bosch.example', password: OWNER_PASSWORD },
      CONTEXT,
      NOW,
    );
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok || signedIn.value.kind !== 'SESSION') return;

    const session = await resolveSession(signedIn.value.session.token, NOW);
    expect(session?.roleName).toBe(OWNER_ROLE_NAME);
    // Und es kann sein Unternehmen einrichten.
    expect(session?.actor.permissions.has('organization.administer')).toBe(true);
    expect(session?.actor.permissions.has('invoice.issue')).toBe(true);
  });

  it('weist eine Adresse ab, die schon zu einem Konto gehört', async () => {
    const { platform, adminUserId } = await platformContext();

    const first = await createManagedOrganization(
      platform,
      { name: 'Erste', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    if (!first.ok) throw new Error('nicht angelegt');
    await acceptInvitation(
      first.value.token,
      { name: '', password: OWNER_PASSWORD },
      null,
      NOW,
    );

    const second = await createManagedOrganization(
      platform,
      { name: 'Zweite', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe('EMAIL_TAKEN');

    // Und die zweite Organisation ist **nicht** entstanden: Die Prüfung steht
    // vor der Transaktion, nicht darin.
    expect(await prisma.organization.count({ where: { name: 'Zweite' } })).toBe(0);
  });
});

describe('FA-ORG-05 / FA-NUM-02 Nummernkreise gelten je Unternehmen', () => {
  /**
   * Zwei Unternehmen, beide `RE-2026-0001`.
   *
   * Diese Prüfung ist nur mit zwei Mandanten möglich und war deshalb bis M8
   * nicht zu machen. Ein gemeinsamer Zähler fiele im Betrieb erst auf, wenn ein
   * Unternehmen Lücken in seiner Nummernfolge hätte — und dann steht es dem
   * Finanzamt gegenüber.
   */
  it('vergibt beiden Unternehmen dieselbe erste Belegnummer', async () => {
    const { platform, adminUserId } = await platformContext();

    const numbers: string[] = [];

    for (const [name, email] of [
      ['Erste GmbH', 'erste@example.org'],
      ['Zweite GmbH', 'zweite@example.org'],
    ] as const) {
      const created = await createManagedOrganization(
        platform,
        { name, ownerEmail: email },
        adminUserId,
        null,
        NOW,
      );
      if (!created.ok) throw new Error('nicht angelegt');

      await acceptInvitation(created.value.token, { name, password: OWNER_PASSWORD }, null, NOW);

      // Der Urheber der Belege ist der Inhaber — seit B6 verweist
      // `Invoice.createdById` auf `User`, eine erfundene Kennung wäre ein
      // Fremdschlüsselfehler.
      const owner = await prisma.user.findUniqueOrThrow({ where: { email } });

      /*
       * Ab hier arbeitet der Test als **Mandant**, nicht als Betreiber: Der
       * Kontext entsteht aus der Organisation, nicht aus der Adminsitzung. Es
       * gibt keine Funktion, die das eine ins andere überführt — deshalb hier
       * `fullyAuthorized`, wie in jedem Fachlogiktest.
       */
      const org = fullyAuthorized(organizationContextOf(created.value.organizationId));

      await saveCompanyProfile(
        org,
        {
          ...EMPTY_COMPANY_PROFILE,
          legalName: name,
          addressLine1: 'Hauptstraße 1',
          postalCode: '89518',
          city: 'Heidenheim',
          countryCode: 'DE',
          taxNumber: '12/345/67890',
        },
        owner.id,
        null,
      );

      const draft = await createDraftInvoice(
        org,
        {
          buyer: freeBuyer('Kundenname\nWeg 2\n10115 Berlin'),
          templateId: null,
          taxScheme: 'STANDARD',
          currency: 'EUR',
          issueDate: '2026-03-02',
          serviceDateFrom: '2026-03-02',
          serviceDateTo: null,
          dueDate: '2026-03-16',
          introText: null,
          outroText: null,
          purchaseOrderRef: null,
          lines: [
            {
              position: 1,
              name: 'Arbeitsstunde',
              description: null,
              // Mengen als skalierte Ganzzahl (10^4): eine Stunde.
              quantityScaled: 10_000,
              unitCode: 'HUR',
              unitPriceCents: 8_500,
              discountBasisPoints: 0,
              taxCategory: 'S',
              taxRateBasisPoints: 1900,
            },
          ],
        },
        owner.id,
        null,
      );

      const issued = await issueInvoice(org, draft.id, owner.id, null);
      expect(issued.ok, `${name} festschreiben`).toBe(true);
      if (!issued.ok) return;

      numbers.push(issued.invoiceNumber);
    }

    expect(numbers[0]).toBe(numbers[1]);
    expect(numbers[0]).toMatch(/0001$/u);
  });
});

describe('FA-ORG-03 Stilllegen wirkt sofort und ohne Datenverlust', () => {
  async function organizationWithOwner(): Promise<{
    readonly platform: PlatformContext;
    readonly adminUserId: string;
    readonly organizationId: string;
    readonly sessionToken: string;
    readonly userId: string;
  }> {
    const { platform, adminUserId } = await platformContext();

    const created = await createManagedOrganization(
      platform,
      { name: 'Schreinerei Bosch', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    if (!created.ok) throw new Error('nicht angelegt');

    await acceptInvitation(
      created.value.token,
      { name: 'Bosch', password: OWNER_PASSWORD },
      null,
      NOW,
    );

    const signedIn = await login(
      { email: 'chef@bosch.example', password: OWNER_PASSWORD },
      CONTEXT,
      NOW,
    );
    if (!signedIn.ok || signedIn.value.kind !== 'SESSION') throw new Error('keine Sitzung');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'chef@bosch.example' } });

    return {
      platform,
      adminUserId,
      organizationId: created.value.organizationId,
      sessionToken: signedIn.value.session.token,
      userId: user.id,
    };
  }

  it('beendet die laufenden Sitzungen und weist die Anmeldung ab', async () => {
    const { platform, adminUserId, organizationId, sessionToken } = await organizationWithOwner();
    expect(await resolveSession(sessionToken, NOW)).not.toBeNull();

    const result = await setOrganizationSuspended(
      platform,
      organizationId,
      true,
      adminUserId,
      null,
      NOW,
    );
    expect(result.ok).toBe(true);

    // Sofort, nicht erst mit dem Ablauf — und die Zeile ist weg.
    expect(await resolveSession(sessionToken, NOW)).toBeNull();
    expect(await prisma.session.count({ where: { user: { organizationId } } })).toBe(0);

    const again = await login(
      { email: 'chef@bosch.example', password: OWNER_PASSWORD },
      CONTEXT,
      NOW,
    );
    expect(again.ok).toBe(false);
  });

  it('verliert das Unternehmen dabei keine Daten und lässt sich freigeben', async () => {
    const { platform, adminUserId, organizationId, userId } = await organizationWithOwner();

    await setOrganizationSuspended(platform, organizationId, true, adminUserId, null, NOW);

    // Das Konto ist da, das Unternehmen ist da — nur stillgelegt.
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
    const suspended = await getManagedOrganization(platform, organizationId);
    expect(suspended?.suspendedAt).not.toBeNull();

    const resumed = await setOrganizationSuspended(
      platform,
      organizationId,
      false,
      adminUserId,
      null,
      NOW,
    );
    expect(resumed.ok).toBe(true);

    expect((await getManagedOrganization(platform, organizationId))?.suspendedAt).toBeNull();

    // Und die Anmeldung geht wieder.
    const signedIn = await login(
      { email: 'chef@bosch.example', password: OWNER_PASSWORD },
      CONTEXT,
      NOW,
    );
    expect(signedIn.ok).toBe(true);
  });

  it('hält das Protokoll den Eingriff mit `actorKind: ADMIN` fest', async () => {
    const { platform, adminUserId, organizationId } = await organizationWithOwner();

    await setOrganizationSuspended(platform, organizationId, true, adminUserId, null, NOW);

    const entries = await prisma.auditLog.findMany({ where: { organizationId } });
    const suspension = entries.find((entry) => entry.action === 'SUSPENDED');

    expect(suspension).toBeDefined();
    // Die Unterscheidung, die `actorId` allein nicht trägt: Die Kennungen
    // stammen aus zwei verschiedenen Tabellen (FA-ADM-07).
    expect(suspension?.actorKind).toBe('ADMIN');
    expect(suspension?.actorId).toBe(adminUserId);

    // Der Eintrag steht im Protokoll des betroffenen Unternehmens, nicht
    // irgendwo daneben.
    const creation = entries.find((entry) => entry.action === 'ORGANIZATION_CREATED');
    expect(creation?.actorKind).toBe('ADMIN');

    // Und die Handlung des Inhabers ist davon unterscheidbar.
    const accepted = entries.find((entry) => entry.action === 'INVITATION_ACCEPTED');
    expect(accepted?.actorKind).toBe('USER');
  });
});

describe('FA-ADM-03 Die Verwaltung sieht Zahlen, keine Zeilen', () => {
  it('liefert je Unternehmen ausschließlich Kennzahlen', async () => {
    const { platform, adminUserId } = await platformContext();

    const created = await createManagedOrganization(
      platform,
      { name: 'Schreinerei Bosch', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    if (!created.ok) throw new Error('nicht angelegt');

    const detail = await getManagedOrganization(platform, created.value.organizationId);
    expect(detail).not.toBeNull();

    /*
     * Die Form der Antwort ist die Zusage.
     *
     * Kämen hier Belege oder Kunden als Liste mit, wäre die Trennung aufgehoben —
     * und zwar ohne dass ein Typ es meldete, denn `OrganizationMetrics` wäre
     * dann einfach ein anderer Typ. Deshalb steht die Schlüsselmenge als
     * Erwartung im Test: Wer sie erweitert, muss diese Zeile anfassen.
     */
    expect(Object.keys(detail ?? {}).sort()).toEqual([
      'createdAt',
      'customerCount',
      'id',
      'invoiceCount',
      'lastLoginAt',
      'name',
      'suspendedAt',
      'userCount',
    ]);
  });

  it('führt die Übersicht jedes Unternehmen mit seinen Zahlen', async () => {
    const { platform, adminUserId } = await platformContext();

    for (const [name, email] of [
      ['Erste GmbH', 'erste@example.org'],
      ['Zweite GmbH', 'zweite@example.org'],
    ] as const) {
      await createManagedOrganization(platform, { name, ownerEmail: email }, adminUserId, null, NOW);
    }

    const list = await listManagedOrganizations(platform);

    // Die Vorlagendatenbank bringt `org_default` mit; dazu die beiden neuen.
    expect(list.length).toBeGreaterThanOrEqual(3);

    const first = list.find((entry) => entry.name === 'Erste GmbH');
    expect(first?.userCount).toBe(0);
    expect(first?.invoiceCount).toBe(0);
    // Noch keine Anmeldung: Die Einladung ist offen.
    expect(first?.lastLoginAt).toBeNull();
  });
});

describe('FA-ADM-05 Der Betreiber kann Konten sperren', () => {
  it('sperrt ein Konto und beendet dessen Sitzung', async () => {
    const { platform, adminUserId } = await platformContext();

    const created = await createManagedOrganization(
      platform,
      { name: 'Schreinerei Bosch', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    if (!created.ok) throw new Error('nicht angelegt');
    await acceptInvitation(
      created.value.token,
      { name: 'Bosch', password: OWNER_PASSWORD },
      null,
      NOW,
    );

    const accounts = await getOrganizationAccounts(platform, created.value.organizationId);
    expect(accounts).toHaveLength(1);
    const account = accounts[0];
    if (account === undefined) return;

    /*
     * **Die Aussperrsicherung greift auch hier.**
     *
     * Das ist das einzige Konto mit `organization.administer` in diesem
     * Unternehmen. Der Trigger hängt an der Tabelle, nicht an der
     * Anwendungsschicht — der Betreiber umgeht ihn nicht dadurch, dass er einen
     * anderen Weg nimmt.
     */
    await expect(
      setPlatformUserDisabled(platform, account.id, true, adminUserId, null, NOW),
    ).rejects.toThrow();

    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).disabledAt,
    ).toBeNull();
  });
});

describe('FA-ADM-09 / FA-ADM-10 Wege aus einer Sackgasse (M9/B1)', () => {
  /**
   * Die Lücke, die den Block ausgelöst hat.
   *
   * Ein aufgegebener erster Anlauf hinterlässt eine offene Einladung. Der
   * partielle Index `Invitation_one_open_per_email` gilt **global**, also ließ
   * der zweite Anlauf mit derselben Adresse die ganze Transaktion an einem
   * Indexfehler scheitern — und der Betreiber bekam einen Datenbankfehler statt
   * einer Meldung.
   */
  it('legt ein zweites Unternehmen mit derselben Inhaberadresse an', async () => {
    const { platform, adminUserId } = await platformContext();

    const first = await createManagedOrganization(
      platform,
      { name: 'Erster Anlauf', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    expect(first.ok).toBe(true);

    const second = await createManagedOrganization(
      platform,
      { name: 'Zweiter Anlauf', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );

    expect(second.ok).toBe(true);
    if (!second.ok || !first.ok) return;

    // Der erste Link ist entwertet, der zweite gilt.
    expect((await loadInvitation(first.value.token, NOW)).ok).toBe(false);
    expect((await loadInvitation(second.value.token, NOW)).ok).toBe(true);
  });

  it('stellt die verlorene Einladung eines Unternehmens erneut aus', async () => {
    const { platform, adminUserId } = await platformContext();

    const created = await createManagedOrganization(
      platform,
      { name: 'Schreinerei Bosch', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    if (!created.ok) throw new Error('nicht angelegt');

    // Der Link geht verloren — hier: er wird schlicht nicht benutzt.
    const reissued = await reissueInvitation(
      platform,
      created.value.organizationId,
      'chef@bosch.example',
      adminUserId,
      null,
      NOW,
    );

    expect(reissued.ok).toBe(true);
    if (!reissued.ok) return;

    // Der alte Link gilt nicht mehr, der neue führt ins selbe Unternehmen mit
    // derselben Rolle.
    expect((await loadInvitation(created.value.token, NOW)).ok).toBe(false);

    const offer = await loadInvitation(reissued.value.token, NOW);
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    expect(offer.value.roleName).toBe(OWNER_ROLE_NAME);

    // Und er lässt sich einlösen.
    const accepted = await acceptInvitation(
      reissued.value.token,
      { name: 'Bosch', password: OWNER_PASSWORD },
      null,
      NOW,
    );
    expect(accepted.ok).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'chef@bosch.example' } });
    expect(user.organizationId).toBe(created.value.organizationId);
  });

  it('weist eine erneute Einladung an eine belegte Adresse ab', async () => {
    const { platform, adminUserId } = await platformContext();
    const created = await createManagedOrganization(
      platform,
      { name: 'Schreinerei Bosch', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    if (!created.ok) throw new Error('nicht angelegt');
    await acceptInvitation(
      created.value.token,
      { name: 'Bosch', password: OWNER_PASSWORD },
      null,
      NOW,
    );

    const again = await reissueInvitation(
      platform,
      created.value.organizationId,
      'chef@bosch.example',
      adminUserId,
      null,
      NOW,
    );

    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.kind).toBe('EMAIL_TAKEN');
  });

  /**
   * Die zweite Sackgasse: Das einzige Konto mit Rechteverwaltung hat sein
   * Passwort vergessen. Zurücksetzen kann es nur, wer `organization.administer`
   * hält — also nur es selbst.
   */
  it('setzt das Passwort eines ausgesperrten Mandantenkontos zurück', async () => {
    const { platform, adminUserId } = await platformContext();
    const created = await createManagedOrganization(
      platform,
      { name: 'Schreinerei Bosch', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    if (!created.ok) throw new Error('nicht angelegt');
    await acceptInvitation(
      created.value.token,
      { name: 'Bosch', password: OWNER_PASSWORD },
      null,
      NOW,
    );

    const signedIn = await login(
      { email: 'chef@bosch.example', password: OWNER_PASSWORD },
      CONTEXT,
      NOW,
    );
    if (!signedIn.ok || signedIn.value.kind !== 'SESSION') throw new Error('keine Sitzung');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'chef@bosch.example' } });

    const reset = await startTenantPasswordReset(platform, user.id, adminUserId, null, NOW);
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;

    // Alle Sitzungen des Kontos enden sofort.
    expect(await resolveSession(signedIn.value.session.token, NOW)).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);

    // Der Betreiber hat kein Passwort gesetzt — das tut der Inhaber.
    const done = await completePasswordReset(reset.value.token, 'Holunderbluete-im-Juni-8', null, NOW);
    expect(done.ok).toBe(true);

    expect(
      (await login({ email: 'chef@bosch.example', password: 'Holunderbluete-im-Juni-8' }, CONTEXT, NOW))
        .ok,
    ).toBe(true);
  });

  /**
   * Der Eingriff ist sichtbar — das ist der Preis, zu dem er zugelassen wurde.
   *
   * Er steht im Protokoll **des Unternehmens**, mit `actorKind: 'ADMIN'`. Wer
   * dort liest, sieht, dass der Anstoß von außen kam.
   */
  it('steht jeder Eingriff im Protokoll des Unternehmens', async () => {
    const { platform, adminUserId } = await platformContext();
    const created = await createManagedOrganization(
      platform,
      { name: 'Schreinerei Bosch', ownerEmail: 'chef@bosch.example' },
      adminUserId,
      null,
      NOW,
    );
    if (!created.ok) throw new Error('nicht angelegt');
    await acceptInvitation(
      created.value.token,
      { name: 'Bosch', password: OWNER_PASSWORD },
      null,
      NOW,
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'chef@bosch.example' } });

    await startTenantPasswordReset(platform, user.id, adminUserId, null, NOW);

    const entries = await prisma.auditLog.findMany({
      where: { organizationId: created.value.organizationId },
    });
    const reset = entries.find((entry) => entry.action === 'PASSWORD_RESET_REQUESTED');

    expect(reset).toBeDefined();
    expect(reset?.actorKind).toBe('ADMIN');
    expect(reset?.actorId).toBe(adminUserId);
  });
});
