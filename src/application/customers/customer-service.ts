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
import {
  createCustomer as insertCustomer,
  findCustomer,
  listCustomers as queryCustomers,
  updateCustomer as writeCustomer,
} from '@/infrastructure/repositories/customer-repository';
import { incrementSequence } from '@/infrastructure/repositories/number-sequence-repository';
import type { Authorized } from '@/application/auth/authorize';

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
async function allocateCustomerNumber(context: Authorized<'customer.create'>): Promise<string> {
  const lastValue = await incrementSequence(context, CUSTOMER_NUMBER_SEQUENCE_SCOPE);
  return formatCustomerNumber(lastValue);
}

export async function listCustomers(
  context: Authorized<'customer.read'>,
  filter: CustomerListFilter = {},
): Promise<readonly Customer[]> {
  return queryCustomers(context, {
    includeArchived: filter.includeArchived === true,
    search: filter.search ?? '',
  });
}

/**
 * Kunden, die für eine neue Rechnung auswählbar sind (FA-KUND-07).
 * Archivierte erscheinen hier nicht; in bereits erfassten Belegen bleiben sie
 * über den Snapshot sichtbar (ab M4).
 */
export async function listSelectableCustomers(
  context: Authorized<'customer.read'>,
): Promise<readonly Customer[]> {
  return listCustomers(context, { includeArchived: false });
}

export async function getCustomer(
  context: Authorized<'customer.read'>,
  id: string,
): Promise<Customer | null> {
  return findCustomer(context, id);
}

export async function createCustomer(
  context: Authorized<'customer.create'>,
  data: CustomerData,
  actorId: string,
  ipAddress: string | null,
): Promise<Customer> {
  const customerNumber = await allocateCustomerNumber(context);

  const customer = await insertCustomer(context, { ...data, customerNumber });

  await recordAuditEntry(context, {
    entityType: 'Customer',
    entityId: customer.id,
    action: 'CREATED',
    actorId,
    ipAddress,
    details: { customerNumber },
  });

  return customer;
}

/** `null`, wenn es den Kunden in dieser Organisation nicht gibt. */
export async function updateCustomer(
  context: Authorized<'customer.update'>,
  id: string,
  data: CustomerData,
  actorId: string,
  ipAddress: string | null,
): Promise<Customer | null> {
  const before = await findCustomer(context, id);
  if (before === null) {
    return null;
  }

  const customer = await writeCustomer(context, id, data);
  if (customer === null) {
    return null;
  }

  const keys = Object.keys(data) as (keyof CustomerData)[];
  const changed = keys.filter((key) => before[key] !== data[key]).map(String);

  if (changed.length > 0) {
    await recordAuditEntry(context, {
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
  context: Authorized<'customer.archive'>,
  id: string,
  isArchived: boolean,
  actorId: string,
  ipAddress: string | null,
): Promise<Customer | null> {
  const customer = await writeCustomer(context, id, { isArchived });
  if (customer === null) {
    return null;
  }

  await recordAuditEntry(context, {
    entityType: 'Customer',
    entityId: id,
    action: isArchived ? 'ARCHIVED' : 'UNARCHIVED',
    actorId,
    ipAddress,
  });

  return customer;
}
