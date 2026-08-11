/**
 * Leistungskatalog (FA-STAMM-10).
 *
 * Wiederverwendbare Positionen für den Rechnungseditor. Preise liegen wie
 * überall als ganzzahlige Cent-Beträge vor (FA-CALC-01).
 */
import type { Cents } from '@/domain/money/money';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import {
  createCatalogItem as insertCatalogItem,
  findCatalogItem,
  listCatalogItems as queryCatalogItems,
  updateCatalogItem as writeCatalogItem,
} from '@/infrastructure/repositories/catalog-repository';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';

export type CatalogItemData = {
  readonly name: string;
  readonly description: string | null;
  readonly unitPriceCents: Cents;
  readonly unitCode: string;
  /** Basispunkte: 1900 = 19 %. */
  readonly taxRateBasisPoints: number;
};

export type CatalogItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly unitPriceCents: number;
  readonly unitCode: string;
  readonly taxRateBasisPoints: number;
  readonly isArchived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export async function listCatalogItems(
  context: OrganizationContext,
  includeArchived = false,
): Promise<readonly CatalogItem[]> {
  return queryCatalogItems(context, includeArchived);
}

export async function getCatalogItem(
  context: OrganizationContext,
  id: string,
): Promise<CatalogItem | null> {
  return findCatalogItem(context, id);
}

export async function createCatalogItem(
  context: OrganizationContext,
  data: CatalogItemData,
  actorId: string,
  ipAddress: string | null,
): Promise<CatalogItem> {
  const item = await insertCatalogItem(context, data);

  await recordAuditEntry(context, {
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
  context: OrganizationContext,
  id: string,
  data: CatalogItemData,
  actorId: string,
  ipAddress: string | null,
): Promise<CatalogItem | null> {
  const item = await writeCatalogItem(context, id, data);
  if (item === null) {
    return null;
  }

  await recordAuditEntry(context, {
    entityType: 'CatalogItem',
    entityId: id,
    action: 'UPDATED',
    actorId,
    ipAddress,
  });

  return item;
}

export async function setCatalogItemArchived(
  context: OrganizationContext,
  id: string,
  isArchived: boolean,
  actorId: string,
  ipAddress: string | null,
): Promise<CatalogItem | null> {
  const item = await writeCatalogItem(context, id, { isArchived });
  if (item === null) {
    return null;
  }

  await recordAuditEntry(context, {
    entityType: 'CatalogItem',
    entityId: id,
    action: isArchived ? 'ARCHIVED' : 'UNARCHIVED',
    actorId,
    ipAddress,
  });

  return item;
}
