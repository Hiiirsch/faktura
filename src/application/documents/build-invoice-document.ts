/**
 * Erzeugt das ausgabeneutrale Dokumentmodell aus einem Beleg
 * (NFA-ARCH-02, -03, Spec §3.1).
 *
 * Die einzige Stelle, an der aus Datenbankzeilen ein Dokument wird. Ausgabe-
 * formate — heute HTML und PDF, später ZUGFeRD-XML — setzen ausschließlich hier
 * an und nie an der Datenbank.
 *
 * Bei einem festgeschriebenen Beleg stammen Käufer- und Verkäuferdaten aus dem
 * **Snapshot**, nicht aus den aktuellen Stammdaten (FA-RECH-14). Bei einem
 * Entwurf gibt es noch keinen Snapshot; dort wird der heutige Stand verwendet,
 * damit die Vorschau überhaupt etwas zeigen kann.
 */
import { isCurrencyCode, type CurrencyCode } from '@/domain/codes/currency-code';
import { taxCategoryLabelDe, unitLabelDe } from '@/domain/codes/labels-de';
import { isTaxCategoryCode, type TaxCategoryCode } from '@/domain/codes/tax-category';
import { isUnitCode, type UnitCode } from '@/domain/codes/unit-code';
import type { DocumentType } from '@/domain/document/document-type';
import {
  type DocumentBuyer,
  type DocumentLine,
  type DocumentSeller,
  type DocumentTaxGroup,
  documentShowsTax,
  type InvoiceDocument,
} from '@/domain/document/invoice-document';
import { buildNotices } from '@/domain/document/notices';
import { calculateInvoiceTotals } from '@/domain/invoice/totals';
import { outstandingAmount } from '@/domain/invoice/status';
import { isBuyerSnapshot, isSellerSnapshot } from '@/domain/invoice/snapshot';
import { cents } from '@/domain/money/money';
import { quantityFromScaled } from '@/domain/quantity/quantity';
import { isTaxScheme, type TaxScheme } from '@/domain/tax/tax-scheme';
import { parsePlainDate, type PlainDate } from '@/domain/time/plain-date';
import { documentBuyerOf } from '@/application/invoices/invoice-buyer';
import { findCompanyProfile } from '@/infrastructure/repositories/company-repository';
import { findInvoiceForDocument } from '@/infrastructure/repositories/invoice-repository';
import type { Authorized } from '@/application/auth/authorize';

const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentType, string>> = {
  INVOICE: 'Rechnung',
  CREDIT_NOTE: 'Stornorechnung',
};

function toDate(value: string | null): PlainDate | null {
  if (value === null) {
    return null;
  }
  const parsed = parsePlainDate(value);
  return parsed.ok ? parsed.value : null;
}

function parseSnapshot<T>(raw: string | null, guard: (value: unknown) => value is T): T | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export type BuildDocumentError = { readonly kind: 'NOT_FOUND' } | { readonly kind: 'NO_COMPANY_PROFILE' };

export async function buildInvoiceDocument(
  context: Authorized<'invoice.read'>,
  invoiceId: string,
): Promise<{ ok: true; document: InvoiceDocument } | { ok: false; error: BuildDocumentError }> {
  const [invoice, company] = await Promise.all([
    findInvoiceForDocument(context, invoiceId),
    findCompanyProfile(context),
  ]);

  if (invoice === null) {
    return { ok: false, error: { kind: 'NOT_FOUND' } };
  }
  if (company === null) {
    return { ok: false, error: { kind: 'NO_COMPANY_PROFILE' } };
  }

  const sellerSnapshot = parseSnapshot(invoice.snapshotSeller, isSellerSnapshot);
  const buyerSnapshot = parseSnapshot(invoice.snapshotBuyer, isBuyerSnapshot);

  const seller: DocumentSeller =
    sellerSnapshot === null
      ? {
          name: company.legalName,
          address: {
            addressLine1: company.addressLine1,
            addressLine2: company.addressLine2,
            postalCode: company.postalCode,
            city: company.city,
            countryCode: company.countryCode,
          },
          email: company.email,
          phone: company.phone,
          website: company.website,
          vatId: company.vatId,
          taxNumber: company.taxNumber,
          registerCourt: company.registerCourt,
          registerNumber: company.registerNumber,
          managingDirector: company.managingDirector,
          bankAccountHolder: company.bankAccountHolder,
          iban: company.iban,
          bic: company.bic,
          bankName: company.bankName,
          isSmallBusiness: company.isSmallBusiness,
        }
      : {
          name: sellerSnapshot.name,
          address: {
            addressLine1: sellerSnapshot.addressLine1,
            addressLine2: sellerSnapshot.addressLine2,
            postalCode: sellerSnapshot.postalCode,
            city: sellerSnapshot.city,
            countryCode: sellerSnapshot.countryCode,
          },
          email: sellerSnapshot.email,
          phone: sellerSnapshot.phone,
          website: sellerSnapshot.website,
          vatId: sellerSnapshot.vatId,
          taxNumber: sellerSnapshot.taxNumber,
          registerCourt: sellerSnapshot.registerCourt,
          registerNumber: sellerSnapshot.registerNumber,
          managingDirector: sellerSnapshot.managingDirector,
          bankAccountHolder: sellerSnapshot.bankAccountHolder,
          iban: sellerSnapshot.iban,
          bic: sellerSnapshot.bic,
          bankName: sellerSnapshot.bankName,
          isSmallBusiness: sellerSnapshot.isSmallBusiness,
        };

  const buyer: DocumentBuyer =
    buyerSnapshot === null
      ? // Entwurf: der Empfänger, wie er gerade am Beleg steht — aus den
        // Stammdaten, aus den Feldern oder aus dem freien Block (M5.7).
        documentBuyerOf(invoice, invoice.customer)
      : {
          name: buyerSnapshot.name,
          contactName: buyerSnapshot.contactName,
          address: {
            addressLine1: buyerSnapshot.addressLine1,
            addressLine2: buyerSnapshot.addressLine2,
            postalCode: buyerSnapshot.postalCode,
            city: buyerSnapshot.city,
            countryCode: buyerSnapshot.countryCode,
          },
          addressBlock: buyerSnapshot.addressBlock,
          email: buyerSnapshot.email,
          phone: buyerSnapshot.phone,
          vatId: buyerSnapshot.vatId,
          customerNumber: buyerSnapshot.customerNumber,
          buyerReference: buyerSnapshot.buyerReference,
        };

  const domainLines = invoice.lines.map((line) => ({
    quantity: quantityFromScaled(line.quantityScaled),
    unitPriceCents: cents(line.unitPriceCents),
    discountBasisPoints: line.discountBasisPoints,
    taxRateBasisPoints: line.taxRateBasisPoints,
    taxCategory: isTaxCategoryCode(line.taxCategory) ? line.taxCategory : 'S',
  }));

  const totals = calculateInvoiceTotals(domainLines);

  const lines: readonly DocumentLine[] = invoice.lines.map((line) => {
    const unitCode: UnitCode = isUnitCode(line.unitCode) ? line.unitCode : 'C62';
    const taxCategory: TaxCategoryCode = isTaxCategoryCode(line.taxCategory)
      ? line.taxCategory
      : 'S';

    return {
      position: line.position,
      name: line.name,
      description: line.description,
      quantityScaled: line.quantityScaled,
      unitCode,
      unitLabel: unitLabelDe(unitCode),
      unitPriceCents: cents(line.unitPriceCents),
      discountBasisPoints: line.discountBasisPoints,
      taxRateBasisPoints: line.taxRateBasisPoints,
      taxCategory,
      taxCategoryLabel: taxCategoryLabelDe(taxCategory),
      // Der gespeicherte Wert, nicht der neu gerechnete: Bei einem
      // festgeschriebenen Beleg ist er eingefroren, bei einem Entwurf hält ihn
      // `recalculateInvoice` aktuell.
      lineNetCents: cents(line.lineNetCents),
    };
  });

  const taxBreakdown: readonly DocumentTaxGroup[] = totals.taxBreakdown.map((group) => ({
    taxRateBasisPoints: group.taxRateBasisPoints,
    taxCategory: group.taxCategory,
    taxCategoryLabel: taxCategoryLabelDe(group.taxCategory),
    netCents: group.netCents,
    taxCents: group.taxCents,
  }));

  const documentType: DocumentType =
    invoice.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE';
  const taxScheme: TaxScheme = isTaxScheme(invoice.taxScheme) ? invoice.taxScheme : 'STANDARD';
  const currency: CurrencyCode = isCurrencyCode(invoice.currency) ? invoice.currency : 'EUR';

  const grossCents = cents(invoice.grossTotalCents);
  const paidCents = cents(invoice.paidTotalCents);

  return {
    ok: true,
    document: {
      documentType,
      documentTypeLabel: DOCUMENT_TYPE_LABELS[documentType],
      invoiceNumber: invoice.invoiceNumber,
      issueDate: toDate(invoice.issueDate),
      serviceDateFrom: toDate(invoice.serviceDateFrom),
      serviceDateTo: toDate(invoice.serviceDateTo),
      dueDate: toDate(invoice.dueDate),
      currency,
      purchaseOrderRef: invoice.purchaseOrderRef,
      seller,
      buyer,
      lines,
      taxBreakdown,
      totals: {
        netCents: cents(invoice.netTotalCents),
        taxCents: cents(invoice.taxTotalCents),
        grossCents,
        paidCents,
        outstandingCents: outstandingAmount(grossCents, paidCents),
      },
      preceding:
        invoice.precedingInvoice?.invoiceNumber == null
          ? null
          : {
              invoiceNumber: invoice.precedingInvoice.invoiceNumber,
              issueDate: toDate(invoice.precedingInvoice.issueDate),
            },
      introText: invoice.introText,
      outroText: invoice.outroText,
      footerText: company.footerText,
      notices: buildNotices({
        documentType,
        taxScheme,
        sellerVatId: seller.vatId,
        buyerVatId: buyer.vatId,
        precedingInvoiceNumber: invoice.precedingInvoice?.invoiceNumber ?? null,
      }),
      isDraft: invoice.status === 'DRAFT',
      showsTax: documentShowsTax(seller),
    },
  };
}
