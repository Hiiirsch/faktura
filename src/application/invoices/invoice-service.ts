/**
 * Belege: Anlegen, Neuberechnen, Festschreiben
 * (FA-NUM-02, -03, -04; FA-STAT-01, -03, -04, -05).
 *
 * M3 liefert den Kern: Nummernvergabe, Summenberechnung und Statusableitung.
 * Editor, Snapshot, Unveränderbarkeits-Guards und Storno folgen mit M4.
 */
import { isTaxCategoryCode, type TaxCategoryCode } from '@/domain/codes/tax-category';
import { type Cents, cents, sumCents } from '@/domain/money/money';
import { calculateInvoiceTotals, type InvoiceLineInput } from '@/domain/invoice/totals';
import { allowedTransitionsFrom, deriveStatus, type InvoiceStatus } from '@/domain/invoice/status';
import { quantityFromScaled } from '@/domain/quantity/quantity';
import { parsePlainDate, type PlainDate } from '@/domain/time/plain-date';
import { type TaxScheme } from '@/domain/tax/tax-scheme';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { getPrismaClient } from '@/infrastructure/db/prisma';

import { allocateInvoiceNumber, type TransactionClient } from './invoice-numbering';

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

function toDomainLine(line: InvoiceLineData): InvoiceLineInput {
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

export async function createDraftInvoice(
  data: DraftInvoiceData,
  actorId: string,
  ipAddress: string | null,
): Promise<{ id: string }> {
  const domainLines = data.lines.map(toDomainLine);
  const totals = calculateInvoiceTotals(domainLines);

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
      lines: {
        create: data.lines.map((line, index) => ({
          position: line.position,
          name: line.name,
          description: line.description,
          quantityScaled: line.quantityScaled,
          unitCode: line.unitCode,
          unitPriceCents: line.unitPriceCents,
          taxRateBasisPoints: line.taxRateBasisPoints,
          taxCategory: line.taxCategory,
          discountBasisPoints: line.discountBasisPoints,
          lineNetCents: totals.lineNets[index] ?? 0,
        })),
      },
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

/**
 * Berechnet Positionsbeträge, Summen und Zahlungsstand neu und leitet daraus
 * den Status ab. Einzige Stelle, an der die denormalisierten Summen entstehen
 * (Spec §4.1).
 */
export async function recalculateInvoice(invoiceId: string): Promise<void> {
  const prisma = getPrismaClient();

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lines: { orderBy: { position: 'asc' } }, payments: true },
  });

  const totals = calculateInvoiceTotals(invoice.lines.map(toDomainLine));
  const paidTotalCents = sumCents(invoice.payments.map((payment) => cents(payment.amountCents)));

  const status: InvoiceStatus =
    invoice.status === 'DRAFT'
      ? 'DRAFT'
      : deriveStatus({
          isCancelled: invoice.status === 'CANCELLED',
          grossTotalCents: totals.grossTotalCents,
          paidTotalCents,
        });

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
        status,
      },
    }),
  ]);
}

export type IssueError =
  | { readonly kind: 'NOT_A_DRAFT'; readonly status: InvoiceStatus }
  | { readonly kind: 'MISSING_ISSUE_DATE' }
  | { readonly kind: 'INVALID_ISSUE_DATE' }
  /** Rückdatierung vor eine bereits vergebene Nummer desselben Bereichs. */
  | { readonly kind: 'BACKDATED'; readonly lastIssuedDate: string };

/**
 * Festschreiben: Nummernvergabe und Statuswechsel in **einer** Transaktion
 * (FA-NUM-02, -03).
 *
 * Die Prüfung auf Rückdatierung sichert die zeitliche Ordnung des
 * Nummernkreises: Eine neue Nummer darf kein früheres Rechnungsdatum tragen
 * als die zuletzt vergebene desselben Bereichs, sonst liefe die Nummernfolge
 * der Datumsfolge zuwider.
 *
 * Vollständigkeitsprüfung, Snapshot und Unveränderbarkeits-Guards folgen mit
 * M4 (FA-RECH-12, -13, FA-NUM-08, -09).
 */
export async function issueInvoice(
  invoiceId: string,
  numberFormat: string,
  actorId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<{ ok: true; invoiceNumber: string } | { ok: false; error: IssueError }> {
  const prisma = getPrismaClient();
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

  if (invoice.status !== 'DRAFT') {
    return { ok: false, error: { kind: 'NOT_A_DRAFT', status: invoice.status as InvoiceStatus } };
  }
  if (invoice.issueDate === null) {
    return { ok: false, error: { kind: 'MISSING_ISSUE_DATE' } };
  }

  const parsedDate = parsePlainDate(invoice.issueDate);
  if (!parsedDate.ok) {
    return { ok: false, error: { kind: 'INVALID_ISSUE_DATE' } };
  }
  const issueDate: PlainDate = parsedDate.value;

  const result = await prisma.$transaction(
    async (tx) => {
      const backdating = await findBackdating(tx, issueDate);
      if (backdating !== null) {
        return { ok: false as const, error: backdating };
      }

      const invoiceNumber = await allocateInvoiceNumber(tx, numberFormat, issueDate);

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { invoiceNumber, status: 'ISSUED', issuedAt: now },
      });

      return { ok: true as const, invoiceNumber };
    },
    {
      // Auf einer einzelnen SQLite-Verbindung warten gleichzeitige
      // Festschreibungen aufeinander. `maxWait` muss diese Wartezeit
      // abdecken, sonst bricht die zweite Anfrage ab, statt ihre Nummer zu
      // bekommen (FA-NUM-04).
      maxWait: 30_000,
      timeout: 15_000,
    },
  );

  if (!result.ok) {
    return result;
  }

  await recordAuditEntry({
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'ISSUED',
    actorId,
    ipAddress,
    details: { invoiceNumber: result.invoiceNumber },
  });

  return result;
}

/** Prüft, ob das Rechnungsdatum vor dem zuletzt festgeschriebenen liegt. */
async function findBackdating(
  tx: TransactionClient,
  issueDate: PlainDate,
): Promise<IssueError | null> {
  const latest = await tx.invoice.findFirst({
    where: { invoiceNumber: { not: null }, documentType: 'INVOICE' },
    orderBy: { issueDate: 'desc' },
    select: { issueDate: true },
  });

  if (latest?.issueDate == null || latest.issueDate <= issueDate) {
    return null;
  }

  return { kind: 'BACKDATED', lastIssuedDate: latest.issueDate };
}

/** Erfasst eine Zahlung und leitet den Status neu ab (FA-STAT-03, -04, -05). */
export async function recordPayment(
  invoiceId: string,
  amountCents: Cents,
  paidAt: PlainDate,
  method: string | null,
  note: string | null,
): Promise<void> {
  await getPrismaClient().payment.create({
    data: { invoiceId, amountCents, paidAt, method, note },
  });

  await recalculateInvoice(invoiceId);
}

export function transitionsFor(status: InvoiceStatus): readonly InvoiceStatus[] {
  return allowedTransitionsFrom(status);
}
