/**
 * Zahlungen (FA-STAT-03, -04, -05, -06, -07).
 *
 * Zahlungen sind einzelne Datensätze, keine Boolesche Marke am Beleg. Nur so
 * sind Teilzahlungen, Korrekturen und ein späterer Kontoabgleich möglich
 * (Spec §7). Der Status wird nach jeder Änderung neu abgeleitet, nie gesetzt.
 */
import { type Cents, cents } from '@/domain/money/money';
import { outstandingAmount } from '@/domain/invoice/status';
import type { PlainDate } from '@/domain/time/plain-date';
import { findInvoice } from '@/infrastructure/repositories/invoice-repository';
import type { Authorized } from '@/application/auth/authorize';
import {
  createPayment,
  deletePayment,
  findPayment,
  listPayments as queryPayments,
  updatePayment as writePayment,
} from '@/infrastructure/repositories/payment-repository';

import { recordAuditEntry } from '@/infrastructure/audit/audit-log';

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

async function loadPayableInvoice(context: Authorized<'invoice.recordPayment'>, invoiceId: string) {
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

/**
 * Erfasst eine Zahlung (FA-STAT-05).
 *
 * **Akteur und Herkunft sind seit M8/B6 Pflicht.** Bis dahin trugen die
 * Protokolleinträge zu Zahlungen keinen Akteur — sie entstanden im
 * Ereignis-Handler, und der bekam keinen. NFA-COMP-01 verlangt Zeitpunkt,
 * Aktion **und** Akteur; die Lücke fiel erst auf, als der Urheber am Beleg dazu
 * zwang, den Weg des Akteurs überhaupt zu Ende zu denken.
 */
export async function addPayment(
  context: Authorized<'invoice.recordPayment'>,
  invoiceId: string,
  input: PaymentInput,
  actorId: string,
  ipAddress: string | null,
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
  await announce(context, invoiceId, input.amountCents, actorId, ipAddress);

  return { ok: true };
}

/**
 * Schnellaktion „als vollständig bezahlt markieren" (FA-STAT-06): erfasst eine
 * Zahlung über den **Restbetrag**, nicht über den Gesamtbetrag. Bei einer
 * bereits teilbezahlten Rechnung entstünde sonst eine Überzahlung.
 */
export async function markAsFullyPaid(
  context: Authorized<'invoice.recordPayment'>,
  invoiceId: string,
  paidAt: PlainDate,
  method: string | null,
  actorId: string,
  ipAddress: string | null,
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

  return addPayment(
    context,
    invoiceId,
    { amountCents: outstanding, paidAt, method, note: null },
    actorId,
    ipAddress,
  );
}

/**
 * Korrigiert eine erfasste Zahlung (FA-STAT-07).
 *
 * **Der Protokolleintrag ist neu in M8/B6.** Korrigieren und Zurücknehmen einer
 * Zahlung änderten den Zahlungsstand eines Belegs, ohne eine Spur zu
 * hinterlassen — es gab dafür kein Domain-Ereignis, und damit auch keinen
 * Handler, der etwas geschrieben hätte. Die Aktion `PAYMENT_REMOVED` stand seit
 * M4 im Katalog und wurde nie benutzt; das war der Hinweis, den niemand gelesen
 * hat.
 *
 * Geschrieben wird hier unmittelbar und nicht über ein Ereignis: Ein Ereignis
 * beschreibt eine Zustandsänderung, die andere interessieren könnte. Eine
 * Korrektur ist eine Berichtigung — sie gehört ins Protokoll, aber nicht in den
 * Mahnlauf.
 */
export async function updatePayment(
  context: Authorized<'invoice.recordPayment'>,
  paymentId: string,
  input: PaymentInput,
  actorId: string,
  ipAddress: string | null,
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

  await recordAuditEntry(context, {
    entityType: 'Invoice',
    entityId: payment.invoiceId,
    action: 'PAYMENT_RECORDED',
    actorId: actorId.length === 0 ? null : actorId,
    ipAddress,
    details: { paymentId, amountCents: input.amountCents, corrected: true },
  });

  return { ok: true };
}

/** Nimmt eine irrtümlich erfasste Zahlung zurück (FA-STAT-07). */
export async function removePayment(
  context: Authorized<'invoice.recordPayment'>,
  paymentId: string,
  actorId: string,
  ipAddress: string | null,
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

  await recordAuditEntry(context, {
    entityType: 'Invoice',
    entityId: payment.invoiceId,
    action: 'PAYMENT_REMOVED',
    actorId: actorId.length === 0 ? null : actorId,
    ipAddress,
    details: { paymentId, amountCents: payment.amountCents },
  });

  return { ok: true };
}

/** Meldet Zahlungseingang und — falls erreicht — vollständige Bezahlung. */
async function announce(
  context: Authorized<'invoice.recordPayment'>,
  invoiceId: string,
  amountCents: Cents,
  actorId: string,
  ipAddress: string | null,
): Promise<void> {
  const invoice = await findInvoice(context, invoiceId);
  if (invoice === null) {
    return;
  }

  const acting = { organization: context, actorId, ipAddress };

  await dispatchInvoiceEvent(acting, {
    type: 'InvoicePaymentRecorded',
    invoiceId,
    amountCents,
    paidTotalCents: cents(invoice.paidTotalCents),
    grossTotalCents: cents(invoice.grossTotalCents),
  });

  if (invoice.status === 'PAID') {
    await dispatchInvoiceEvent(acting, {
      type: 'InvoicePaid',
      invoiceId,
      grossTotalCents: cents(invoice.grossTotalCents),
    });
  }

}

export async function listPayments(context: Authorized<'invoice.read'>, invoiceId: string) {
  return queryPayments(context, invoiceId);
}
