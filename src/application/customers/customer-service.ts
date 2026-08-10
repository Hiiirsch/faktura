/**
 * Kundenverwaltung (FA-KUND-01 bis -09).
 *
 * Kunden werden archiviert, nie gelöscht (Spec §4.1). FA-KUND-06 formuliert
 * das schwächer („nicht gelöscht, sofern Rechnungen existieren"); umgesetzt ist
 * die strengere Regel der Spezifikation. Sie ist die sichere Auslegung, macht
 * eine Sonderbehandlung überflüssig und hält das Protokoll lückenlos.
 */
import {
  CUSTOMER_NUMBER_SEQUENCE_SCOPE,
  formatCustomerNumber,
} from '@/domain/customer/customer-number';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { getPrismaClient } from '@/infrastructure/db/prisma';

export type CustomerData = {
  readonly companyName: string | null;
  readonly contactName: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly vatId: string | null;
  readonly buyerReference: string | null;
  readonly paymentTerms: number | null;
  readonly notes: string | null;
};

export type Customer = CustomerData & {
  readonly id: string;
  readonly customerNumber: string;
  readonly isArchived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CustomerListFilter = {
  readonly search?: string;
  readonly includeArchived?: boolean;
};

/**
 * Vergibt die nächste Kundennummer (FA-KUND-02).
 *
 * `upsert` mit `increment` ist auf Datenbankebene atomar — zwei gleichzeitige
 * Anlagen erhalten unterschiedliche Nummern, ohne dass der Zählerstand zuvor
 * gelesen und zurückgeschrieben werden müsste.
 */
async function allocateCustomerNumber(): Promise<string> {
  const sequence = await getPrismaClient().numberSequence.upsert({
    where: { scope: CUSTOMER_NUMBER_SEQUENCE_SCOPE },
    create: { scope: CUSTOMER_NUMBER_SEQUENCE_SCOPE, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });

  return formatCustomerNumber(sequence.lastValue);
}

export async function listCustomers(filter: CustomerListFilter = {}): Promise<readonly Customer[]> {
  const search = filter.search?.trim() ?? '';

  return getPrismaClient().customer.findMany({
    where: {
      ...(filter.includeArchived === true ? {} : { isArchived: false }),
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

/**
 * Kunden, die für eine neue Rechnung auswählbar sind (FA-KUND-07).
 * Archivierte erscheinen hier nicht; in bereits erfassten Belegen bleiben sie
 * über den Snapshot sichtbar (ab M4).
 */
export async function listSelectableCustomers(): Promise<readonly Customer[]> {
  return listCustomers({ includeArchived: false });
}

export async function getCustomer(id: string): Promise<Customer | null> {
  return getPrismaClient().customer.findUnique({ where: { id } });
}

export async function createCustomer(
  data: CustomerData,
  actorId: string,
  ipAddress: string | null,
): Promise<Customer> {
  const customerNumber = await allocateCustomerNumber();

  const customer = await getPrismaClient().customer.create({
    data: { ...data, customerNumber },
  });

  await recordAuditEntry({
    entityType: 'Customer',
    entityId: customer.id,
    action: 'CREATED',
    actorId,
    ipAddress,
    details: { customerNumber },
  });

  return customer;
}

export async function updateCustomer(
  id: string,
  data: CustomerData,
  actorId: string,
  ipAddress: string | null,
): Promise<Customer> {
  const prisma = getPrismaClient();
  const before = await prisma.customer.findUniqueOrThrow({ where: { id } });

  const customer = await prisma.customer.update({ where: { id }, data });

  const keys = Object.keys(data) as (keyof CustomerData)[];
  const changed = keys.filter((key) => before[key] !== data[key]).map(String);

  if (changed.length > 0) {
    await recordAuditEntry({
      entityType: 'Customer',
      entityId: id,
      action: 'UPDATED',
      actorId,
      ipAddress,
      details: { changedFields: changed.join(',') },
    });
  }

  return customer;
}

export async function setCustomerArchived(
  id: string,
  isArchived: boolean,
  actorId: string,
  ipAddress: string | null,
): Promise<Customer> {
  const customer = await getPrismaClient().customer.update({
    where: { id },
    data: { isArchived },
  });

  await recordAuditEntry({
    entityType: 'Customer',
    entityId: id,
    action: isArchived ? 'ARCHIVED' : 'UNARCHIVED',
    actorId,
    ipAddress,
  });

  return customer;
}

export async function customerNumberExists(customerNumber: string): Promise<boolean> {
  const found = await getPrismaClient().customer.findUnique({
    where: { customerNumber },
    select: { id: true },
  });
  return found !== null;
}
