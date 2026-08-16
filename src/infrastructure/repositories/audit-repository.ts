/**
 * Zugriff auf das Protokoll je Organisation (NFA-COMP-01, NFA-COMP-02).
 *
 * Es gibt hier bewusst **kein Ändern und kein Löschen** — nur Anlegen und, seit
 * M7, Lesen für den Datenexport. Ändern und Löschen wehren zusätzlich
 * Datenbank-Trigger ab, auch gegenüber einem Zugriff, der an dieser Schicht
 * vorbeigeht.
 */
import type { AuditLog, Prisma } from '@prisma/client';

import { clientFor } from './client';
import type { OrganizationContext } from './organization-context';

export type AuditRow = Omit<Prisma.AuditLogUncheckedCreateInput, 'organizationId'>;

export async function createAuditEntry(
  context: OrganizationContext,
  row: AuditRow,
): Promise<void> {
  await clientFor(undefined).auditLog.create({
    data: { ...row, organizationId: context.organizationId },
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
