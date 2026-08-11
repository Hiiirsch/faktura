/**
 * Firmenstammdaten je Organisation (FA-STAMM-01 bis -09).
 *
 * Genau ein Datensatz je Organisation; erzwungen vom eindeutigen Index auf
 * `organizationId`. `upsert` über diesen Index ist deshalb die einzige
 * Schreiboperation — ein zweiter Datensatz kann gar nicht entstehen.
 */
import type { CompanyProfile, Prisma } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';

export type { CompanyProfile };

export async function findCompanyProfile(
  context: OrganizationContext,
  handle?: TransactionHandle,
): Promise<CompanyProfile | null> {
  return clientFor(handle).companyProfile.findUnique({
    where: { organizationId: context.organizationId },
  });
}

export async function upsertCompanyProfile(
  context: OrganizationContext,
  create: Omit<Prisma.CompanyProfileUncheckedCreateInput, 'organizationId'>,
  update: Prisma.CompanyProfileUpdateInput,
): Promise<CompanyProfile> {
  return clientFor(undefined).companyProfile.upsert({
    where: { organizationId: context.organizationId },
    create: { ...create, organizationId: context.organizationId },
    update,
  });
}

export async function setCompanyLogoAsset(
  context: OrganizationContext,
  logoAssetId: string | null,
): Promise<void> {
  await clientFor(undefined).companyProfile.update({
    where: { organizationId: context.organizationId },
    data: { logoAssetId },
  });
}
