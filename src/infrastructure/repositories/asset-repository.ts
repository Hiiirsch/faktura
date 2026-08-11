/**
 * Hochgeladene Dateien je Organisation (FA-STAMM-05, NFA-SEC-16).
 *
 * Die Mandantengrenze zählt hier doppelt: Über `/assets/[id]` ist der Inhalt
 * abrufbar, und eine Kennung allein wäre sonst der Zugang zum Logo einer
 * fremden Organisation.
 */
import type { Asset, Prisma } from '@prisma/client';

import { clientFor } from './client';
import type { OrganizationContext } from './organization-context';

export type { Asset };

export async function createAsset(
  context: OrganizationContext,
  data: Omit<Prisma.AssetUncheckedCreateInput, 'organizationId'>,
): Promise<Asset> {
  return clientFor(undefined).asset.create({
    data: { ...data, organizationId: context.organizationId },
  });
}

export async function findAsset(
  context: OrganizationContext,
  id: string,
): Promise<Asset | null> {
  return clientFor(undefined).asset.findFirst({
    where: { id, organizationId: context.organizationId },
  });
}

/** Gibt zurück, ob ein Datensatz entfernt wurde. */
export async function deleteAsset(
  context: OrganizationContext,
  id: string,
): Promise<boolean> {
  const result = await clientFor(undefined).asset.deleteMany({
    where: { id, organizationId: context.organizationId },
  });
  return result.count > 0;
}
