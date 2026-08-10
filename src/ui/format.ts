/**
 * Deutsche Formatierung für Beträge, Mengen, Zahlen und Daten (NFA-QUAL-08).
 *
 * Die Anzeigeschicht ist der einzige Ort, an dem aus Codes Klartext und aus
 * skalierten Ganzzahlen lesbare Zeichenketten werden. In der Gegenrichtung
 * übersetzt `parseGermanDecimal` deutsche Eingaben in die kanonische Form,
 * die die Domain erwartet.
 */
import type { CurrencyCode } from '@/domain/codes/currency-code';
import type { TaxCategoryCode } from '@/domain/codes/tax-category';
import type { UnitCode } from '@/domain/codes/unit-code';
import { type Cents, ZERO_CENTS } from '@/domain/money/money';
import {
  QUANTITY_DECIMALS,
  type Quantity,
  quantityToCanonicalString,
} from '@/domain/quantity/quantity';
import { currencyLabels, taxCategoryLabels, unitLabels } from '@/i18n/de';

const LOCALE = 'de-DE';

const currencyFormatters = new Map<CurrencyCode, Intl.NumberFormat>();

function currencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  const cached = currencyFormatters.get(currency);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  currencyFormatters.set(currency, formatter);
  return formatter;
}

const plainAmountFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Wandelt Cent in die dezimale Zeichenkette „1234.56" um — ausschließlich über
 * Ganzzahlarithmetik. Intl.NumberFormat nimmt diese Zeichenkette direkt
 * entgegen, sodass auch in der Anzeigeschicht kein `number`-Wert mit
 * Nachkommastellen entsteht (FA-CALC-01).
 */
function centsToDecimalString(value: Cents): `${number}` {
  const numeric: number = value;
  const negative = numeric < 0;
  const absolute = BigInt(negative ? -numeric : numeric);
  const major = absolute / 100n;
  const minor = (absolute % 100n).toString().padStart(2, '0');
  const decimal = `${negative ? '-' : ''}${major.toString()}.${minor}`;
  // Die Zeichenkette ist konstruktionsbedingt eine Dezimalzahl; der Typ
  // `${number}` lässt sich aus einem zusammengesetzten Template nicht ableiten.
  return decimal as `${number}`;
}

/** Formatiert einen Cent-Betrag als deutschen Währungsbetrag, z. B. „1.234,56 €". */
export function formatMoney(value: Cents, currency: CurrencyCode = 'EUR'): string {
  return currencyFormatter(currency).format(centsToDecimalString(value));
}

/** Formatiert einen Cent-Betrag ohne Währungssymbol, z. B. „1.234,56". */
export function formatAmount(value: Cents): string {
  return plainAmountFormatter.format(centsToDecimalString(value));
}

/** Formatiert eine Menge, z. B. 15000 → „1,5". */
export function formatQuantity(quantity: Quantity): string {
  return quantityToCanonicalString(quantity).replace('.', ',');
}

/** Formatiert eine Menge samt deutschem Einheitenlabel, z. B. „1,5 Stunde". */
export function formatQuantityWithUnit(quantity: Quantity, unit: UnitCode): string {
  return `${formatQuantity(quantity)} ${unitLabels[unit]}`;
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

/** Formatiert ein Datum als „TT.MM.JJJJ" in der Zeitzone der Anwendung. */
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

/**
 * Übersetzt eine deutsche Zahleingabe in die kanonische Form für die Domain:
 * Tausenderpunkte entfallen, das Komma wird zum Punkt. „1.234,50" → „1234.50".
 */
export function parseGermanDecimal(input: string): string {
  return input.trim().replace(/\./g, '').replace(',', '.');
}

export { QUANTITY_DECIMALS, ZERO_CENTS };

/**
 * Formatiert einen Steuersatz aus Basispunkten: 1900 → „19 %", 810 → „8,1 %".
 *
 * Die Nachkommastellen erscheinen nur, wenn es welche gibt — „19,00 %" wäre
 * auf einer Rechnung unüblich.
 */
export function formatPercent(basisPoints: number): string {
  const negative = basisPoints < 0;
  const absolute = Math.abs(basisPoints);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;

  const decimal =
    fraction === 0
      ? String(whole)
      : `${String(whole)}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;

  return `${negative ? '-' : ''}${decimal.replace('.', ',')} %`;
}
