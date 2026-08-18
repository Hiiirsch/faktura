/**
 * Belege im Entwurfsstadium: Anlegen, Ändern, Duplizieren, Löschen
 * (FA-RECH-01, -10, -11; FA-STAT-01).
 *
 * Festschreiben, Storno und Zahlungen liegen in eigenen Dateien — es sind
 * eigene Vorgänge mit eigenen Vorbedingungen und gehören nicht in dieselbe
 * Datei wie das alltägliche Bearbeiten eines Entwurfs.
 */
import { isTaxCategoryCode, type TaxCategoryCode } from '@/domain/codes/tax-category';
import { deriveStatus } from '@/domain/invoice/status';
import { calculateInvoiceTotals, type InvoiceLineInput } from '@/domain/invoice/totals';
import { cents, sumCents } from '@/domain/money/money';
import { quantityFromScaled } from '@/domain/quantity/quantity';
import type { TaxScheme } from '@/domain/tax/tax-scheme';
import type { DraftBuyer } from '@/domain/invoice/buyer';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { runInTransaction } from '@/infrastructure/repositories/client';
import {
  createInvoice,
  deleteInvoice,
  findInvoice,
  findInvoiceWithLines,
  findInvoiceWithLinesAndPayments,
  replaceDraftContent,
  updateInvoice,
  updateLineNet,
} from '@/infrastructure/repositories/invoice-repository';
import type { Authorized } from '@/application/auth/authorize';

export type InvoiceLineData = {
  readonly position: number;
  readonly name: string;
  readonly description: string | null;
  readonly quantityScaled: number;
  readonly unitCode: string;
  readonly unitPriceCents: number;
  readonly taxRateBasisPoints: number;
  readonly taxCategory: string;
  readonly discountBasisPoints: number;
};

export type DraftInvoiceData = {
  /** Der Empfänger — aus den Stammdaten, aus Feldern oder als Block (M5.7). */
  readonly buyer: DraftBuyer;
  readonly taxScheme: TaxScheme;
  readonly currency: string;
  readonly issueDate: string | null;
  readonly serviceDateFrom: string | null;
  readonly serviceDateTo: string | null;
  readonly dueDate: string | null;
  readonly introText: string | null;
  readonly outroText: string | null;
  readonly purchaseOrderRef: string | null;
  /** Abweichende Vorlage; `null` bedeutet Standardvorlage (FA-TPL-03). */
  readonly templateId: string | null;
  readonly lines: readonly InvoiceLineData[];
};

export function toDomainLine(line: InvoiceLineData): InvoiceLineInput {
  if (!isTaxCategoryCode(line.taxCategory)) {
    throw new RangeError(`Unbekannte Steuerkategorie: ${line.taxCategory}`);
  }

  return {
    quantity: quantityFromScaled(line.quantityScaled),
    unitPriceCents: cents(line.unitPriceCents),
    discountBasisPoints: line.discountBasisPoints,
    taxRateBasisPoints: line.taxRateBasisPoints,
    taxCategory: line.taxCategory satisfies TaxCategoryCode,
  };
}

function lineCreateData(lines: readonly InvoiceLineData[], lineNets: readonly number[]) {
  return lines.map((line, index) => ({
    position: line.position,
    name: line.name,
    description: line.description,
    quantityScaled: line.quantityScaled,
    unitCode: line.unitCode,
    unitPriceCents: line.unitPriceCents,
    taxRateBasisPoints: line.taxRateBasisPoints,
    taxCategory: line.taxCategory,
    discountBasisPoints: line.discountBasisPoints,
    lineNetCents: lineNets[index] ?? 0,
  }));
}

/**
 * Der Urheber, wie er an den Beleg geschrieben wird (M8, FA-UI-16).
 *
 * `Invoice.createdById` verweist auf `User`. Wo kein Konto handelt — im
 * Beispieldatenskript ohne angelegten Benutzer —, bleibt die Angabe **leer**
 * statt erfunden: Eine geratene Urheberschaft an einem Beleg, den niemand mehr
 * ändern kann, ist schlimmer als eine leere.
 */
function createdByOf(actorId: string): string | null {
  return actorId.length === 0 ? null : actorId;
}

export async function createDraftInvoice(
  context: Authorized<'invoice.create'>,
  data: DraftInvoiceData,
  actorId: string,
  ipAddress: string | null,
): Promise<{ id: string }> {
  const totals = calculateInvoiceTotals(data.lines.map(toDomainLine));

  const invoice = await createInvoice(
    context,
    {
      buyerMode: data.buyer.mode,
      customerId: data.buyer.mode === 'CUSTOMER' ? data.buyer.customerId : null,
      buyerName: data.buyer.fields.name,
      buyerContactName: data.buyer.fields.contactName,
      buyerAddressLine1: data.buyer.fields.addressLine1,
      buyerAddressLine2: data.buyer.fields.addressLine2,
      buyerPostalCode: data.buyer.fields.postalCode,
      buyerCity: data.buyer.fields.city,
      buyerCountryCode: data.buyer.fields.countryCode,
      buyerEmail: data.buyer.fields.email,
      buyerPhone: data.buyer.fields.phone,
      buyerVatId: data.buyer.fields.vatId,
      buyerFreeText: data.buyer.mode === 'FREE' ? data.buyer.freeText : null,
      documentType: 'INVOICE',
      status: 'DRAFT',
      taxScheme: data.taxScheme,
      currency: data.currency,
      issueDate: data.issueDate,
      serviceDateFrom: data.serviceDateFrom,
      serviceDateTo: data.serviceDateTo,
      dueDate: data.dueDate,
      introText: data.introText,
      outroText: data.outroText,
      purchaseOrderRef: data.purchaseOrderRef,
      templateId: data.templateId,
      netTotalCents: totals.netTotalCents,
      taxTotalCents: totals.taxTotalCents,
      grossTotalCents: totals.grossTotalCents,
      createdById: createdByOf(actorId),
    },
    lineCreateData(data.lines, totals.lineNets),
  );

  await recordAuditEntry(context, {
    entityType: 'Invoice',
    entityId: invoice.id,
    action: 'CREATED',
    actorId,
    ipAddress,
  });

  return { id: invoice.id };
}

export type DraftError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NOT_A_DRAFT'; readonly status: string };

/**
 * Ersetzt Kopfdaten und Positionen eines Entwurfs.
 *
 * Die Positionen werden vollständig neu geschrieben statt einzeln abgeglichen:
 * Der Editor liefert ohnehin die komplette Liste, und ein Abgleich brächte nur
 * die Möglichkeit, eine Position zu übersehen.
 */
export async function updateDraftInvoice(
  context: Authorized<'invoice.update'>,
  invoiceId: string,
  data: DraftInvoiceData,
  actorId: string,
  ipAddress: string | null,
): Promise<{ ok: true } | { ok: false; error: DraftError }> {
  const existing = await findInvoice(context, invoiceId);

  if (existing === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }
  if (existing.status !== 'DRAFT') {
    return { ok: false, error: { kind: 'NOT_A_DRAFT', status: existing.status } };
  }

  const totals = calculateInvoiceTotals(data.lines.map(toDomainLine));

  await runInTransaction(async (handle) => {
    await replaceDraftContent(
      context,
      invoiceId,
      {
        buyerMode: data.buyer.mode,
        customerId: data.buyer.mode === 'CUSTOMER' ? data.buyer.customerId : null,
        buyerName: data.buyer.fields.name,
        buyerContactName: data.buyer.fields.contactName,
        buyerAddressLine1: data.buyer.fields.addressLine1,
        buyerAddressLine2: data.buyer.fields.addressLine2,
        buyerPostalCode: data.buyer.fields.postalCode,
        buyerCity: data.buyer.fields.city,
        buyerCountryCode: data.buyer.fields.countryCode,
        buyerEmail: data.buyer.fields.email,
        buyerPhone: data.buyer.fields.phone,
        buyerVatId: data.buyer.fields.vatId,
        buyerFreeText: data.buyer.mode === 'FREE' ? data.buyer.freeText : null,
        taxScheme: data.taxScheme,
        currency: data.currency,
        issueDate: data.issueDate,
        serviceDateFrom: data.serviceDateFrom,
        serviceDateTo: data.serviceDateTo,
        dueDate: data.dueDate,
        introText: data.introText,
        outroText: data.outroText,
        purchaseOrderRef: data.purchaseOrderRef,
        templateId: data.templateId,
        netTotalCents: totals.netTotalCents,
        taxTotalCents: totals.taxTotalCents,
        grossTotalCents: totals.grossTotalCents,
      },
      lineCreateData(data.lines, totals.lineNets),
      handle,
    );
  });

  await recordAuditEntry(context, {
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'UPDATED',
    actorId,
    ipAddress,
  });

  return { ok: true };
}

/** Entwürfe dürfen gelöscht werden, festgeschriebene Belege nicht (FA-RECH-11). */
export async function deleteDraftInvoice(
  context: Authorized<'invoice.delete'>,
  invoiceId: string,
  actorId: string,
  ipAddress: string | null,
): Promise<{ ok: true } | { ok: false; error: DraftError }> {
  const existing = await findInvoice(context, invoiceId);

  if (existing === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }
  if (existing.status !== 'DRAFT') {
    return { ok: false, error: { kind: 'NOT_A_DRAFT', status: existing.status } };
  }

  await deleteInvoice(context, invoiceId);

  await recordAuditEntry(context, {
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'DELETED',
    actorId,
    ipAddress,
  });

  return { ok: true };
}

/**
 * Dupliziert einen Beleg als neuen Entwurf (FA-RECH-10).
 *
 * Die Kopie erhält **keine** Nummer, keinen Snapshot und keine Zahlungen — sie
 * ist ein frischer Entwurf, kein zweites Exemplar des Originals.
 */
export async function duplicateInvoice(
  context: Authorized<'invoice.duplicate'>,
  invoiceId: string,
  actorId: string,
  ipAddress: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: { kind: 'NOT_FOUND' } }> {
  const source = await findInvoiceWithLines(context, invoiceId);

  if (source === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }

  const copy = await createInvoice(
    context,
    {
      // Der Empfänger wandert mit, gleich aus welcher Quelle er stammt.
      buyerMode: source.buyerMode,
      customerId: source.customerId,
      buyerName: source.buyerName,
      buyerContactName: source.buyerContactName,
      buyerAddressLine1: source.buyerAddressLine1,
      buyerAddressLine2: source.buyerAddressLine2,
      buyerPostalCode: source.buyerPostalCode,
      buyerCity: source.buyerCity,
      buyerCountryCode: source.buyerCountryCode,
      buyerEmail: source.buyerEmail,
      buyerPhone: source.buyerPhone,
      buyerVatId: source.buyerVatId,
      buyerFreeText: source.buyerFreeText,
      documentType: 'INVOICE',
      status: 'DRAFT',
      invoiceNumber: null,
      taxScheme: source.taxScheme,
      currency: source.currency,
      issueDate: null,
      serviceDateFrom: source.serviceDateFrom,
      serviceDateTo: source.serviceDateTo,
      dueDate: null,
      introText: source.introText,
      outroText: source.outroText,
      purchaseOrderRef: source.purchaseOrderRef,
      templateId: source.templateId,
      netTotalCents: source.netTotalCents,
      taxTotalCents: source.taxTotalCents,
      grossTotalCents: source.grossTotalCents,
      paidTotalCents: 0,
      // Die Kopie gehört dem, der sie anlegt — nicht dem Urheber der Vorlage.
      createdById: createdByOf(actorId),
    },
    source.lines.map((line) => ({
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
  );

  await recordAuditEntry(context, {
    entityType: 'Invoice',
    entityId: copy.id,
    action: 'DUPLICATED',
    actorId,
    ipAddress,
    details: { sourceInvoiceId: invoiceId },
  });

  return { ok: true, id: copy.id };
}

/**
 * Berechnet Summen und Zahlungsstand neu und leitet daraus den Status ab.
 * Einzige Stelle, an der die denormalisierten Summen entstehen (Spec §4.1).
 *
 * Bei einem festgeschriebenen Beleg werden **nur** Zahlungsstand und Status
 * fortgeschrieben. Die Beträge sind ab dem Festschreiben eingefroren — sie neu
 * zu berechnen wäre eine nachträgliche Änderung, und die Prisma-Erweiterung
 * würde sie ohnehin abweisen (FA-NUM-08, FA-NUM-09).
 */
export async function recalculateInvoice(
  context: Authorized<'invoice.recordPayment'>,
  invoiceId: string,
): Promise<void> {
  const invoice = await findInvoiceWithLinesAndPayments(context, invoiceId);
  if (invoice === null) {
    return;
  }

  const paidTotalCents = sumCents(invoice.payments.map((payment) => cents(payment.amountCents)));

  if (invoice.status !== 'DRAFT') {
    await updateInvoice(context, invoiceId, {
      paidTotalCents,
      status: deriveStatus({
        isCancelled: invoice.status === 'CANCELLED',
        grossTotalCents: cents(invoice.grossTotalCents),
        paidTotalCents,
      }),
    });
    return;
  }

  const totals = calculateInvoiceTotals(invoice.lines.map(toDomainLine));

  await runInTransaction(async (handle) => {
    for (const [index, line] of invoice.lines.entries()) {
      await updateLineNet(context, line.id, totals.lineNets[index] ?? 0, handle);
    }

    await updateInvoice(
      context,
      invoiceId,
      {
        netTotalCents: totals.netTotalCents,
        taxTotalCents: totals.taxTotalCents,
        grossTotalCents: totals.grossTotalCents,
        paidTotalCents,
        status: 'DRAFT',
      },
      handle,
    );
  });
}
