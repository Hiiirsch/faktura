/**
 * Festschreiben (FA-RECH-12, -13; FA-NUM-02, -03, -04; FA-STAT-11).
 *
 * Der Vorgang in einer Transaktion: Vollständigkeit prüfen, Snapshot der
 * Partnerdaten einfrieren, Nummer vergeben, Status wechseln. Danach ist der
 * Beleg unveränderlich — Datenbank-Trigger setzen das durch.
 *
 * **Und sein Aussehen ebenfalls** (M12, FA-PDF-13). Gleich nach dem
 * Festschreiben entsteht das PDF und wird als Artefakt abgelegt; `InvoiceArtifact_no_update`
 * nagelt es danach fest. Bis M12 entstand es erst beim **ersten Abruf** — wer
 * dazwischen die Vorlage oder das Briefpapier änderte, änderte den Beleg. Bei
 * den Daten gab es diese Lücke nie, beim Aussehen schon.
 */
import { isTaxCategoryCode } from '@/domain/codes/tax-category';
import type { CompletenessViolation } from '@/domain/invoice/completeness';
import { validateForIssue } from '@/domain/invoice/completeness';
import type { SellerSnapshot } from '@/domain/invoice/snapshot';
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
import type { Authorized } from '@/application/auth/authorize';

import { getOrCreateInvoicePdf } from '@/application/documents/render-invoice';
import { logger } from '@/infrastructure/logging/logger';

import { dispatchInvoiceEvent, ensureDefaultHandlers } from './event-dispatcher';
import { buyerSnapshotOf, draftBuyerOf } from './invoice-buyer';
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
  /*
   * **Lesen gehört dazu** (M12): Nach dem Festschreiben wird der Beleg gesetzt
   * und abgelegt, und das Setzen verlangt `invoice.read`. Wer festschreiben
   * darf, darf ohnehin lesen — der Nachweis sagt es jetzt nur auch.
   */
  context: Authorized<'invoice.issue' | 'invoice.read'>,
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

  const buyer = buyerSnapshotOf(invoice, invoice.customer);

  const violations = validateForIssue({
    buyer: draftBuyerOf(invoice),
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
    buyerVatId: buyer.vatId,
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
    logoAssetId: company.logoAssetId,
    letterheadAssetId: company.letterheadAssetId,
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

  await dispatchInvoiceEvent({ organization: context, actorId, ipAddress }, {
    type: 'InvoiceIssued',
    invoiceId,
    invoiceNumber: result.invoiceNumber,
    issueDate,
    grossTotalCents: cents(invoice.grossTotalCents),
  });

  /*
   * Das PDF entsteht jetzt, nicht beim ersten Abruf (M12, FA-PDF-13).
   *
   * **Ein Fehlschlag darf das Festschreiben nicht umwerfen.** Die Nummer ist
   * vergeben, der Beleg steht in der Datenbank und ist unveränderlich — ein
   * Abbruch an dieser Stelle ließe einen gültigen Beleg wie einen gescheiterten
   * aussehen. Kommt der Renderer nicht hoch, entsteht das PDF eben beim Abruf,
   * wie bis M11. Der Fehlschlag steht dafür im Log.
   *
   * Bewusst **nach** dem Ereignis: Das Protokoll soll die Ausstellung nennen,
   * auch wenn das Setzen scheitert.
   */
  try {
    const rendered = await getOrCreateInvoicePdf(context, invoiceId);
    if (!rendered.ok) {
      logger.warn('invoice.artifact_not_created', { invoiceId, error: rendered.error });
    }
  } catch (error) {
    logger.warn('invoice.artifact_not_created', { invoiceId, error });
  }

  return result;
}

/**
 * Prüft, ob das Rechnungsdatum vor dem zuletzt festgeschriebenen liegt.
 *
 * Die Nummernfolge darf der Datumsfolge nicht zuwiderlaufen — sonst entstünde
 * eine Rechnung mit höherer Nummer und früherem Datum.
 */
export async function findBackdating(
  context: Authorized<'invoice.issue'>,
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
