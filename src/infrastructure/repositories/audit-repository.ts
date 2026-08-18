/**
 * Zugriff auf das Protokoll je Organisation (NFA-COMP-01, NFA-COMP-02).
 *
 * Es gibt hier bewusst **kein Ändern und kein Löschen** — nur Anlegen und, seit
 * M7, Lesen für den Datenexport. Ändern und Löschen wehren zusätzlich
 * Datenbank-Trigger ab, auch gegenüber einem Zugriff, der an dieser Schicht
 * vorbeigeht.
 */
import type { AuditLog, Prisma } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';
import type { PlatformContext } from './platform-context';

export type AuditRow = Omit<Prisma.AuditLogUncheckedCreateInput, 'organizationId'>;

export async function createAuditEntry(
  context: OrganizationContext,
  row: AuditRow,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).auditLog.create({
    data: { ...row, organizationId: context.organizationId },
  });
}

/**
 * Ein Protokolleintrag der **Verwaltung** (M8, FA-ADM-07).
 *
 * Der Betreiber führt keinen `OrganizationContext` — es gibt keinen, den er
 * führen könnte, und genau darin besteht die Trennung. Trotzdem gehört sein
 * Eingriff in das Protokoll des betroffenen Unternehmens: Wer dort liest, soll
 * sehen, dass eine Stilllegung von außen kam.
 *
 * Deshalb eine **zweite Funktion** statt eines optionalen Parameters an der
 * ersten. Die Organisationskennung kommt hier als gewöhnliche Zeichenkette, und
 * der `PlatformContext` ist der Nachweis, dass eine Adminsitzung dahintersteht.
 * Ein optionaler Parameter hätte beides vermischt und die Kontextpflicht
 * aufgeweicht — dann wäre `createAuditEntry` eine Funktion, die manchmal einen
 * Kontext braucht.
 *
 * `actorKind: 'ADMIN'` ist die Unterscheidung, die `actorId` allein nicht
 * trägt: Die Kennungen stammen aus zwei verschiedenen Tabellen.
 */
export async function createPlatformAuditEntry(
  _context: PlatformContext,
  organizationId: string,
  row: AuditRow,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).auditLog.create({
    data: { ...row, organizationId, actorKind: 'ADMIN' },
  });
}

/**
 * Das vollständige Protokoll eines Mandanten (NFA-COMP-03).
 *
 * Es gehört in den Datenexport: Ohne das Protokoll ist der Export eine
 * Momentaufnahme ohne Herkunft, und genau die Nachvollziehbarkeit ist der
 * Grund, warum es geführt wird.
 */
export async function listAuditEntries(
  context: OrganizationContext,
): Promise<readonly AuditLog[]> {
  return clientFor(undefined).auditLog.findMany({
    where: { organizationId: context.organizationId },
    orderBy: { createdAt: 'asc' },
  });
}
