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

// ─── Konten, aus der Sicht des Betreibers ───────────────────────────────────
//
// `user` ist ein Verwaltungsgegenstand: Der Betreiber sperrt Konten und sieht,
// wann sie sich zuletzt angemeldet haben. Was er nicht sieht, ist ihre Arbeit.

const forPlatformUser = {
  id: true,
  email: true,
  name: true,
  disabledAt: true,
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
