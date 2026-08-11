/**
 * Formatierung für die Oberfläche (NFA-QUAL-08).
 *
 * Die eigentlichen Umwandlungen liegen in `@/domain/format/de` — dieselben
 * Funktionen nutzt der Vorlagen-Renderer für die Filter aus Spec §8.1. Läge die
 * Formatierung nur hier, käme er nicht heran, und eine zweite Umsetzung wiche
 * früher oder später ab: Dann stünde im PDF ein anderer Betrag als auf dem
 * Bildschirm.
 *
 * Was in dieser Datei bleibt, ist das, was nur die Oberfläche braucht: die
 * Umsetzung normierter Codes in deutsche Bezeichnungen und die Ausgabe echter
 * Zeitpunkte in der konfigurierten Zeitzone.
 */
import type { CurrencyCode } from '@/domain/codes/currency-code';
import type { TaxCategoryCode } from '@/domain/codes/tax-category';
import type { UnitCode } from '@/domain/codes/unit-code';
import {
  formatAmountDe,
  formatMoneyDe,
  formatPercentDe,
  formatPlainDateDe,
  formatQuantityDe,
  parseGermanDecimal,
} from '@/domain/format/de';
import { type Cents, ZERO_CENTS } from '@/domain/money/money';
import { QUANTITY_DECIMALS, type Quantity } from '@/domain/quantity/quantity';
import { currencyLabels, taxCategoryLabels, unitLabels } from '@/i18n/de';

const LOCALE = 'de-DE';

export const formatMoney = formatMoneyDe;
export const formatAmount = formatAmountDe;
export const formatQuantity = formatQuantityDe;
export const formatPercent = formatPercentDe;
export const formatPlainDate = formatPlainDateDe;
export { parseGermanDecimal };

/** Formatiert eine Menge samt deutschem Einheitenlabel, z. B. „1,5 Stunde". */
export function formatQuantityWithUnit(quantity: Quantity, unit: UnitCode): string {
  return `${formatQuantityDe(quantity)} ${unitLabels[unit]}`;
}

export function formatUnit(unit: UnitCode): string {
  return unitLabels[unit];
}

export function formatTaxCategory(category: TaxCategoryCode): string {
  return taxCategoryLabels[category];
}

export function formatCurrency(currency: CurrencyCode): string {
  return currencyLabels[currency];
}

/**
 * Formatiert einen Zeitpunkt als „TT.MM.JJJJ" in der Zeitzone der Anwendung.
 *
 * Nur für echte Zeitpunkte — Kalendertage gehen über `formatPlainDate`, damit
 * sie nicht durch eine Zeitzone verschoben werden.
 */
export function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).format(date);
}

/** Formatiert Datum und Uhrzeit als „TT.MM.JJJJ, HH:MM". */
export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

export { QUANTITY_DECIMALS, ZERO_CENTS };
export type { Cents };
