/**
 * Datenzugriff der zentralen Verwaltung (M8, FA-ADM-02, FA-ADM-03).
 *
 * **Die zweite dokumentierte Ausnahme von der Kontextpflicht** — nach
 * `auth-repository.ts`. Diese Funktionen nehmen einen `PlatformContext` statt
 * eines `OrganizationContext`, weil sie zu keinem Mandanten gehören: Sie
 * verwalten Unternehmen und Konten, nicht deren Geschäft.
 *
 * **Was diese Datei nicht darf.** Der Auftraggeber hat entschieden: Die
 * Verwaltung sieht keine Geschäftsdaten. Hier steht die Grenze:
 *
 * - Frei zugänglich sind `organization`, `user`, `adminUser`, `adminSession`,
 *   `session` und `auditLog` — Verwaltungsgegenstände.
 * - Von `invoice`, `customer`, `catalogItem`, `payment`, `template`,
 *   `invoiceArtifact` und `companyProfile` darf **ausschließlich gezählt**
 *   werden (`.count()`), nie eine Zeile gelesen.
 *
 * Das ist keine Absichtserklärung: `tests/architecture/platform-repository.test.ts`
 * prüft genau diese Erlaubnisliste am Quelltext. Wer hier ein `findMany` auf
 * Belege schreibt, bricht den Test — nicht erst den Datenschutz.
 *
 * **Und es gibt keinen Weg zurück.** Keine Funktion in dieser Datei erzeugt
 * einen `OrganizationContext`. Damit kann aus einer Adminsitzung keine
 * Mandantensitzung werden (FA-ADM-04).
 */
import type {
  AdminInvitation,
  AdminSession,
  AdminUser,
  Organization,
  Prisma,
} from '@prisma/client';

import { clientFor, runInTransaction, type TransactionHandle } from './client';
import type { PlatformContext } from './platform-context';

export type { AdminInvitation, AdminSession, AdminUser };

export type AdminSessionWithUser = Prisma.AdminSessionGetPayload<{
  include: { adminUser: { select: { id: true; email: true; disabledAt: true } } };
}>;

// ─── Betreiberkonten ────────────────────────────────────────────────────────
//
// Ohne Kontext: Bei der Anmeldung ist noch nicht bekannt, wer da kommt — genau
// das ist das Ergebnis der Abfrage. Dieselbe Begründung wie in
// `auth-repository.ts`.

export async function findAdminUserByEmail(email: string): Promise<AdminUser | null> {
  return clientFor(undefined).adminUser.findUnique({ where: { email } });
}

export async function findAdminUserById(id: string): Promise<AdminUser | null> {
  return clientFor(undefined).adminUser.findUnique({ where: { id } });
}

export async function createAdminUser(
  data: Prisma.AdminUserUncheckedCreateInput,
): Promise<AdminUser> {
  return clientFor(undefined).adminUser.create({ data });
}

export async function updateAdminUser(
  id: string,
  data: Prisma.AdminUserUncheckedUpdateInput,
): Promise<void> {
  await clientFor(undefined).adminUser.update({ where: { id }, data });
}

export async function countAdminUsers(): Promise<number> {
  return clientFor(undefined).adminUser.count();
}

/**
 * Alle Betreiberkonten (M10, FA-ADM-12).
 *
 * **Mit `PlatformContext`**, anders als die drei Funktionen darüber: Die
 * Anmeldung muss ein Konto auflösen, bevor jemand da ist, und ist deshalb die
 * dokumentierte Ausnahme. Eine *Liste* zu lesen verlangt dagegen, schon
 * angemeldet zu sein — hier gilt die Regel, nicht die Ausnahme.
 *
 * Ohne Passwortfelder: Die Seite zeigt Adresse, Zustand und Anmeldungen, und was
 * eine Abfrage nicht mitbringt, kann keine Ansicht versehentlich ausgeben.
 */
export async function listAdminUsers(_platform: PlatformContext): Promise<
  readonly {
    readonly id: string;
    readonly email: string;
    readonly name: string | null;
    readonly totpEnabled: boolean;
    readonly disabledAt: Date | null;
    readonly lastLoginAt: Date | null;
    readonly createdAt: Date;
  }[]
> {
  return clientFor(undefined).adminUser.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      totpEnabled: true,
      disabledAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Sperrt ein Betreiberkonto oder gibt es wieder frei (M10, FA-ADM-12, -13).
 *
 * **Sperren beendet alle Sitzungen.** Die Auflösung wiese sie ohnehin ab — aber
 * erst beim nächsten Aufruf, und dazwischen läge ein Fenster. Dieselbe Regel wie
 * bei den Mitgliedern.
 *
 * **Die Aussperrsicherung steht hier und nicht in einem Trigger**, anders als
 * ihr Gegenstück auf der Mandantenseite. Der erste Anlauf war ein Trigger, und
 * er war falsch — er behauptete ein Invariant, das dieses System nicht hat:
 *
 * - `resetAdmin` sperrt das Konto **absichtlich** und stellt im selben Zug einen
 *   Einrichtungslink aus. In einer Anlage mit einem Betreiber führt dieser Weg
 *   also durch einen Zustand ohne aktives Konto — und das ist genau der Weg, der
 *   seit M8 die Rettung bei verlorenem Authenticator ist.
 * - `npm run admin:create` lässt sich mit einer **neuen** Adresse immer
 *   aufrufen. Wer Serverzugriff hat, kommt herein, gleich wie viele Konten
 *   gesperrt sind. Eine echte Sackgasse gibt es auf dieser Seite deshalb nicht.
 *
 * Was bleibt, ist die **Handlung** aus der Oberfläche: „Sperren" bietet keinen
 * Rückweg an, also darf es das letzte aktive Konto nicht treffen. Das ist eine
 * Eigenschaft dieses einen Vorgangs, nicht der Tabelle — und gehört damit
 * hierher. Der Unterschied zur Mandantenseite ist echt: Dort **kann** niemand
 * auf den Server, dort ist es ein Invariant.
 *
 * Gezählt wird **innerhalb** der Transaktion. SQLite hat genau einen Schreiber
 * (`connection_limit=1`), zwei gleichzeitige Sperrungen warten also aufeinander
 * statt beide ein zweites aktives Konto zu sehen.
 */
export async function setAdminUserDisabled(
  _platform: PlatformContext,
  id: string,
  disabledAt: Date | null,
): Promise<'ok' | 'last-administrator'> {
  return runInTransaction(async (handle) => {
    const client = clientFor(handle);

    if (disabledAt !== null) {
      const remaining = await client.adminUser.count({
        where: { disabledAt: null, id: { not: id } },
      });

      if (remaining === 0) {
        return 'last-administrator';
      }
    }

    await client.adminUser.update({ where: { id }, data: { disabledAt } });

    if (disabledAt !== null) {
      await client.adminSession.deleteMany({ where: { adminUserId: id } });
    }

    return 'ok';
  });
}

// ─── Einrichtung eines Betreiberkontos (FA-ADM-06, -08) ────────────────────
//
// Ohne Kontext, wie die Anmeldung: Wer den Nachweis vorlegt, ist noch niemand.

export async function findAdminInvitationByTokenHash(
  tokenHash: string,
): Promise<AdminInvitation | null> {
  return clientFor(undefined).adminInvitation.findUnique({ where: { tokenHash } });
}

export async function revokeOpenAdminInvitationsFor(
  email: string,
  revokedAt: Date,
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).adminInvitation.updateMany({
    where: { email, acceptedAt: null, revokedAt: null },
    data: { revokedAt },
  });
  return result.count;
}

/**
 * Stellt einen Einrichtungsnachweis aus.
 *
 * Erst zurückziehen, dann ausstellen — der partielle Index
 * `AdminInvitation_one_open_per_email` kennt die Frist nicht, ein abgelaufener
 * Nachweis stünde einem neuen sonst im Weg.
 */
export async function createAdminInvitation(data: {
  readonly email: string;
  readonly tokenHash: string;
  readonly totpSecret: string;
  readonly kind: 'CREATE' | 'RESET';
  readonly expiresAt: Date;
}): Promise<AdminInvitation> {
  return runInTransaction(async (handle) => {
    await revokeOpenAdminInvitationsFor(data.email, new Date(), handle);
    return clientFor(handle).adminInvitation.create({ data });
  });
}

/**
 * Löst den Nachweis ein: Betreiberkonto anlegen, Nachweis verbrauchen — **eine
 * Transaktion**.
 *
 * Bräche sie in der Mitte ab, gäbe es entweder ein Konto ohne verbrauchten
 * Nachweis (der Link funktionierte weiter) oder einen verbrauchten Nachweis ohne
 * Konto (niemand käme mehr hinein). Beides wäre schlechter als ein
 * fehlgeschlagener Versuch.
 *
 * `totpEnabled: true` steht hier fest und nicht als Parameter: Ein
 * Betreiberkonto ohne zweiten Faktor gibt es nicht (FA-ADM-08), und ein
 * Schalter dafür wäre die Einladung, ihn irgendwann auf `false` zu setzen.
 */
export async function redeemAdminInvitation(
  invitationId: string,
  data: {
    readonly email: string;
    readonly name: string | null;
    readonly passwordHash: string;
    readonly totpSecret: string;
  },
  acceptedAt: Date,
): Promise<AdminUser> {
  return runInTransaction(async (handle) => {
    const client = clientFor(handle);

    const admin = await client.adminUser.create({
      data: { ...data, totpEnabled: true },
    });

    await client.adminInvitation.update({
      where: { id: invitationId },
      data: { acceptedAt },
    });

    return admin;
  });
}

/**
 * Ersetzt die Zugangsdaten eines vorhandenen Betreiberkontos (`RESET`).
 *
 * **Ersetzen statt löschen und neu anlegen.** Das Protokoll nennt den Betreiber
 * über seine Kennung (`actorKind: 'ADMIN'`); ein gelöschtes Konto ließe jeden
 * dieser Einträge ins Leere zeigen. Es ist dieselbe Regel wie bei den
 * Mitgliedern — wer geht, wird gesperrt, damit der Beleg seinen Urheber behält.
 *
 * Die Sperre fällt hier, denn sie war der Zweck des Resets: Zwischen dem
 * Ausstellen des Nachweises und seinem Einlösen ist das Konto gesperrt, damit
 * niemand mit dem alten Passwort hineinkommt.
 *
 * Alle Sitzungen enden — wer sein Konto zurücksetzt, tut das oft, weil etwas
 * abhandengekommen ist.
 */
export async function reenrollAdminUser(
  invitationId: string,
  adminUserId: string,
  data: { readonly name: string | null; readonly passwordHash: string; readonly totpSecret: string },
  acceptedAt: Date,
): Promise<void> {
  await runInTransaction(async (handle) => {
    const client = clientFor(handle);

    await client.adminUser.update({
      where: { id: adminUserId },
      data: {
        ...data,
        totpEnabled: true,
        disabledAt: null,
        failedLogins: 0,
        lockedUntil: null,
      },
    });

    await client.adminSession.deleteMany({ where: { adminUserId } });
    await client.adminInvitation.update({
      where: { id: invitationId },
      data: { acceptedAt },
    });
  });
}

/**
 * Sperrt ein Betreiberkonto und stellt in einem Zug einen Nachweis aus.
 *
 * **Eine Transaktion**, weil beides zusammengehört: Bräche sie zwischen Sperre
 * und Nachweis ab, stünde ein gesperrtes Konto ohne Weg zurück da — genau die
 * Lage, aus der der Reset heraushelfen soll.
 */
export async function suspendAdminForReset(
  adminUserId: string,
  invitation: {
    readonly email: string;
    readonly tokenHash: string;
    readonly totpSecret: string;
    readonly expiresAt: Date;
  },
  now: Date,
): Promise<void> {
  await runInTransaction(async (handle) => {
    const client = clientFor(handle);

    await client.adminUser.update({
      where: { id: adminUserId },
      data: { disabledAt: now },
    });
    await client.adminSession.deleteMany({ where: { adminUserId } });

    await client.adminInvitation.updateMany({
      where: { email: invitation.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await client.adminInvitation.create({ data: { ...invitation, kind: 'RESET' } });
  });
}

// ─── Sitzungen der Verwaltung ───────────────────────────────────────────────

export async function createAdminSessionRow(
  data: Prisma.AdminSessionUncheckedCreateInput,
): Promise<void> {
  await clientFor(undefined).adminSession.create({ data });
}

export async function findAdminSessionByTokenHash(
  tokenHash: string,
): Promise<AdminSessionWithUser | null> {
  return clientFor(undefined).adminSession.findUnique({
    where: { tokenHash },
    include: { adminUser: { select: { id: true, email: true, disabledAt: true } } },
  });
}

export async function touchAdminSession(id: string, lastSeenAt: Date): Promise<void> {
  await clientFor(undefined).adminSession.update({ where: { id }, data: { lastSeenAt } });
}

export async function deleteAdminSession(id: string): Promise<void> {
  await clientFor(undefined).adminSession.delete({ where: { id } }).catch(() => undefined);
}

export async function deleteAdminSessionByTokenHash(tokenHash: string): Promise<void> {
  await clientFor(undefined).adminSession.deleteMany({ where: { tokenHash } });
}

// ─── Unternehmen ────────────────────────────────────────────────────────────

export async function countOrganizations(_context: PlatformContext): Promise<number> {
  return clientFor(undefined).organization.count();
}

export async function findOrganizationForPlatform(
  _context: PlatformContext,
  id: string,
): Promise<Organization | null> {
  return clientFor(undefined).organization.findUnique({ where: { id } });
}

/**
 * Die Kennzahlen eines Unternehmens — **Zahlen, keine Zeilen** (FA-ADM-03).
 *
 * `_count` ist die einzige Form, in der Geschäftsdaten hier auftauchen dürfen.
 * Aus „14 Rechnungen" lässt sich kein Beleg rekonstruieren; ohne diese Zahl
 * könnte der Betreiber nicht einmal erkennen, ob ein Unternehmen die Anwendung
 * überhaupt benutzt.
 *
 * Die Grenze steht im Kopf dieser Datei und wird von
 * `tests/architecture/platform-repository.test.ts` geprüft — einschließlich der
 * Form: Ein `include: { invoices: true }` wäre kein Zählen, sondern ein Lesen,
 * und es sieht einem `_count` zum Verwechseln ähnlich.
 */
const withMetrics = {
  _count: { select: { users: true, invoices: true, customers: true } },
} satisfies Prisma.OrganizationInclude;

export type OrganizationMetrics = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly suspendedAt: Date | null;
  readonly userCount: number;
  readonly invoiceCount: number;
  readonly customerCount: number;
  /** Die jüngste Anmeldung irgendeines Kontos — `null`, wenn noch keine war. */
  readonly lastLoginAt: Date | null;
};

function toMetrics(
  row: Prisma.OrganizationGetPayload<{ include: typeof withMetrics }>,
  lastLoginAt: Date | null,
): OrganizationMetrics {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    suspendedAt: row.suspendedAt,
    userCount: row._count.users,
    invoiceCount: row._count.invoices,
    customerCount: row._count.customers,
    lastLoginAt,
  };
}

/**
 * Die letzte Anmeldung je Organisation, in **einer** Abfrage.
 *
 * `groupBy` statt einer Abfrage je Unternehmen: Bei zwanzig Mandanten wären das
 * zwanzig Rundreisen für eine Spalte in einer Übersicht.
 */
async function lastLoginByOrganization(): Promise<ReadonlyMap<string, Date>> {
  const rows = await clientFor(undefined).user.groupBy({
    by: ['organizationId'],
    _max: { lastLoginAt: true },
  });

  const map = new Map<string, Date>();
  for (const row of rows) {
    const value = row._max.lastLoginAt;
    if (value !== null) {
      map.set(row.organizationId, value);
    }
  }
  return map;
}

export async function listOrganizationsWithMetrics(
  _context: PlatformContext,
): Promise<readonly OrganizationMetrics[]> {
  const [rows, lastLogins] = await Promise.all([
    clientFor(undefined).organization.findMany({
      include: withMetrics,
      orderBy: { createdAt: 'asc' },
    }),
    lastLoginByOrganization(),
  ]);

  return rows.map((row) => toMetrics(row, lastLogins.get(row.id) ?? null));
}

export async function findOrganizationWithMetrics(
  _context: PlatformContext,
  id: string,
): Promise<OrganizationMetrics | null> {
  const row = await clientFor(undefined).organization.findUnique({
    where: { id },
    include: withMetrics,
  });

  if (row === null) {
    return null;
  }

  const newest = await clientFor(undefined).user.aggregate({
    where: { organizationId: id },
    _max: { lastLoginAt: true },
  });

  return toMetrics(row, newest._max.lastLoginAt);
}

export async function updateOrganizationForPlatform(
  _context: PlatformContext,
  id: string,
  data: Prisma.OrganizationUncheckedUpdateManyInput,
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).organization.updateMany({ where: { id }, data });
  return result.count;
}

/**
 * Legt ein Unternehmen an — Organisation, Rolle „Inhaber", Einladung, **eine
 * Transaktion** (FA-ORG-02, FA-ADM-05).
 *
 * Dass die drei zusammen entstehen, ist keine Bequemlichkeit. Bräche der Lauf in
 * der Mitte ab, gäbe es eine Organisation ohne Rolle und damit ein Unternehmen,
 * in das niemand hineinkommt — nicht einmal der Betreiber, denn er kann keine
 * Mandantensitzung eröffnen.
 *
 * **Der Betreiber kennt zu keinem Zeitpunkt ein Mandantenpasswort.** Was hier
 * entsteht, ist eine Einladung; das Passwort setzt der Inhaber selbst
 * (FA-MEMB-03). Das ist der stärkste Beleg für „keine Geschäftsdaten", den das
 * System liefern kann: Es gibt keinen Weg vom Adminkonto in einen Mandanten, und
 * er fehlt nicht aus Nachlässigkeit, sondern weil ihn niemand gebaut hat.
 */
export async function createOrganizationWithOwner(
  _context: PlatformContext,
  data: {
    readonly name: string;
    readonly ownerEmail: string;
    readonly ownerRoleName: string;
    readonly permissionKeys: readonly string[];
    readonly tokenHash: string;
    readonly invitationExpiresAt: Date;
  },
): Promise<{ readonly organizationId: string; readonly invitationId: string }> {
  return runInTransaction(async (handle) => {
    const client = clientFor(handle);

    /*
     * Erst zurückziehen, dann anlegen (M9/B1).
     *
     * `Invitation_one_open_per_email` ist **global** partiell eindeutig: Eine
     * offene Einladung an dieselbe Adresse — aus einem früheren, aufgegebenen
     * Anlauf — ließ die ganze Transaktion an einem Indexfehler scheitern, und
     * der Betreiber bekam einen Datenbankfehler statt einer Meldung.
     *
     * Dieselbe Reihenfolge wie in `inviteMember` (`invitation-service.ts`), und
     * mit derselben Bedeutung: Wer erneut einlädt, entwertet den alten Link.
     */
    await client.invitation.updateMany({
      where: { email: data.ownerEmail, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const organization = await client.organization.create({ data: { name: data.name } });

    const role = await client.role.create({
      data: {
        organizationId: organization.id,
        name: data.ownerRoleName,
        permissions: {
          create: data.permissionKeys.map((permissionKey) => ({
            organizationId: organization.id,
            permissionKey,
          })),
        },
      },
    });

    const invitation = await client.invitation.create({
      data: {
        organizationId: organization.id,
        email: data.ownerEmail,
        roleId: role.id,
        tokenHash: data.tokenHash,
        expiresAt: data.invitationExpiresAt,
        // Kein `invitedById`: Eingeladen hat der Betreiber, und der ist kein
        // `User`. Wer es war, steht im Protokoll mit `actorKind: 'ADMIN'`.
      },
    });

    return { organizationId: organization.id, invitationId: invitation.id };
  });
}

/**
 * Stellt eine neue Einladung für das Inhaberkonto aus (M9/B1).
 *
 * **Warum der Betreiber das können muss.** Die Einladung eines Unternehmens
 * erscheint genau einmal. Geht sie verloren, kam bis M9 niemand mehr hinein: Die
 * Mitgliederverwaltung erreicht nur, wer schon drin ist, und der Betreiber hatte
 * keinen Weg. Ein Zugang, dessen Verlust niemand heilen kann, ist kein Zugang,
 * sondern eine Falle — dieselbe Klasse Fehler wie beim Betreiberkonto selbst,
 * dort mit `admin:reset` behoben.
 *
 * Die Rolle bleibt, was sie war: die des vorhandenen Nachweises, sonst die
 * Inhaberrolle. Der Betreiber wählt sie nicht — welche Rechte im Unternehmen
 * gelten, geht ihn nichts an.
 */
export async function reissueOwnerInvitation(
  _context: PlatformContext,
  organizationId: string,
  data: {
    readonly email: string;
    readonly roleId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  },
  now: Date,
): Promise<string> {
  return runInTransaction(async (handle) => {
    const client = clientFor(handle);

    await client.invitation.updateMany({
      where: { email: data.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });

    const invitation = await client.invitation.create({
      data: { organizationId, ...data },
    });

    return invitation.id;
  });
}

/** Offene Einladungen eines Unternehmens — für die Adminansicht. */
export async function listOpenInvitationsForPlatform(
  _context: PlatformContext,
  organizationId: string,
): Promise<
  readonly {
    readonly id: string;
    readonly email: string;
    readonly roleId: string;
    readonly expiresAt: Date;
  }[]
> {
  return clientFor(undefined).invitation.findMany({
    where: { organizationId, acceptedAt: null, revokedAt: null },
    select: { id: true, email: true, roleId: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeInvitationForPlatform(
  _context: PlatformContext,
  organizationId: string,
  invitationId: string,
  now: Date,
): Promise<number> {
  const result = await clientFor(undefined).invitation.updateMany({
    where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count;
}

/**
 * Die Rolle, die eine neue Einladung mitbringen soll.
 *
 * Der offene Nachweis nennt sie, sonst die Rolle mit der Rechteverwaltung — denn
 * genau die fehlt, wenn ein Unternehmen sich ausgesperrt hat. Gibt es keine,
 * bleibt `null` und der Aufrufer meldet das.
 */
export async function findOwnerRoleId(
  _context: PlatformContext,
  organizationId: string,
): Promise<string | null> {
  const role = await clientFor(undefined).role.findFirst({
    where: {
      organizationId,
      permissions: { some: { permissionKey: 'organization.administer' } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  return role?.id ?? null;
}

/**
 * Stellt einen Passwortzurücksetzungsnachweis für ein **Mandantenkonto** aus
 * (M9/B1).
 *
 * **Die heikelste Funktion dieser Datei.** Sie ist der einzige Weg, auf dem der
 * Betreiber etwas anfassen kann, das einem Konto in einem Unternehmen gehört.
 * Gebaut wurde sie für eine Sackgasse: Verliert das einzige Konto mit
 * `organization.administer` sein Passwort, kann es niemand zurücksetzen — die
 * Zurücksetzung verlangt genau dieses Recht.
 *
 * **Was sie nicht tut:** ein Passwort setzen, eine Sitzung eröffnen oder Daten
 * lesen. Sie stellt einen Nachweis aus, den ein Mensch einlöst. Der Betreiber
 * könnte ihn selbst einlösen und das Konto übernehmen — das ist der bewusst in
 * Kauf genommene Preis (Plan M9, H6), und deshalb steht der Vorgang mit
 * `actorKind: 'ADMIN'` im Protokoll **des Unternehmens**, und alle Sitzungen des
 * Kontos enden dabei.
 */
export async function createTenantPasswordReset(
  _context: PlatformContext,
  userId: string,
  data: { readonly tokenHash: string; readonly expiresAt: Date },
): Promise<void> {
  await runInTransaction(async (handle) => {
    const client = clientFor(handle);

    // Ein neuer Nachweis entwertet ältere — dieselbe Regel wie überall.
    await client.passwordReset.deleteMany({ where: { userId, usedAt: null } });
    await client.passwordReset.create({ data: { userId, ...data } });
    await client.session.deleteMany({ where: { userId } });
    // Und die vertrauten Geräte (M9): Ein Konto, dessen Passwort zurückgesetzt
    // wird, soll nicht über ein gemerktes Gerät am zweiten Faktor vorbei
    // erreichbar bleiben.
    await client.trustedDevice.deleteMany({ where: { userId } });
  });
}

// ─── Konten, aus der Sicht des Betreibers ───────────────────────────────────
//
// `user` ist ein Verwaltungsgegenstand: Der Betreiber sperrt Konten und sieht,
// wann sie sich zuletzt angemeldet haben. Was er nicht sieht, ist ihre Arbeit.

const forPlatformUser = {
  id: true,
  email: true,
  name: true,
  disabledAt: true,
  anonymizedAt: true,
  lastLoginAt: true,
  createdAt: true,
  organizationId: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

export type PlatformUser = Prisma.UserGetPayload<{ select: typeof forPlatformUser }>;

export async function listUsersForPlatform(
  _context: PlatformContext,
  organizationId: string,
): Promise<readonly PlatformUser[]> {
  return clientFor(undefined).user.findMany({
    where: { organizationId },
    select: forPlatformUser,
    orderBy: [{ disabledAt: 'asc' }, { email: 'asc' }],
  });
}

export async function findUserForPlatform(
  _context: PlatformContext,
  id: string,
): Promise<PlatformUser | null> {
  return clientFor(undefined).user.findUnique({ where: { id }, select: forPlatformUser });
}

export async function updateUserForPlatform(
  _context: PlatformContext,
  id: string,
  data: Prisma.UserUncheckedUpdateManyInput,
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).user.updateMany({ where: { id }, data });
  return result.count;
}

/**
 * Beendet alle Sitzungen eines Unternehmens.
 *
 * Beim Stilllegen: Die Sitzungsauflösung weist eine Sitzung mit stillgelegter
 * Organisation ohnehin ab und entfernt sie dabei — aber erst beim nächsten
 * Aufruf. Sie hier zu löschen macht aus „beim nächsten Klick draußen" ein
 * „sofort draußen".
 */
export async function deleteSessionsOfOrganization(
  _context: PlatformContext,
  organizationId: string,
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).session.deleteMany({
    where: { user: { organizationId } },
  });
  return result.count;
}

/**
 * Die interne Notiz eines Unternehmens (M10, B4, FA-ADM-16).
 *
 * **Eigene Funktion statt eines Felds an `OrganizationMetrics`.** Der erste
 * Anlauf hängte sie dort an — und ein bestehender Test hat das abgewiesen, zu
 * Recht: Jener Typ heißt „Kennzahlen" und trägt Zahlen. Eine Notiz ist Inhalt,
 * kein Maß, und in der Liste aller Unternehmen hat sie nichts zu suchen.
 *
 * Gelesen wird sie deshalb nur dort, wo sie hingehört: auf der Detailseite eines
 * Unternehmens im Adminbereich.
 */
export async function findOrganizationNote(
  _platform: PlatformContext,
  id: string,
): Promise<string | null> {
  const row = await clientFor(undefined).organization.findUnique({
    where: { id },
    select: { note: true },
  });

  return row?.note ?? null;
}

/**
 * Ein Konto unkenntlich machen (M10, B3, FA-ADM-15).
 *
 * **Gelöscht wird nichts.** Die Zeile bleibt, damit `Invoice.createdById` nicht
 * ins Leere zeigt und ein Protokolleintrag seinen Akteur behält. Entfernt wird
 * die **Person**: Adresse, Name, Zugangsdaten und jede Spur, mit der sich noch
 * anmelden ließe.
 *
 * **Die Platzhalteradresse trägt die Kennung** und endet auf `.invalid` — eine
 * nach RFC 2606 reservierte Domain, die niemandem gehören kann. Die Kennung
 * darin hält den eindeutigen Index; ohne sie kollidierte die zweite
 * Anonymisierung mit der ersten.
 *
 * **`disabledAt` wird mitgesetzt**, und `roleId` fällt weg. Ein Zugang ohne
 * Person wäre ein Zugang ohne Verantwortlichen; Rechte ohne Träger ebenso.
 * Beides sind Spalten, auf die die Aussperrsicherung hört — trifft es das letzte
 * Konto mit Rechteverwaltung, bricht der Trigger den Vorgang ab. Das ist kein
 * Sonderfall, sondern der Beweis, dass die Regel dort liegt, wo sie hingehört.
 *
 * **Alles in einer Transaktion.** Eine halb anonymisierte Zeile wäre ein Konto
 * ohne Namen, das sich noch anmelden kann.
 */
export async function anonymizeUserForPlatform(
  _platform: PlatformContext,
  userId: string,
  data: { readonly email: string; readonly passwordHash: string; readonly now: Date },
): Promise<void> {
  await runInTransaction(async (handle) => {
    const client = clientFor(handle);

    await client.user.update({
      where: { id: userId },
      data: {
        email: data.email,
        name: null,
        passwordHash: data.passwordHash,
        totpSecret: null,
        totpEnabled: false,
        failedLogins: 0,
        lockedUntil: null,
        roleId: null,
        disabledAt: data.now,
        anonymizedAt: data.now,
      },
    });

    // Jede Spur, mit der sich noch anmelden ließe.
    await client.session.deleteMany({ where: { userId } });
    await client.trustedDevice.deleteMany({ where: { userId } });
    await client.webAuthnCredential.deleteMany({ where: { userId } });
    await client.recoveryCode.deleteMany({ where: { userId } });
    await client.pendingLogin.deleteMany({ where: { userId } });
    await client.passwordReset.deleteMany({ where: { userId, usedAt: null } });
  });
}

// ─── Protokoll der Verwaltung (M10, B2, FA-ADM-14) ──────────────────────────

export type PlatformAuditRow = {
  readonly organizationId: string | null;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly detailsJson?: string | null;
  readonly ipAddress?: string | null;
};

/**
 * Ein Eintrag im Protokoll **des Unternehmens** (M8, FA-ADM-07).
 *
 * Umgezogen aus `audit-repository.ts` (M10/B2). Dort nahm er einen
 * `PlatformContext` und lag damit außerhalb der Reichweite des Wächters, der nur
 * diese Datei liest — eine Lesefunktion auf `auditLog` hätte sich daneben
 * anlegen lassen, ohne dass jemand die Frage hätte beantworten müssen.
 *
 * Die Organisationskennung kommt als gewöhnliche Zeichenkette, der
 * `PlatformContext` ist der Nachweis. `actorKind: 'ADMIN'` ist die
 * Unterscheidung, die `actorId` allein nicht trägt: Die Kennungen stammen aus
 * zwei verschiedenen Tabellen.
 *
 * **Auf `auditLog` schreibt der Betreiber, er liest dort nie.** Was er zu sehen
 * bekommt, steht in `PlatformAuditEntry`.
 */
export async function createPlatformAuditEntry(
  _platform: PlatformContext,
  organizationId: string,
  row: {
    readonly entityType: string;
    readonly entityId: string;
    readonly action: string;
    readonly actorId?: string | null;
    readonly diffJson?: string | null;
    readonly ipAddress?: string | null;
  },
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).auditLog.create({
    data: { ...row, organizationId, actorKind: 'ADMIN' },
  });
}

/** Ein Eintrag im Protokoll **der Anlage** (M10, FA-ADM-14). */
export async function createPlatformAuditRow(
  platform: PlatformContext,
  row: PlatformAuditRow,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).platformAuditEntry.create({
    data: { ...row, actorId: platform.adminUserId },
  });
}

export type PlatformAuditView = {
  readonly id: string;
  readonly actorId: string;
  readonly actorEmail: string | null;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
};

/**
 * Das Protokoll der Verwaltung, neueste zuerst (M10, FA-ADM-14).
 *
 * **Ohne `include`, mit zwei Nachschlagetabellen.** Ein `include` auf
 * `organization` wäre bequem, liefe aber genau in die Form, die der Wächter seit
 * M8/B5 verbietet: eine Beziehung, die vollständige Zeilen mitbringt. Namen
 * werden deshalb einzeln geholt und im Speicher zugeordnet — bei einem
 * Protokoll, das seitenweise gelesen wird, kostet das nichts.
 *
 * Aufgelöst wird nur, was noch existiert. Ein Eintrag bleibt lesbar, auch wenn
 * sein Gegenstand es nicht mehr ist — das ist der Zweck eines Protokolls.
 */
export async function listPlatformAuditEntries(
  _platform: PlatformContext,
  limit = 200,
): Promise<readonly PlatformAuditView[]> {
  const entries = await clientFor(undefined).platformAuditEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const [admins, organizations] = await Promise.all([
    clientFor(undefined).adminUser.findMany({ select: { id: true, email: true } }),
    clientFor(undefined).organization.findMany({ select: { id: true, name: true } }),
  ]);

  const adminById = new Map(admins.map((admin) => [admin.id, admin.email]));
  const nameById = new Map(organizations.map((organization) => [organization.id, organization.name]));

  return entries.map((entry) => ({
    id: entry.id,
    actorId: entry.actorId,
    actorEmail: adminById.get(entry.actorId) ?? null,
    organizationId: entry.organizationId,
    organizationName:
      entry.organizationId === null ? null : (nameById.get(entry.organizationId) ?? null),
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    ipAddress: entry.ipAddress,
    createdAt: entry.createdAt,
  }));
}

/**
 * Impressum und Datenschutzzusatz des Betreibers (M13, NFA-COMP-07, -08).
 *
 * **Ohne `PlatformContext` beim Lesen**, und das ist eine bewusste Ausnahme:
 * Die öffentlichen Seiten `/impressum` und `/datenschutz` müssen ohne jede
 * Sitzung antworten — ein Impressum hinter einer Anmeldung wäre keins. Es ist
 * dieselbe Art Ausnahme wie `pingDatabase()` für den Healthcheck: Was hier
 * herauskommt, ist ohnehin für jeden bestimmt.
 *
 * Geschrieben wird dagegen **nur mit Nachweis** — das ist ein Eingriff des
 * Betreibers.
 */
export type PlatformSettingsView = {
  readonly imprint: string | null;
  readonly privacyAddendum: string | null;
  readonly updatedAt: Date | null;
};

/** Die feste Kennung der einen Zeile. */
const PLATFORM_SETTINGS_ID = 'platform';

export async function findPlatformSettings(): Promise<PlatformSettingsView> {
  const row = await clientFor(undefined).platformSettings.findUnique({
    where: { id: PLATFORM_SETTINGS_ID },
  });

  if (row === null) {
    return { imprint: null, privacyAddendum: null, updatedAt: null };
  }

  return {
    imprint: row.imprint,
    privacyAddendum: row.privacyAddendum,
    updatedAt: row.updatedAt,
  };
}

export async function savePlatformSettings(
  _platform: PlatformContext,
  values: { readonly imprint: string | null; readonly privacyAddendum: string | null },
): Promise<void> {
  await clientFor(undefined).platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, ...values },
    update: values,
  });
}
