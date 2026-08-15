/**
 * Lesen von Belegen für Liste und Detailansicht
 * (FA-RECH-15, -16; FA-KUND-08; FA-STAT-02).
 *
 * Die Überfälligkeit wird hier abgeleitet und nie gespeichert (FA-STAT-02);
 * „heute" kommt aus der konfigurierten Zeitzone.
 */
import { isInvoiceStatus, type InvoiceStatus, isOverdue } from '@/domain/invoice/status';
import {
  isBuyerSnapshot,
  isSellerSnapshot,
  type BuyerSnapshot,
  type SellerSnapshot,
} from '@/domain/invoice/snapshot';
import type { DocumentType } from '@/domain/document/document-type';
import { parsePlainDate, type PlainDate, todayIn } from '@/domain/time/plain-date';
import { buyerDisplayName } from '@/domain/invoice/buyer';
import { getEnv } from '@/infrastructure/config/env';

import { draftBuyerOf } from './invoice-buyer';
import {
  findInvoiceDetail,
  listInvoices as queryInvoices,
} from '@/infrastructure/repositories/invoice-repository';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';

export type InvoiceListFilter = {
  readonly status?: InvoiceStatus | 'OVERDUE';
  readonly customerId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly search?: string;
  readonly sort?: 'number' | 'issueDate' | 'gross' | 'dueDate';
  readonly direction?: 'asc' | 'desc';
};

function customerNameOf(
  customer: { readonly companyName: string | null; readonly contactName: string | null } | null,
): string | null {
  return customer === null ? null : (customer.companyName ?? customer.contactName);
}

export type InvoiceListEntry = {
  readonly id: string;
  readonly documentType: DocumentType;
  readonly invoiceNumber: string | null;
  readonly status: InvoiceStatus;
  readonly isOverdue: boolean;
  readonly customerName: string;
  readonly customerId: string | null;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly netTotalCents: number;
  readonly grossTotalCents: number;
  readonly paidTotalCents: number;
  readonly currency: string;
};

function asStatus(value: string): InvoiceStatus {
  return isInvoiceStatus(value) ? value : 'DRAFT';
}

function asDate(value: string | null): PlainDate | null {
  if (value === null) {
    return null;
  }
  const parsed = parsePlainDate(value);
  return parsed.ok ? parsed.value : null;
}

export function today(now: Date = new Date()): PlainDate {
  return todayIn(getEnv().APP_TIMEZONE, now);
}

export async function listInvoices(
  context: OrganizationContext,
  filter: InvoiceListFilter = {},
  now: Date = new Date(),
): Promise<readonly InvoiceListEntry[]> {
  const reference = today(now);

  const sortField = filter.sort ?? 'issueDate';
  const direction = filter.direction ?? 'desc';
  const orderBy =
    sortField === 'number'
      ? { invoiceNumber: direction }
      : sortField === 'gross'
        ? { grossTotalCents: direction }
        : sortField === 'dueDate'
          ? { dueDate: direction }
          : { issueDate: direction };

  const invoices = await queryInvoices(context, {
    customerId: filter.customerId,
    // „Überfällig" ist kein Status, sondern ein abgeleiteter Zustand: offene
    // Belege mit Fälligkeitsdatum vor heute (FA-STAT-02).
    ...(filter.status === 'OVERDUE'
      ? { statusIn: ['ISSUED', 'PARTIALLY_PAID'], dueBefore: reference }
      : { status: filter.status }),
    issuedFrom: filter.from,
    issuedTo: filter.to,
    search: filter.search ?? '',
    orderBy,
  });

  return invoices.map((invoice) => {
    const status = asStatus(invoice.status);
    return {
      id: invoice.id,
      documentType: invoice.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE',
      invoiceNumber: invoice.invoiceNumber,
      status,
      isOverdue: isOverdue(status, asDate(invoice.dueDate), reference),
      // Der Empfänger, gleich woher er stammt (M5.7). Ohne Stammdatensatz
      // steht hier der Name vom Beleg; bleibt auch der leer, ein Gedankenstrich
      // — die Liste soll nicht eine Kennung anzeigen, die niemandem hilft.
      customerName: buyerDisplayName(draftBuyerOf(invoice), customerNameOf(invoice.customer)) ?? '',
      customerId: invoice.customerId,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      netTotalCents: invoice.netTotalCents,
      grossTotalCents: invoice.grossTotalCents,
      paidTotalCents: invoice.paidTotalCents,
      currency: invoice.currency,
    };
  });
}

export type InvoiceDetail = Awaited<ReturnType<typeof loadInvoiceDetail>>;

export async function loadInvoiceDetail(
  context: OrganizationContext,
  invoiceId: string,
  now: Date = new Date(),
) {
  const invoice = await findInvoiceDetail(context, invoiceId);

  if (invoice === null) {
    return null;
  }

  const status = asStatus(invoice.status);
  const reference = today(now);

  return {
    ...invoice,
    status,
    isOverdue: isOverdue(status, asDate(invoice.dueDate), reference),
    sellerSnapshot: parseSnapshot(invoice.snapshotSeller, isSellerSnapshot),
    buyerSnapshot: parseSnapshot(invoice.snapshotBuyer, isBuyerSnapshot),
  };
}

function parseSnapshot<T>(raw: string | null, guard: (value: unknown) => value is T): T | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    // Ein beschädigter Snapshot darf nicht als leere Adresse durchgehen.
    return null;
  }
}

export type { BuyerSnapshot, SellerSnapshot };

/** Belege eines Kunden für die Kundendetailseite (FA-KUND-08). */
export async function listInvoicesForCustomer(
  context: OrganizationContext,
  customerId: string,
  now: Date = new Date(),
): Promise<readonly InvoiceListEntry[]> {
  return listInvoices(context, { customerId, sort: 'issueDate', direction: 'desc' }, now);
}
