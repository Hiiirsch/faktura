/**
 * Schreibzugriff auf das Protokoll je Organisation (NFA-COMP-01, NFA-COMP-02).
 *
 * Es gibt hier bewusst nur `create`. Ändern und Löschen wehren zusätzlich
 * Datenbank-Trigger ab — auch gegenüber einem Zugriff, der an dieser Schicht
 * vorbeigeht.
 */
import type { Prisma } from '@prisma/client';

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
