/**
 * Festschreiben (FA-RECH-12, -13; FA-NUM-02, -03, -04; FA-STAT-11).
 *
 * Der Vorgang in einer Transaktion: Vollständigkeit prüfen, Snapshot der
 * Partnerdaten einfrieren, Nummer vergeben, Status wechseln. Danach ist der
 * Beleg unveränderlich — die Prisma-Erweiterung setzt das durch.
 */
import { isTaxCategoryCode } from '@/domain/codes/tax-category';
import type { CompletenessViolation } from '@/domain/invoice/completeness';
import { validateForIssue } from '@/domain/invoice/completeness';
import type { BuyerSnapshot, SellerSnapshot } from '@/domain/invoice/snapshot';
import { cents } from '@/domain/money/money';
import { parsePlainDate, type PlainDate } from '@/domain/time/plain-date';
import { isTaxScheme, type TaxScheme } from '@/domain/tax/tax-scheme';
import { runInTransaction, type TransactionHandle } from '@/infrastructure/repositories/client';
import { findCompanyProfile } from '@/infrastructure/repositories/company-repository';
import {
  findInvoiceWithLinesAndCustomer,
  findLatestIssueDate,
  updateInvoice,
} from '@/infrastructure/repositories/invoice-repository';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';

import { dispatchInvoiceEvent, ensureDefaultHandlers } from './event-dispatcher';
import { allocateInvoiceNumber } from './invoice-numbering';

export type IssueError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NOT_A_DRAFT'; readonly status: string }
  | { readonly kind: 'INCOMPLETE'; readonly violations: readonly CompletenessViolation[] }
  | { readonly kind: 'NO_COMPANY_PROFILE' }
  /** Rückdatierung vor eine bereits vergebene Nummer desselben Bereichs. */
  | { readonly kind: 'BACKDATED'; readonly lastIssuedDate: string };

export type IssueResult =
  | { readonly ok: true; readonly invoiceNumber: string }
  | { readonly ok: false; readonly error: IssueError };

function toDate(value: string | null): PlainDate | null {
  if (value === null) {
    return null;
  }
  const parsed = parsePlainDate(value);
  return parsed.ok ? parsed.value : null;
}

export async function issueInvoice(
  context: OrganizationContext,
  invoiceId: string,
  actorId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<IssueResult> {
  ensureDefaultHandlers();

  const [invoice, company] = await Promise.all([
    findInvoiceWithLinesAndCustomer(context, invoiceId),
    findCompanyProfile(context),
  ]);

  if (invoice === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }
  if (invoice.status !== 'DRAFT') {
    return { ok: false, error: { kind: 'NOT_A_DRAFT', status: invoice.status } };
  }
  if (company === null) {
    return { ok: false, error: { kind: 'NO_COMPANY_PROFILE' } };
  }

  const taxScheme: TaxScheme = isTaxScheme(invoice.taxScheme) ? invoice.taxScheme : 'STANDARD';

  const violations = validateForIssue({
    customerId: invoice.customerId,
    issueDate: toDate(invoice.issueDate),
    serviceDateFrom: toDate(invoice.serviceDateFrom),
    serviceDateTo: toDate(invoice.serviceDateTo),
    dueDate: toDate(invoice.dueDate),
    taxScheme,
    lines: invoice.lines.map((line) => ({
      name: line.name,
      quantityScaled: line.quantityScaled,
      unitPriceCents: cents(line.unitPriceCents),
      taxRateBasisPoints: line.taxRateBasisPoints,
      taxCategory: isTaxCategoryCode(line.taxCategory) ? line.taxCategory : 'S',
    })),
    sellerHasTaxIdentifier: company.taxNumber !== null || company.vatId !== null,
    sellerVatId: company.vatId,
    buyerVatId: invoice.customer.vatId,
  });

  if (violations.length > 0) {
    return { ok: false, error: { kind: 'INCOMPLETE', violations } };
  }

  const issueDate = toDate(invoice.issueDate);
  if (issueDate === null) {
    return {
      ok: false,
      error: { kind: 'INCOMPLETE', violations: [{ kind: 'NO_ISSUE_DATE' }] },
    };
  }

  // Snapshot: der Stand vom Tag der Ausstellung, eingefroren (FA-RECH-13).
  const seller: SellerSnapshot = {
    name: company.legalName,
    contactName: company.managingDirector,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    postalCode: company.postalCode,
    city: company.city,
    countryCode: company.countryCode,
    email: company.email,
    phone: company.phone,
    vatId: company.vatId,
    taxNumber: company.taxNumber,
    registerCourt: company.registerCourt,
    registerNumber: company.registerNumber,
    managingDirector: company.managingDirector,
    bankAccountHolder: company.bankAccountHolder,
    iban: company.iban,
    bic: company.bic,
    bankName: company.bankName,
    website: company.website,
    footerText: company.footerText,
    isSmallBusiness: company.isSmallBusiness,
  };

  const buyer: BuyerSnapshot = {
    name: invoice.customer.companyName ?? invoice.customer.contactName ?? '',
    contactName: invoice.customer.contactName,
    addressLine1: invoice.customer.addressLine1,
    addressLine2: invoice.customer.addressLine2,
    postalCode: invoice.customer.postalCode,
    city: invoice.customer.city,
    countryCode: invoice.customer.countryCode,
    email: invoice.customer.email,
    phone: invoice.customer.phone,
    vatId: invoice.customer.vatId,
    customerNumber: invoice.customer.customerNumber,
    buyerReference: invoice.customer.buyerReference,
  };

  const result = await runInTransaction(async (handle) => {
    const backdating = await findBackdating(context, handle, issueDate, invoice.documentType);
    if (backdating !== null) {
      return { ok: false as const, error: backdating };
    }

    const invoiceNumber = await allocateInvoiceNumber(
      context,
      handle,
      company.invoiceNumberFormat,
      issueDate,
    );

    await updateInvoice(
      context,
      invoiceId,
      {
        invoiceNumber,
        status: 'ISSUED',
        issuedAt: now,
        snapshotSeller: JSON.stringify(seller),
        snapshotBuyer: JSON.stringify(buyer),
      },
      handle,
    );

    return { ok: true as const, invoiceNumber };
  });

  if (!result.ok) {
    return result;
  }

  await dispatchInvoiceEvent(context, {
    type: 'InvoiceIssued',
    invoiceId,
    invoiceNumber: result.invoiceNumber,
    issueDate,
    grossTotalCents: cents(invoice.grossTotalCents),
  });

  void actorId;
  void ipAddress;

  return result;
}

/**
 * Prüft, ob das Rechnungsdatum vor dem zuletzt festgeschriebenen liegt.
 *
 * Die Nummernfolge darf der Datumsfolge nicht zuwiderlaufen — sonst entstünde
 * eine Rechnung mit höherer Nummer und früherem Datum.
 */
export async function findBackdating(
  context: OrganizationContext,
  handle: TransactionHandle,
  issueDate: PlainDate,
  documentType: string,
): Promise<IssueError | null> {
  const latest = await findLatestIssueDate(context, documentType, handle);

  if (latest === null || latest <= issueDate) {
    return null;
  }

  return { kind: 'BACKDATED', lastIssuedDate: latest };
}
