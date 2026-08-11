/**
 * Leistungskatalog je Organisation (FA-STAMM-10).
 */
import type { CatalogItem, Prisma } from '@prisma/client';

import { clientFor } from './client';
import type { OrganizationContext } from './organization-context';

export type { CatalogItem };

export async function listCatalogItems(
  context: OrganizationContext,
  includeArchived: boolean,
): Promise<readonly CatalogItem[]> {
  return clientFor(undefined).catalogItem.findMany({
    where: {
      organizationId: context.organizationId,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: { name: 'asc' },
  });
}

export async function findCatalogItem(
  context: OrganizationContext,
  id: string,
): Promise<CatalogItem | null> {
  return clientFor(undefined).catalogItem.findFirst({
    where: { id, organizationId: context.organizationId },
  });
}

export async function createCatalogItem(
  context: OrganizationContext,
  data: Omit<Prisma.CatalogItemUncheckedCreateInput, 'organizationId'>,
): Promise<CatalogItem> {
  return clientFor(undefined).catalogItem.create({
    data: { ...data, organizationId: context.organizationId },
  });
}

export async function updateCatalogItem(
  context: OrganizationContext,
  id: string,
  data: Prisma.CatalogItemUpdateInput,
): Promise<CatalogItem | null> {
  const result = await clientFor(undefined).catalogItem.updateMany({
    where: { id, organizationId: context.organizationId },
    data,
  });

  if (result.count === 0) {
    return null;
  }
  return findCatalogItem(context, id);
}
