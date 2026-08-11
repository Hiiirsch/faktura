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
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { getPrismaClient } from '@/infrastructure/db/prisma';

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
  readonly customerId: string;
  readonly taxScheme: TaxScheme;
  readonly currency: string;
  readonly issueDate: string | null;
  readonly serviceDateFrom: string | null;
  readonly serviceDateTo: string | null;
  readonly dueDate: string | null;
  readonly introText: string | null;
  readonly outroText: string | null;
  readonly purchaseOrderRef: string | null;
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

export async function createDraftInvoice(
  data: DraftInvoiceData,
  actorId: string,
  ipAddress: string | null,
): Promise<{ id: string }> {
  const totals = calculateInvoiceTotals(data.lines.map(toDomainLine));

  const invoice = await getPrismaClient().invoice.create({
    data: {
      customerId: data.customerId,
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
      netTotalCents: totals.netTotalCents,
      taxTotalCents: totals.taxTotalCents,
      grossTotalCents: totals.grossTotalCents,
      lines: { create: lineCreateData(data.lines, totals.lineNets) },
    },
  });

  await recordAuditEntry({
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
  invoiceId: string,
  data: DraftInvoiceData,
  actorId: string,
  ipAddress: string | null,
): Promise<{ ok: true } | { ok: false; error: DraftError }> {
  const prisma = getPrismaClient();
  const existing = await prisma.invoice.findUnique({ where: { id: invoiceId } });

  if (existing === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }
  if (existing.status !== 'DRAFT') {
    return { ok: false, error: { kind: 'NOT_A_DRAFT', status: existing.status } };
  }

  const totals = calculateInvoiceTotals(data.lines.map(toDomainLine));

  await prisma.$transaction([
    prisma.invoiceLine.deleteMany({ where: { invoiceId } }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        customerId: data.customerId,
        taxScheme: data.taxScheme,
        currency: data.currency,
        issueDate: data.issueDate,
        serviceDateFrom: data.serviceDateFrom,
        serviceDateTo: data.serviceDateTo,
        dueDate: data.dueDate,
        introText: data.introText,
        outroText: data.outroText,
        purchaseOrderRef: data.purchaseOrderRef,
        netTotalCents: totals.netTotalCents,
        taxTotalCents: totals.taxTotalCents,
        grossTotalCents: totals.grossTotalCents,
        lines: { create: lineCreateData(data.lines, totals.lineNets) },
      },
    }),
  ]);

  await recordAuditEntry({
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
  invoiceId: string,
  actorId: string,
  ipAddress: string | null,
): Promise<{ ok: true } | { ok: false; error: DraftError }> {
  const prisma = getPrismaClient();
  const existing = await prisma.invoice.findUnique({ where: { id: invoiceId } });

  if (existing === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }
  if (existing.status !== 'DRAFT') {
    return { ok: false, error: { kind: 'NOT_A_DRAFT', status: existing.status } };
  }

  await prisma.invoice.delete({ where: { id: invoiceId } });

  await recordAuditEntry({
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
  invoiceId: string,
  actorId: string,
  ipAddress: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: { kind: 'NOT_FOUND' } }> {
  const prisma = getPrismaClient();
  const source = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  if (source === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }

  const copy = await prisma.invoice.create({
    data: {
      customerId: source.customerId,
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
      lines: {
        create: source.lines.map((line) => ({
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
      },
    },
  });

  await recordAuditEntry({
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
export async function recalculateInvoice(invoiceId: string): Promise<void> {
  const prisma = getPrismaClient();

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lines: { orderBy: { position: 'asc' } }, payments: true },
  });

  const paidTotalCents = sumCents(invoice.payments.map((payment) => cents(payment.amountCents)));

  if (invoice.status !== 'DRAFT') {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidTotalCents,
        status: deriveStatus({
          isCancelled: invoice.status === 'CANCELLED',
          grossTotalCents: cents(invoice.grossTotalCents),
          paidTotalCents,
        }),
      },
    });
    return;
  }

  const totals = calculateInvoiceTotals(invoice.lines.map(toDomainLine));

  await prisma.$transaction([
    ...invoice.lines.map((line, index) =>
      prisma.invoiceLine.update({
        where: { id: line.id },
        data: { lineNetCents: totals.lineNets[index] ?? 0 },
      }),
    ),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        netTotalCents: totals.netTotalCents,
        taxTotalCents: totals.taxTotalCents,
        grossTotalCents: totals.grossTotalCents,
        paidTotalCents,
        status: 'DRAFT',
      },
    }),
  ]);
}
