/**
 * Deutsche Bezeichnungen zu den normierten Codes (Spec §9.2).
 *
 * Spec §9.2: „Eine Mapping-Tabelle `unitCode → Label` liegt im Domain Layer."
 *
 * In M0 lagen diese Tabellen zunächst in `src/i18n/de.ts` — mit dem Argument,
 * Klartext gehöre ausschließlich in die Anzeigeschicht. Mit dem Renderer aus M5
 * trägt das nicht mehr: Er erzeugt ein deutsches Dokument, liegt aber in der
 * Infrastrukturschicht und darf `i18n` nicht importieren. Die Tabellen hier zu
 * führen löst das ohne Umwege — und ist die Stelle, die die Spezifikation von
 * Anfang an vorgesehen hat.
 *
 * `src/i18n/de.ts` gibt sie unverändert weiter, damit die Oberfläche weiterhin
 * einen einzigen Bezugspunkt für Texte hat.
 *
 * Die Tabellen sind als vollständige Abbildung über den jeweiligen Code-Typ
 * deklariert: Ein neuer Code ohne Bezeichnung ist ein Übersetzungsfehler, keine
 * Lücke im Dokument.
 */
import type { CurrencyCode } from './currency-code';
import type { TaxCategoryCode } from './tax-category';
import type { UnitCode } from './unit-code';

export const unitLabelsDe: Readonly<Record<UnitCode, string>> = {
  C62: 'Stück',
  HUR: 'Stunde',
  DAY: 'Tag',
  MON: 'Monat',
  KGM: 'Kilogramm',
  MTR: 'Meter',
  MTK: 'Quadratmeter',
  LTR: 'Liter',
  E48: 'Leistungseinheit',
};

export const taxCategoryLabelsDe: Readonly<Record<TaxCategoryCode, string>> = {
  S: 'Regelsatz',
  AE: 'Steuerschuldnerschaft des Leistungsempfängers',
  E: 'Steuerbefreit',
  G: 'Ausfuhrlieferung',
  K: 'Innergemeinschaftliche Lieferung',
  Z: 'Nullsatz',
};

export const currencyLabelsDe: Readonly<Record<CurrencyCode, string>> = {
  EUR: 'Euro',
  CHF: 'Schweizer Franken',
  GBP: 'Britisches Pfund',
  USD: 'US-Dollar',
  DKK: 'Dänische Krone',
  SEK: 'Schwedische Krone',
  NOK: 'Norwegische Krone',
  PLN: 'Polnischer Złoty',
  CZK: 'Tschechische Krone',
};

export function unitLabelDe(code: UnitCode): string {
  return unitLabelsDe[code];
}

export function taxCategoryLabelDe(code: TaxCategoryCode): string {
  return taxCategoryLabelsDe[code];
}
