/**
 * Rechnungsvorlagen je Organisation (FA-TPL-01 bis -03, -08).
 *
 * Die Standardvorlage wird beim Setzen in einer Transaktion umgehängt: erst
 * alle zurücknehmen, dann eine setzen. Der partielle eindeutige Index aus der
 * Migration lässt die umgekehrte Reihenfolge gar nicht zu — und genau das ist
 * der Zweck, denn zwei Standardvorlagen wären ein Zustand, in dem willkürlich
 * eine gewinnt.
 */
import type { Prisma, Template } from '@prisma/client';

import { clientFor, runInTransaction, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';

export type { Template };

export type TemplateData = Omit<Prisma.TemplateUncheckedCreateInput, 'organizationId'>;

export async function listTemplates(
  context: OrganizationContext,
): Promise<readonly Template[]> {
  return clientFor(undefined).template.findMany({
    where: { organizationId: context.organizationId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

export async function findTemplate(
  context: OrganizationContext,
  id: string,
  handle?: TransactionHandle,
): Promise<Template | null> {
  return clientFor(handle).template.findFirst({
    where: { id, organizationId: context.organizationId },
  });
}

export async function findTemplateByName(
  context: OrganizationContext,
  name: string,
): Promise<Template | null> {
  return clientFor(undefined).template.findUnique({
    where: { organizationId_name: { organizationId: context.organizationId, name } },
  });
}

export async function findDefaultTemplate(
  context: OrganizationContext,
): Promise<Template | null> {
  return clientFor(undefined).template.findFirst({
    where: { organizationId: context.organizationId, isDefault: true },
  });
}

export async function countTemplates(context: OrganizationContext): Promise<number> {
  return clientFor(undefined).template.count({
    where: { organizationId: context.organizationId },
  });
}

export async function createTemplate(
  context: OrganizationContext,
  data: TemplateData,
  handle?: TransactionHandle,
): Promise<Template> {
  return clientFor(handle).template.create({
    data: { ...data, organizationId: context.organizationId },
  });
}

export async function updateTemplate(
  context: OrganizationContext,
  id: string,
  data: Prisma.TemplateUncheckedUpdateInput,
): Promise<boolean> {
  const result = await clientFor(undefined).template.updateMany({
    where: { id, organizationId: context.organizationId },
    data,
  });
  return result.count > 0;
}

export async function deleteTemplate(
  context: OrganizationContext,
  id: string,
): Promise<boolean> {
  const result = await clientFor(undefined).template.deleteMany({
    where: { id, organizationId: context.organizationId, isDefault: false },
  });
  return result.count > 0;
}

/** Hängt die Marke um. Gibt `false` zurück, wenn es die Vorlage nicht gibt. */
export async function setDefaultTemplate(
  context: OrganizationContext,
  id: string,
): Promise<boolean> {
  return runInTransaction(async (handle) => {
    const client = clientFor(handle);

    const target = await client.template.findFirst({
      where: { id, organizationId: context.organizationId },
      select: { id: true },
    });
    if (target === null) {
      return false;
    }

    // Erst zurücknehmen, dann setzen — die andere Reihenfolge verletzt den
    // eindeutigen Index und bräche die Transaktion ab.
    await client.template.updateMany({
      where: { organizationId: context.organizationId, isDefault: true },
      data: { isDefault: false },
    });
    await client.template.updateMany({
      where: { id, organizationId: context.organizationId },
      data: { isDefault: true },
    });

    return true;
  });
}
