/**
 * Zahlungen (FA-STAT-03, -04, -05, -06, -07).
 *
 * Zahlungen sind einzelne Datensätze, keine Boolesche Marke am Beleg. Nur so
 * sind Teilzahlungen, Korrekturen und ein späterer Kontoabgleich möglich
 * (Spec §7). Der Status wird nach jeder Änderung neu abgeleitet, nie gesetzt.
 */
import { type Cents, cents, subtractCents } from '@/domain/money/money';
import { outstandingAmount } from '@/domain/invoice/status';
import type { PlainDate } from '@/domain/time/plain-date';
import { getPrismaClient } from '@/infrastructure/db/prisma';

import { dispatchInvoiceEvent, ensureDefaultHandlers } from './event-dispatcher';
import { recalculateInvoice } from './invoice-service';

export type PaymentError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NOT_ISSUED' }
  | { readonly kind: 'CANCELLED' }
  | { readonly kind: 'CREDIT_NOTE' }
  | { readonly kind: 'NOTHING_OUTSTANDING' };

export type PaymentInput = {
  readonly amountCents: Cents;
  readonly paidAt: PlainDate;
  readonly method: string | null;
  readonly note: string | null;
};

async function loadPayableInvoice(invoiceId: string) {
  const invoice = await getPrismaClient().invoice.findUnique({ where: { id: invoiceId } });

  if (invoice === null) {
    return { ok: false as const, error: { kind: 'NOT_FOUND' as const } };
  }
  // Eine Gutschrift wird nicht bezahlt — sie erstattet.
  if (invoice.documentType !== 'INVOICE') {
    return { ok: false as const, error: { kind: 'CREDIT_NOTE' as const } };
  }
  if (invoice.status === 'DRAFT') {
    return { ok: false as const, error: { kind: 'NOT_ISSUED' as const } };
  }
  if (invoice.status === 'CANCELLED') {
    return { ok: false as const, error: { kind: 'CANCELLED' as const } };
  }

  return { ok: true as const, invoice };
}

export async function addPayment(
  invoiceId: string,
  input: PaymentInput,
): Promise<{ ok: true } | { ok: false; error: PaymentError }> {
  ensureDefaultHandlers();

  const loaded = await loadPayableInvoice(invoiceId);
  if (!loaded.ok) {
    return loaded;
  }

  await getPrismaClient().payment.create({
    data: {
      invoiceId,
      amountCents: input.amountCents,
      paidAt: input.paidAt,
      method: input.method,
      note: input.note,
    },
  });

  await recalculateInvoice(invoiceId);
  await announce(invoiceId, input.amountCents);

  return { ok: true };
}

/**
 * Schnellaktion „als vollständig bezahlt markieren" (FA-STAT-06): erfasst eine
 * Zahlung über den **Restbetrag**, nicht über den Gesamtbetrag. Bei einer
 * bereits teilbezahlten Rechnung entstünde sonst eine Überzahlung.
 */
export async function markAsFullyPaid(
  invoiceId: string,
  paidAt: PlainDate,
  method: string | null,
): Promise<{ ok: true } | { ok: false; error: PaymentError }> {
  const loaded = await loadPayableInvoice(invoiceId);
  if (!loaded.ok) {
    return loaded;
  }

  const outstanding = outstandingAmount(
    cents(loaded.invoice.grossTotalCents),
    cents(loaded.invoice.paidTotalCents),
  );

  if (outstanding <= 0) {
    return { ok: false, error: { kind: 'NOTHING_OUTSTANDING' } };
  }

  return addPayment(invoiceId, { amountCents: outstanding, paidAt, method, note: null });
}

/** Korrigiert eine erfasste Zahlung (FA-STAT-07). */
export async function updatePayment(
  paymentId: string,
  input: PaymentInput,
): Promise<{ ok: true } | { ok: false; error: PaymentError }> {
  const prisma = getPrismaClient();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });

  if (payment === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }

  const loaded = await loadPayableInvoice(payment.invoiceId);
  if (!loaded.ok) {
    return loaded;
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      amountCents: input.amountCents,
      paidAt: input.paidAt,
      method: input.method,
      note: input.note,
    },
  });

  await recalculateInvoice(payment.invoiceId);
  return { ok: true };
}

/** Nimmt eine irrtümlich erfasste Zahlung zurück (FA-STAT-07). */
export async function removePayment(
  paymentId: string,
): Promise<{ ok: true } | { ok: false; error: PaymentError }> {
  const prisma = getPrismaClient();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });

  if (payment === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }

  const loaded = await loadPayableInvoice(payment.invoiceId);
  if (!loaded.ok) {
    return loaded;
  }

  await prisma.payment.delete({ where: { id: paymentId } });
  await recalculateInvoice(payment.invoiceId);

  return { ok: true };
}

/** Meldet Zahlungseingang und — falls erreicht — vollständige Bezahlung. */
async function announce(invoiceId: string, amountCents: Cents): Promise<void> {
  const invoice = await getPrismaClient().invoice.findUniqueOrThrow({ where: { id: invoiceId } });

  await dispatchInvoiceEvent({
    type: 'InvoicePaymentRecorded',
    invoiceId,
    amountCents,
    paidTotalCents: cents(invoice.paidTotalCents),
    grossTotalCents: cents(invoice.grossTotalCents),
  });

  if (invoice.status === 'PAID') {
    await dispatchInvoiceEvent({
      type: 'InvoicePaid',
      invoiceId,
      grossTotalCents: cents(invoice.grossTotalCents),
    });
  }

  void subtractCents;
}

export async function listPayments(invoiceId: string) {
  return getPrismaClient().payment.findMany({
    where: { invoiceId },
    orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
  });
}
