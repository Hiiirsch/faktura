/**
 * Aufbereitung der Daten für den Rechnungseditor.
 *
 * Liegt neben den Seiten, weil beide — Neuanlage und Bearbeitung — dieselbe
 * Vorbereitung brauchen: Kundenliste, Katalog, Vorgabewerte und die aus
 * Kunden- und Firmendaten abgeleitete steuerliche Behandlung.
 */
import { listCatalogItems } from '@/application/catalog/catalog-service';
import { getCompanyProfileOrEmpty } from '@/application/company/company-profile';
import { listSelectableCustomers } from '@/application/customers/customer-service';
import { getAppTimeZone } from '@/application/system/display-settings';
import type { CountryCode } from '@/domain/codes/country-code';
import { PERCENT_BASIS_POINTS } from '@/domain/invoice/totals';
import { resolvePaymentTerms } from '@/domain/customer/payment-terms';
import { determineTaxScheme, type TaxScheme } from '@/domain/tax/tax-scheme';
import { addDays, todayIn } from '@/domain/time/plain-date';

import type { CustomerOption } from './invoice-editor';

export type EditorContext = {
  readonly customers: readonly CustomerOption[];
  readonly catalog: Awaited<ReturnType<typeof listCatalogItems>>;
  readonly defaultTaxRatePercent: string;
  readonly defaultCurrency: string;
  readonly today: string;
  readonly hasCompanyProfile: boolean;
  /** Vorschlag für den zuerst angebotenen Kunden. */
  readonly suggestedTaxScheme: TaxScheme;
  readonly suggestedDueDate: string;
};

export async function loadEditorContext(now: Date = new Date()): Promise<EditorContext> {
  const [company, customers, catalog] = await Promise.all([
    getCompanyProfileOrEmpty(),
    listSelectableCustomers(),
    listCatalogItems(),
  ]);

  const today = todayIn(getAppTimeZone(), now);
  const first = customers[0];

  const options: readonly CustomerOption[] = customers.map((customer) => ({
    id: customer.id,
    label: `${customer.customerNumber} · ${customer.companyName ?? customer.contactName ?? ''}`,
    paymentTerms: resolvePaymentTerms(customer.paymentTerms, company.defaultPaymentTerms),
    hasVatId: customer.vatId !== null,
    countryCode: customer.countryCode,
  }));

  const suggestedTaxScheme =
    first === undefined
      ? 'STANDARD'
      : determineTaxScheme({
          sellerIsSmallBusiness: company.isSmallBusiness,
          sellerCountry: company.countryCode as CountryCode,
          buyerCountry: first.countryCode as CountryCode,
          buyerHasVatId: first.vatId !== null,
        });

  return {
    customers: options,
    catalog,
    defaultTaxRatePercent: String(company.defaultTaxRateBasisPoints / PERCENT_BASIS_POINTS),
    defaultCurrency: company.defaultCurrency,
    today,
    hasCompanyProfile: company.legalName.length > 0,
    suggestedTaxScheme,
    suggestedDueDate: addDays(
      today,
      resolvePaymentTerms(first?.paymentTerms ?? null, company.defaultPaymentTerms),
    ),
  };
}
