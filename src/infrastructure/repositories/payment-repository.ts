/**
 * Zahlungseingänge je Organisation (FA-STAT-03 bis -07).
 *
 * Abgefragt wird über den Beleg (`invoice.organizationId`), nicht über die
 * eigene Spalte — derselbe Grund wie bei den Positionen: genau ein
 * maßgeblicher Pfad.
 */
import type { Payment, Prisma } from '@prisma/client';

import { clientFor } from './client';
import type { OrganizationContext } from './organization-context';

export type { Payment };

export type PaymentData = Omit<
  Prisma.PaymentUncheckedCreateInput,
  'organizationId' | 'invoiceId'
>;

export async function listPayments(
  context: OrganizationContext,
  invoiceId: string,
): Promise<readonly Payment[]> {
  return clientFor(undefined).payment.findMany({
    where: { invoiceId, invoice: { organizationId: context.organizationId } },
    orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function findPayment(
  context: OrganizationContext,
  id: string,
): Promise<Payment | null> {
  return clientFor(undefined).payment.findFirst({
    where: { id, invoice: { organizationId: context.organizationId } },
  });
}

export async function createPayment(
  context: OrganizationContext,
  invoiceId: string,
  data: PaymentData,
): Promise<Payment> {
  return clientFor(undefined).payment.create({
    data: { ...data, invoiceId, organizationId: context.organizationId },
  });
}

export async function updatePayment(
  context: OrganizationContext,
  id: string,
  data: Prisma.PaymentUpdateInput,
): Promise<boolean> {
  const result = await clientFor(undefined).payment.updateMany({
    where: { id, invoice: { organizationId: context.organizationId } },
    data,
  });
  return result.count > 0;
}

export async function deletePayment(
  context: OrganizationContext,
  id: string,
): Promise<boolean> {
  const result = await clientFor(undefined).payment.deleteMany({
    where: { id, invoice: { organizationId: context.organizationId } },
  });
  return result.count > 0;
}
