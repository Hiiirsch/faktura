/**
 * Belege und ihre Positionen je Organisation (FA-RECH-*, FA-NUM-*, FA-STAT-*).
 *
 * Gefiltert wird durchgängig über `Invoice.organizationId`. Positionen tragen
 * dieselbe Spalte, werden aber **nicht** darüber abgefragt, sondern über ihren
 * Beleg: Zwei Abfragepfade auf dieselbe Zusage wären zwei Stellen, an denen
 * sie auseinanderlaufen können. Die Spalte an der Position ist Absicherung —
 * ein Datenbanktrigger hält sie mit der des Belegs gleich.
 */
import type { Invoice, InvoiceLine, Prisma } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';

export type { Invoice, InvoiceLine };

const linesInOrder = { orderBy: { position: 'asc' } } satisfies Prisma.Invoice$linesArgs;

const withLines = { lines: linesInOrder } satisfies Prisma.InvoiceInclude;

const withLinesAndCustomer = {
  lines: linesInOrder,
  customer: true,
} satisfies Prisma.InvoiceInclude;

const withLinesAndPayments = {
  lines: linesInOrder,
  payments: true,
} satisfies Prisma.InvoiceInclude;

const withEverything = {
  lines: linesInOrder,
  payments: { orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] },
  customer: true,
  precedingInvoice: { select: { id: true, invoiceNumber: true } },
  cancelledBy: { select: { id: true, invoiceNumber: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithLines = Prisma.InvoiceGetPayload<{ include: typeof withLines }>;
export type InvoiceWithLinesAndCustomer = Prisma.InvoiceGetPayload<{
  include: typeof withLinesAndCustomer;
}>;
export type InvoiceWithEverything = Prisma.InvoiceGetPayload<{ include: typeof withEverything }>;
export type InvoiceWithLinesAndPayments = Prisma.InvoiceGetPayload<{
  include: typeof withLinesAndPayments;
}>;

const forDocument = {
  lines: linesInOrder,
  customer: true,
  precedingInvoice: { select: { invoiceNumber: true, issueDate: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceForDocument = Prisma.InvoiceGetPayload<{ include: typeof forDocument }>;

export type InvoiceLineData = Omit<
  Prisma.InvoiceLineUncheckedCreateInput,
  'invoiceId' | 'organizationId'
>;

export type InvoiceHeaderData = Omit<
  Prisma.InvoiceUncheckedCreateInput,
  'organizationId' | 'lines' | 'payments'
>;

// ─── Lesen ──────────────────────────────────────────────────────────────────

export async function findInvoice(
  context: OrganizationContext,
  id: string,
  handle?: TransactionHandle,
): Promise<Invoice | null> {
  return clientFor(handle).invoice.findFirst({
    where: { id, organizationId: context.organizationId },
  });
}

export async function findInvoiceWithLines(
  context: OrganizationContext,
  id: string,
): Promise<InvoiceWithLines | null> {
  return clientFor(undefined).invoice.findFirst({
    where: { id, organizationId: context.organizationId },
    include: withLines,
  });
}

export async function findInvoiceWithLinesAndCustomer(
  context: OrganizationContext,
  id: string,
): Promise<InvoiceWithLinesAndCustomer | null> {
  return clientFor(undefined).invoice.findFirst({
    where: { id, organizationId: context.organizationId },
    include: withLinesAndCustomer,
  });
}

export async function findInvoiceWithLinesAndPayments(
  context: OrganizationContext,
  id: string,
): Promise<InvoiceWithLinesAndPayments | null> {
  return clientFor(undefined).invoice.findFirst({
    where: { id, organizationId: context.organizationId },
    include: withLinesAndPayments,
  });
}

/** Alles, was das ausgabeneutrale Dokumentmodell braucht (NFA-ARCH-02). */
export async function findInvoiceForDocument(
  context: OrganizationContext,
  id: string,
): Promise<InvoiceForDocument | null> {
  return clientFor(undefined).invoice.findFirst({
    where: { id, organizationId: context.organizationId },
    include: forDocument,
  });
}

export async function findInvoiceDetail(
  context: OrganizationContext,
  id: string,
): Promise<InvoiceWithEverything | null> {
  return clientFor(undefined).invoice.findFirst({
    where: { id, organizationId: context.organizationId },
    include: withEverything,
  });
}

export type InvoiceListQuery = {
  readonly status?: string | undefined;
  readonly statusIn?: readonly string[] | undefined;
  readonly dueBefore?: string | undefined;
  readonly customerId?: string | undefined;
  readonly issuedFrom?: string | undefined;
  readonly issuedTo?: string | undefined;
  readonly search: string;
  readonly orderBy: Prisma.InvoiceOrderByWithRelationInput;
};

const forList = {
  customer: { select: { id: true, companyName: true, contactName: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceListRow = Prisma.InvoiceGetPayload<{ include: typeof forList }>;

export async function listInvoices(
  context: OrganizationContext,
  query: InvoiceListQuery,
): Promise<readonly InvoiceListRow[]> {
  const search = query.search.trim();

  return clientFor(undefined).invoice.findMany({
    where: {
      organizationId: context.organizationId,
      ...(query.customerId === undefined ? {} : { customerId: query.customerId }),
      ...(query.statusIn === undefined ? {} : { status: { in: [...query.statusIn] } }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.dueBefore === undefined ? {} : { dueDate: { lt: query.dueBefore } }),
      ...(query.issuedFrom === undefined && query.issuedTo === undefined
        ? {}
        : {
            issueDate: {
              ...(query.issuedFrom === undefined ? {} : { gte: query.issuedFrom }),
              ...(query.issuedTo === undefined ? {} : { lte: query.issuedTo }),
            },
          }),
      ...(search.length === 0
        ? {}
        : {
            OR: [
              { invoiceNumber: { contains: search } },
              { introText: { contains: search } },
              { purchaseOrderRef: { contains: search } },
              { customer: { companyName: { contains: search } } },
              { customer: { contactName: { contains: search } } },
              { customer: { customerNumber: { contains: search } } },
              // Empfänger ohne Stammdatensatz (M5.7) — ohne diese beiden
              // Bedingungen wären sie über die Suche nicht erreichbar.
              { buyerName: { contains: search } },
              { buyerFreeText: { contains: search } },
              { lines: { some: { name: { contains: search } } } },
            ],
          }),
    },
    orderBy: [query.orderBy, { createdAt: 'desc' }],
    include: forList,
  });
}

/**
 * Das jüngste Ausstellungsdatum eines festgeschriebenen Belegs dieses Typs
 * — Grundlage der Rückdatierungsprüfung beim Festschreiben.
 */
export async function findLatestIssueDate(
  context: OrganizationContext,
  documentType: string,
  handle?: TransactionHandle,
): Promise<string | null> {
  const latest = await clientFor(handle).invoice.findFirst({
    where: {
      organizationId: context.organizationId,
      invoiceNumber: { not: null },
      documentType,
    },
    orderBy: { issueDate: 'desc' },
    select: { issueDate: true },
  });

  return latest?.issueDate ?? null;
}

// ─── Schreiben ──────────────────────────────────────────────────────────────

export async function createInvoice(
  context: OrganizationContext,
  header: InvoiceHeaderData,
  lines: readonly InvoiceLineData[],
  handle?: TransactionHandle,
): Promise<Invoice> {
  return clientFor(handle).invoice.create({
    data: {
      ...header,
      organizationId: context.organizationId,
      lines: {
        create: lines.map((line) => ({ ...line, organizationId: context.organizationId })),
      },
    },
  });
}

/**
 * Ändert einen Beleg. Wie überall steht `organizationId` in der Bedingung; ein
 * fremder Beleg wird nicht getroffen.
 *
 * Gibt zurück, ob ein Datensatz betroffen war — der Aufrufer unterscheidet
 * daran „nicht vorhanden" von „geändert", ohne vorher zu lesen.
 */
export async function updateInvoice(
  context: OrganizationContext,
  id: string,
  data: Prisma.InvoiceUncheckedUpdateInput,
  handle?: TransactionHandle,
): Promise<boolean> {
  const result = await clientFor(handle).invoice.updateMany({
    where: { id, organizationId: context.organizationId },
    data,
  });
  return result.count > 0;
}

/** Ersetzt Kopfdaten und Positionen eines Entwurfs in einem Zug. */
export async function replaceDraftContent(
  context: OrganizationContext,
  id: string,
  header: Prisma.InvoiceUncheckedUpdateInput,
  lines: readonly InvoiceLineData[],
  handle: TransactionHandle,
): Promise<void> {
  const client = clientFor(handle);

  await client.invoiceLine.deleteMany({
    where: { invoiceId: id, invoice: { organizationId: context.organizationId } },
  });

  await client.invoice.updateMany({
    where: { id, organizationId: context.organizationId },
    data: header,
  });

  await client.invoiceLine.createMany({
    data: lines.map((line) => ({
      ...line,
      invoiceId: id,
      organizationId: context.organizationId,
    })),
  });
}

export async function updateLineNet(
  context: OrganizationContext,
  lineId: string,
  lineNetCents: number,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).invoiceLine.updateMany({
    where: { id: lineId, invoice: { organizationId: context.organizationId } },
    data: { lineNetCents },
  });
}

/** Nur Entwürfe; festgeschriebene Belege wehrt zusätzlich ein Trigger ab. */
export async function deleteInvoice(
  context: OrganizationContext,
  id: string,
): Promise<boolean> {
  const result = await clientFor(undefined).invoice.deleteMany({
    where: { id, organizationId: context.organizationId },
  });
  return result.count > 0;
}
