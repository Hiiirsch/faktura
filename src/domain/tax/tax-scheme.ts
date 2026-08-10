/**
 * Ermittlung der steuerlichen Behandlung aus den Stammdaten
 * (FA-STAMM-03, Grundlage für FA-CALC-05 bis -07).
 *
 * Reine Ableitung aus Verkäufer- und Käuferdaten, ohne Rechnungsbezug. Der
 * ermittelte Wert ist ein **Vorschlag**: FA-CALC-08 verlangt, dass er je
 * Rechnung überschreibbar bleibt.
 *
 * Vorbehalt zu `AE`: FA-CALC-06 schreibt für EU-Kunden mit USt-IdNr die
 * Kategorie `AE` vor. Fachlich trifft das auf sonstige Leistungen zu; bei
 * innergemeinschaftlichen *Lieferungen* wäre `K` richtig. Für ein
 * Dienstleistungsunternehmen ist `AE` der Regelfall, deshalb wird sie
 * vorgeschlagen — `K` bleibt über die manuelle Auswahl erreichbar.
 */
import { type CountryCode, isEuMemberState } from '../codes/country-code';
import type { TaxCategoryCode } from '../codes/tax-category';

export const TAX_SCHEMES = ['STANDARD', 'SMALL_BUSINESS', 'REVERSE_CHARGE', 'EXPORT'] as const;

export type TaxScheme = (typeof TAX_SCHEMES)[number];

export type TaxSchemeInput = {
  /** Kleinunternehmerregelung nach §19 UStG beim Verkäufer. */
  readonly sellerIsSmallBusiness: boolean;
  readonly sellerCountry: CountryCode;
  readonly buyerCountry: CountryCode;
  /** Bereits formal geprüfte USt-IdNr des Käufers, falls vorhanden. */
  readonly buyerHasVatId: boolean;
};

export function determineTaxScheme(input: TaxSchemeInput): TaxScheme {
  // §19 UStG schlägt alles andere: Wer keine Umsatzsteuer ausweist, weist
  // auch bei einem ausländischen Kunden keine aus (FA-CALC-05).
  if (input.sellerIsSmallBusiness) {
    return 'SMALL_BUSINESS';
  }

  if (input.buyerCountry === input.sellerCountry) {
    return 'STANDARD';
  }

  if (isEuMemberState(input.buyerCountry)) {
    // Ohne USt-IdNr liegt kein B2B-Fall vor; dann bleibt es beim Regelsatz
    // des Verkäuferlandes.
    return input.buyerHasVatId ? 'REVERSE_CHARGE' : 'STANDARD';
  }

  return 'EXPORT';
}

const CATEGORY_BY_SCHEME: Readonly<Record<TaxScheme, TaxCategoryCode>> = {
  STANDARD: 'S',
  SMALL_BUSINESS: 'E',
  REVERSE_CHARGE: 'AE',
  EXPORT: 'G',
};

export function taxCategoryForScheme(scheme: TaxScheme): TaxCategoryCode {
  return CATEGORY_BY_SCHEME[scheme];
}

/** Alle Verfahren außer dem Regelfall werden mit Steuersatz null geführt. */
export function taxRateForScheme(scheme: TaxScheme, standardRate: number): number {
  return scheme === 'STANDARD' ? standardRate : 0;
}

export function isTaxScheme(value: string): value is TaxScheme {
  return (TAX_SCHEMES as readonly string[]).includes(value);
}
