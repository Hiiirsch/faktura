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
import { draftBuyerOf, type StoredBuyer } from '@/application/invoices/invoice-buyer';
import { listTemplates } from '@/application/templates/template-service';
import type { Authorized } from '@/application/auth/authorize';
import { getAppTimeZone } from '@/application/system/display-settings';
import type { CountryCode } from '@/domain/codes/country-code';
import { PERCENT_BASIS_POINTS } from '@/domain/invoice/totals';
import { resolvePaymentTerms } from '@/domain/customer/payment-terms';
import { determineTaxScheme, type TaxScheme } from '@/domain/tax/tax-scheme';
import { addDays, todayIn } from '@/domain/time/plain-date';
import { messages } from '@/i18n/de';

import type { EditorBuyerValues } from './buyer-fieldset';
import type { CustomerOption } from './invoice-editor';

/**
 * Ein leerer Empfänger für die Neuanlage.
 *
 * Der Modus richtet sich danach, ob überhaupt Kunden erfasst sind: Wer noch
 * keine hat, soll nicht auf eine leere Auswahlliste blicken, sondern direkt in
 * die Felder schreiben können.
 */
export function emptyEditorBuyer(customerId: string | null): EditorBuyerValues {
  return {
    mode: customerId === null ? 'FIELDS' : 'CUSTOMER',
    customerId: customerId ?? '',
    name: '',
    contactName: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    city: '',
    countryCode: '',
    email: '',
    phone: '',
    vatId: '',
    freeText: '',
  };
}

/** Die gespeicherten Empfängerspalten in Formularwerte. */
export function editorBuyerOf(stored: StoredBuyer): EditorBuyerValues {
  const buyer = draftBuyerOf(stored);
  const text = (value: string | null): string => value ?? '';

  return {
    mode: buyer.mode,
    customerId: text(buyer.customerId),
    name: text(buyer.fields.name),
    contactName: text(buyer.fields.contactName),
    addressLine1: text(buyer.fields.addressLine1),
    addressLine2: text(buyer.fields.addressLine2),
    postalCode: text(buyer.fields.postalCode),
    city: text(buyer.fields.city),
    countryCode: text(buyer.fields.countryCode),
    email: text(buyer.fields.email),
    phone: text(buyer.fields.phone),
    vatId: text(buyer.fields.vatId),
    freeText: text(buyer.freeText),
  };
}

export type EditorContext = {
  readonly customers: readonly CustomerOption[];
  readonly catalog: Awaited<ReturnType<typeof listCatalogItems>>;
  /** Auswahl abweichender Vorlagen je Beleg (FA-TPL-03). */
  readonly templates: readonly {
    readonly id: string;
    readonly label: string;
    /** Die Vorlage, die ein Beleg ohne eigene Wahl bekommt (FA-TPL-03). */
    readonly isDefault: boolean;
  }[];
  readonly defaultTaxRatePercent: string;
  /**
   * Ob das Unternehmen nach §19 UStG abrechnet (M12).
   *
   * Der Editor braucht es nicht zum Rechnen — das steht im Vorschlag —, sondern
   * für die Darstellung: Bei §19 ist die steuerliche Behandlung **festgestellt**
   * und keine Auswahl. Eine Abweichung bleibt möglich (FA-CALC-08), kostet aber
   * einen bewussten Schritt.
   */
  readonly sellerIsSmallBusiness: boolean;
  /** Steuernummer/USt-IdNr — für die Vollständigkeitsprüfung im Entwurf (M12). */
  readonly seller: { readonly hasTaxIdentifier: boolean; readonly vatId: string | null };
  readonly defaultCurrency: string;
  readonly today: string;
  readonly hasCompanyProfile: boolean;
  /** Vorschlag für den zuerst angebotenen Kunden. */
  readonly suggestedTaxScheme: TaxScheme;
  readonly suggestedDueDate: string;
  /** Zahlungsziel der Firmendaten — gilt ohne Kunden (FA-RECH-08). */
  readonly defaultPaymentTerms: number;
  /** Empfängervorbelegung der Neuanlage. */
  readonly initialBuyer: EditorBuyerValues;
};

/**
 * Alles, was der Editor zum Anlegen eines Belegs braucht.
 *
 * **Vier Leserechte in einem Nachweis** (M8): Ein Beleg entsteht nicht aus sich
 * heraus — er braucht die Firmendaten für den Absender, einen Kunden, den
 * Katalog für die Positionen und eine Vorlage. Wer Belege schreiben darf, muss
 * diese vier lesen dürfen; ein Beleg an einen Kunden, den man nicht sehen darf,
 * ist keine sinnvolle Lockerung.
 */
export async function loadEditorContext(
  organization: Authorized<
    'companyProfile.read' | 'customer.read' | 'catalogItem.read' | 'template.read'
  >,
  now: Date = new Date(),
): Promise<EditorContext> {
  const [company, customers, catalog, templates] = await Promise.all([
    getCompanyProfileOrEmpty(organization),
    listSelectableCustomers(organization),
    listCatalogItems(organization),
    listTemplates(organization),
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

  /*
   * **Ohne Kunden wird nicht geraten, sondern dieselbe Regel gefragt** (M12).
   *
   * Hier stand ein `'STANDARD'` für den Fall, dass noch kein Kunde angelegt
   * ist. Das ging an `determineTaxScheme()` vorbei — und damit an der ersten
   * Zeile darin, die alles andere schlägt: Wer nach §19 abrechnet, weist keine
   * Umsatzsteuer aus, gleich an wen. Ein Kleinunternehmer ohne Kundenstamm
   * bekam so einen Beleg mit 19 % vorbelegt.
   *
   * Statt eines zweiten Vorschlagswegs bekommt die Funktion das eigene Land als
   * Empfängerland, wenn es keinen Empfänger gibt: Inland ist die richtige
   * Annahme, solange niemand etwas anderes sagt.
   */
  const suggestedTaxScheme = determineTaxScheme({
    sellerIsSmallBusiness: company.isSmallBusiness,
    sellerCountry: company.countryCode as CountryCode,
    buyerCountry: (first?.countryCode ?? company.countryCode) as CountryCode,
    buyerHasVatId: first?.vatId != null,
  });

  return {
    customers: options,
    catalog,
    /*
     * Der Standard wird **benannt**, nicht als leere Auswahl angeboten (M11).
     *
     * Vorher stand über der Liste ein Eintrag „Standardvorlage" mit leerem Wert.
     * Er verwies auf eine Vorlage, statt eine zu sein — und las sich neben
     * „DIN 5008 (Standard)" wie eine zweite. Jetzt trägt die echte Vorlage den
     * Zusatz, und ausgewählt ist sie von Anfang an.
     */
    templates: templates.map((template) => ({
      id: template.id,
      label: template.isDefault
        ? `${template.name} · ${messages.templates.isDefault}`
        : template.name,
      isDefault: template.isDefault,
    })),
    defaultTaxRatePercent: String(company.defaultTaxRateBasisPoints / PERCENT_BASIS_POINTS),
    sellerIsSmallBusiness: company.isSmallBusiness,
    seller: {
      hasTaxIdentifier:
        (company.taxNumber ?? '').trim().length > 0 || (company.vatId ?? '').trim().length > 0,
      vatId: company.vatId,
    },
    defaultCurrency: company.defaultCurrency,
    today,
    hasCompanyProfile: company.legalName.length > 0,
    suggestedTaxScheme,
    suggestedDueDate: addDays(
      today,
      resolvePaymentTerms(first?.paymentTerms ?? null, company.defaultPaymentTerms),
    ),
    defaultPaymentTerms: company.defaultPaymentTerms,
    initialBuyer: emptyEditorBuyer(first?.id ?? null),
  };
}
