/**
 * Storno (FA-STAT-08, -09, -10, Spec §6).
 *
 * Ein festgeschriebener Beleg wird nie gelöscht und nie inhaltlich geändert.
 * Das Storno erzeugt ein **eigenständiges** Dokument vom Typ `CREDIT_NOTE` mit
 * eigener Nummer aus demselben fortlaufenden Kreis und mit Bezug auf das
 * Original; das Original wechselt auf `CANCELLED` und bleibt vollständig
 * erhalten.
 *
 * Die Gutschrift führt **positive** Beträge: EN 16931 unterscheidet Rechnung
 * und Gutschrift über den Belegtyp, nicht über das Vorzeichen. Aus dem Umsatz
 * fällt der Betrag dadurch heraus, dass das Original ausscheidet — die
 * Gutschrift zählt nie mit (`countsTowardRevenue`).
 */
import { cents } from '@/domain/money/money';
import { parsePlainDate, type PlainDate, todayIn } from '@/domain/time/plain-date';
import { getEnv } from '@/infrastructure/config/env';
import { runInTransaction } from '@/infrastructure/repositories/client';
import { findCompanyProfile } from '@/infrastructure/repositories/company-repository';
import {
  createInvoice,
  findInvoiceWithLines,
  updateInvoice,
} from '@/infrastructure/repositories/invoice-repository';
import type { Authorized } from '@/application/auth/authorize';

import { dispatchInvoiceEvent, ensureDefaultHandlers } from './event-dispatcher';
import { allocateInvoiceNumber } from './invoice-numbering';

export type CancelError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NOT_ISSUED'; readonly status: string }
  | { readonly kind: 'ALREADY_CANCELLED' }
  | { readonly kind: 'NOT_AN_INVOICE' }
  | { readonly kind: 'NO_COMPANY_PROFILE' };

export type CancelResult =
  | { readonly ok: true; readonly creditNoteId: string; readonly creditNoteNumber: string }
  | { readonly ok: false; readonly error: CancelError };

export async function cancelInvoice(
  context: Authorized<'invoice.cancel'>,
  invoiceId: string,
  reason: string | null,
  actorId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<CancelResult> {
  ensureDefaultHandlers();

  const [invoice, company] = await Promise.all([
    findInvoiceWithLines(context, invoiceId),
    findCompanyProfile(context),
  ]);

  if (invoice === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }
  if (invoice.documentType !== 'INVOICE') {
    return { ok: false, error: { kind: 'NOT_AN_INVOICE' } };
  }
  if (invoice.status === 'CANCELLED') {
    return { ok: false, error: { kind: 'ALREADY_CANCELLED' } };
  }
  if (invoice.status === 'DRAFT') {
    return { ok: false, error: { kind: 'NOT_ISSUED', status: invoice.status } };
  }
  if (company === null) {
    return { ok: false, error: { kind: 'NO_COMPANY_PROFILE' } };
  }

  // Das Storno trägt den heutigen Tag, nicht das Datum der Originalrechnung:
  // Es ist ein eigener Geschäftsvorfall mit eigenem Zeitpunkt.
  const today = todayIn(getEnv().APP_TIMEZONE, now);
  const originalIssueDate = parsePlainDate(invoice.issueDate ?? '');
  const issueDate: PlainDate = originalIssueDate.ok && originalIssueDate.value > today
    ? originalIssueDate.value
    : today;

  const result = await runInTransaction(async (handle) => {
    const creditNoteNumber = await allocateInvoiceNumber(
      context,
      handle,
      company.invoiceNumberFormat,
      issueDate,
    );

    const creditNote = await createInvoice(
      context,
      {
        documentType: 'CREDIT_NOTE',
        invoiceNumber: creditNoteNumber,
        status: 'ISSUED',
        customerId: invoice.customerId,
        snapshotBuyer: invoice.snapshotBuyer,
        snapshotSeller: invoice.snapshotSeller,
        issueDate,
        serviceDateFrom: invoice.serviceDateFrom,
        serviceDateTo: invoice.serviceDateTo,
        // Eine Gutschrift ist nicht zahlbar; ein Fälligkeitsdatum wäre
        // irreführend und tauchte in der Fälligkeitsliste auf.
        dueDate: null,
        currency: invoice.currency,
        taxScheme: invoice.taxScheme,
        introText: reason,
        outroText: invoice.outroText,
        purchaseOrderRef: invoice.purchaseOrderRef,
        precedingInvoiceId: invoice.id,
        templateId: invoice.templateId,
        netTotalCents: invoice.netTotalCents,
        taxTotalCents: invoice.taxTotalCents,
        grossTotalCents: invoice.grossTotalCents,
        paidTotalCents: 0,
        issuedAt: now,
      },
      invoice.lines.map((line) => ({
        position: line.position,
        name: line.name,
        description: line.description,
        quantityScaled: line.quantityScaled,
        unitCode: line.unitCode,
        unitPriceCents: line.unitPriceCents,
        taxRateBasisPoints: line.taxRateBasisPoints,
        taxCategory: line.taxCategory,
        discountBasisPoints: line.discountBasisPoints,
        lineNetCents: line.lineNetCents,
      })),
      handle,
    );

    await updateInvoice(
      context,
      invoice.id,
      { status: 'CANCELLED', cancelledAt: now },
      handle,
    );

    return { creditNoteId: creditNote.id, creditNoteNumber };
  });

  await dispatchInvoiceEvent(context, {
    type: 'InvoiceCancelled',
    invoiceId: invoice.id,
    creditNoteId: result.creditNoteId,
    creditNoteNumber: result.creditNoteNumber,
  });

  void actorId;
  void ipAddress;
  void cents;

  return { ok: true, ...result };
}
