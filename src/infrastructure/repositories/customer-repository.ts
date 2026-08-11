/**
 * Kunden je Organisation (FA-KUND-01 bis -09).
 *
 * Einzelabfragen laufen über `findFirst` mit `id` **und** `organizationId`,
 * nicht über `findUnique` mit `id`: Ein Datensatz einer fremden Organisation
 * soll nicht gefunden werden, statt gefunden und nachträglich verworfen — sonst
 * hinge die Abgrenzung an einer Prüfung, die sich vergessen lässt.
 */
import type { Customer, Prisma } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';

export type { Customer };

export type CustomerQuery = {
  readonly includeArchived: boolean;
  readonly search: string;
};

export async function listCustomers(
  context: OrganizationContext,
  query: CustomerQuery,
): Promise<readonly Customer[]> {
  const search = query.search.trim();

  return clientFor(undefined).customer.findMany({
    where: {
      organizationId: context.organizationId,
      ...(query.includeArchived ? {} : { isArchived: false }),
      ...(search.length === 0
        ? {}
        : {
            OR: [
              { companyName: { contains: search } },
              { contactName: { contains: search } },
              { customerNumber: { contains: search } },
              { city: { contains: search } },
              { email: { contains: search } },
            ],
          }),
    },
    orderBy: { customerNumber: 'asc' },
  });
}

export async function findCustomer(
  context: OrganizationContext,
  id: string,
): Promise<Customer | null> {
  return clientFor(undefined).customer.findFirst({
    where: { id, organizationId: context.organizationId },
  });
}

export async function findCustomerByNumber(
  context: OrganizationContext,
  customerNumber: string,
): Promise<Customer | null> {
  return clientFor(undefined).customer.findUnique({
    where: {
      organizationId_customerNumber: { organizationId: context.organizationId, customerNumber },
    },
  });
}

export async function createCustomer(
  context: OrganizationContext,
  data: Omit<Prisma.CustomerUncheckedCreateInput, 'organizationId'>,
): Promise<Customer> {
  return clientFor(undefined).customer.create({
    data: { ...data, organizationId: context.organizationId },
  });
}

/**
 * Ändert einen Kunden. `organizationId` steht in der `where`-Bedingung: Ein
 * Datensatz einer fremden Organisation wird nicht getroffen, die Änderung
 * läuft ins Leere statt in fremde Daten.
 */
export async function updateCustomer(
  context: OrganizationContext,
  id: string,
  data: Prisma.CustomerUpdateInput,
  handle?: TransactionHandle,
): Promise<Customer | null> {
  const result = await clientFor(handle).customer.updateMany({
    where: { id, organizationId: context.organizationId },
    data,
  });

  if (result.count === 0) {
    return null;
  }
  return findCustomer(context, id);
}
