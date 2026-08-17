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
import type { AdminSession, AdminUser, Organization, Prisma } from '@prisma/client';

import { clientFor } from './client';
import type { PlatformContext } from './platform-context';

export type { AdminSession, AdminUser };

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

/**
 * Wie viele Unternehmen es gibt.
 *
 * Die einzige Berührung mit dem Bestand, die B1 braucht — eine Zahl, aus der
 * sich nichts rekonstruieren lässt. Die Übersicht mit Kennzahlen je Unternehmen
 * entsteht in B5, zusammen mit der Spalte `User.lastLoginAt`.
 */
export async function countOrganizations(_context: PlatformContext): Promise<number> {
  return clientFor(undefined).organization.count();
}

export async function findOrganizationForPlatform(
  _context: PlatformContext,
  id: string,
): Promise<Organization | null> {
  return clientFor(undefined).organization.findUnique({ where: { id } });
}
