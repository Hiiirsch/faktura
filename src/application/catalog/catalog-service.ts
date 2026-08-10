/**
 * Leistungskatalog (FA-STAMM-10).
 *
 * Wiederverwendbare Positionen für den Rechnungseditor. Preise liegen wie
 * überall als ganzzahlige Cent-Beträge vor (FA-CALC-01).
 */
import type { Cents } from '@/domain/money/money';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { getPrismaClient } from '@/infrastructure/db/prisma';

export type CatalogItemData = {
  readonly name: string;
  readonly description: string | null;
  readonly unitPriceCents: Cents;
  readonly unitCode: string;
  readonly taxRate: number;
};

export type CatalogItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly unitPriceCents: number;
  readonly unitCode: string;
  readonly taxRate: number;
  readonly isArchived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export async function listCatalogItems(includeArchived = false): Promise<readonly CatalogItem[]> {
  return getPrismaClient().catalogItem.findMany({
    where: includeArchived ? {} : { isArchived: false },
    orderBy: { name: 'asc' },
  });
}

export async function getCatalogItem(id: string): Promise<CatalogItem | null> {
  return getPrismaClient().catalogItem.findUnique({ where: { id } });
}

export async function createCatalogItem(
  data: CatalogItemData,
  actorId: string,
  ipAddress: string | null,
): Promise<CatalogItem> {
  const item = await getPrismaClient().catalogItem.create({ data });

  await recordAuditEntry({
    entityType: 'CatalogItem',
    entityId: item.id,
    action: 'CREATED',
    actorId,
    ipAddress,
    details: { name: item.name },
  });

  return item;
}

export async function updateCatalogItem(
  id: string,
  data: CatalogItemData,
  actorId: string,
  ipAddress: string | null,
): Promise<CatalogItem> {
  const item = await getPrismaClient().catalogItem.update({ where: { id }, data });

  await recordAuditEntry({
    entityType: 'CatalogItem',
    entityId: id,
    action: 'UPDATED',
    actorId,
    ipAddress,
  });

  return item;
}

export async function setCatalogItemArchived(
  id: string,
  isArchived: boolean,
  actorId: string,
  ipAddress: string | null,
): Promise<CatalogItem> {
  const item = await getPrismaClient().catalogItem.update({
    where: { id },
    data: { isArchived },
  });

  await recordAuditEntry({
    entityType: 'CatalogItem',
    entityId: id,
    action: isArchived ? 'ARCHIVED' : 'UNARCHIVED',
    actorId,
    ipAddress,
  });

  return item;
}
