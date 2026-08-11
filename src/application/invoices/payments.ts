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
import { findInvoice } from '@/infrastructure/repositories/invoice-repository';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';
import {
  createPayment,
  deletePayment,
  findPayment,
  listPayments as queryPayments,
  updatePayment as writePayment,
} from '@/infrastructure/repositories/payment-repository';

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

async function loadPayableInvoice(context: OrganizationContext, invoiceId: string) {
  const invoice = await findInvoice(context, invoiceId);

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
  context: OrganizationContext,
  invoiceId: string,
  input: PaymentInput,
): Promise<{ ok: true } | { ok: false; error: PaymentError }> {
  ensureDefaultHandlers();

  const loaded = await loadPayableInvoice(context, invoiceId);
  if (!loaded.ok) {
    return loaded;
  }

  await createPayment(context, invoiceId, {
    amountCents: input.amountCents,
    paidAt: input.paidAt,
    method: input.method,
    note: input.note,
  });

  await recalculateInvoice(context, invoiceId);
  await announce(context, invoiceId, input.amountCents);

  return { ok: true };
}

/**
 * Schnellaktion „als vollständig bezahlt markieren" (FA-STAT-06): erfasst eine
 * Zahlung über den **Restbetrag**, nicht über den Gesamtbetrag. Bei einer
 * bereits teilbezahlten Rechnung entstünde sonst eine Überzahlung.
 */
export async function markAsFullyPaid(
  context: OrganizationContext,
  invoiceId: string,
  paidAt: PlainDate,
  method: string | null,
): Promise<{ ok: true } | { ok: false; error: PaymentError }> {
  const loaded = await loadPayableInvoice(context, invoiceId);
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

  return addPayment(context, invoiceId, { amountCents: outstanding, paidAt, method, note: null });
}

/** Korrigiert eine erfasste Zahlung (FA-STAT-07). */
export async function updatePayment(
  context: OrganizationContext,
  paymentId: string,
  input: PaymentInput,
): Promise<{ ok: true } | { ok: false; error: PaymentError }> {
  const payment = await findPayment(context, paymentId);

  if (payment === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }

  const loaded = await loadPayableInvoice(context, payment.invoiceId);
  if (!loaded.ok) {
    return loaded;
  }

  await writePayment(context, paymentId, {
    amountCents: input.amountCents,
    paidAt: input.paidAt,
    method: input.method,
    note: input.note,
  });

  await recalculateInvoice(context, payment.invoiceId);
  return { ok: true };
}

/** Nimmt eine irrtümlich erfasste Zahlung zurück (FA-STAT-07). */
export async function removePayment(
  context: OrganizationContext,
  paymentId: string,
): Promise<{ ok: true } | { ok: false; error: PaymentError }> {
  const payment = await findPayment(context, paymentId);

  if (payment === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }

  const loaded = await loadPayableInvoice(context, payment.invoiceId);
  if (!loaded.ok) {
    return loaded;
  }

  await deletePayment(context, paymentId);
  await recalculateInvoice(context, payment.invoiceId);

  return { ok: true };
}

/** Meldet Zahlungseingang und — falls erreicht — vollständige Bezahlung. */
async function announce(
  context: OrganizationContext,
  invoiceId: string,
  amountCents: Cents,
): Promise<void> {
  const invoice = await findInvoice(context, invoiceId);
  if (invoice === null) {
    return;
  }

  await dispatchInvoiceEvent(context, {
    type: 'InvoicePaymentRecorded',
    invoiceId,
    amountCents,
    paidTotalCents: cents(invoice.paidTotalCents),
    grossTotalCents: cents(invoice.grossTotalCents),
  });

  if (invoice.status === 'PAID') {
    await dispatchInvoiceEvent(context, {
      type: 'InvoicePaid',
      invoiceId,
      grossTotalCents: cents(invoice.grossTotalCents),
    });
  }

  void subtractCents;
}

export async function listPayments(context: OrganizationContext, invoiceId: string) {
  return queryPayments(context, invoiceId);
}
