/**
 * Deutsche Formatierung von Beträgen, Mengen, Sätzen und Kalendertagen
 * (NFA-QUAL-08).
 *
 * Liegt in der Domain, weil zwei Schichten dieselben Ergebnisse brauchen: die
 * Oberfläche und der Vorlagen-Renderer (Spec §8.1 verlangt die Filter `money`,
 * `date` und `decimal`). Läge die Formatierung in `src/ui`, käme der Renderer
 * nicht heran — und eine zweite Umsetzung würde früher oder später von der
 * ersten abweichen. Genau dann stünde im PDF ein anderer Betrag als auf dem
 * Bildschirm.
 *
 * Alle Funktionen sind rein und arbeiten ausschließlich über Ganzzahlen. Die
 * Umwandlung nach `number` mit Nachkommastellen findet nirgends statt: Für
 * Intl.NumberFormat wird eine Dezimal-Zeichenkette gebaut (FA-CALC-01).
 *
 * Zeitzonenabhängige Ausgaben (`formatDateTime`) bleiben in der Anzeigeschicht —
 * sie brauchen die Konfiguration und gehören nicht auf einen Beleg.
 */
import type { CurrencyCode } from '../codes/currency-code';
import type { Cents } from '../money/money';
import { type Quantity, quantityToCanonicalString } from '../quantity/quantity';
import type { PlainDate } from '../time/plain-date';

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
 * Wandelt Cent in die dezimale Zeichenkette „1234.56" — ausschließlich über
 * Ganzzahlarithmetik. Intl.NumberFormat nimmt diese Zeichenkette direkt
 * entgegen, sodass auch beim Formatieren kein `number` mit Nachkommastellen
 * entsteht.
 */
function centsToDecimalString(value: Cents): `${number}` {
  const numeric: number = value;
  const negative = numeric < 0;
  const absolute = BigInt(negative ? -numeric : numeric);
  const major = absolute / 100n;
  const minor = (absolute % 100n).toString().padStart(2, '0');
  const decimal = `${negative ? '-' : ''}${major.toString()}.${minor}`;
  // Konstruktionsbedingt eine Dezimalzahl; aus einem zusammengesetzten
  // Template lässt sich der Typ `${number}` nicht ableiten.
  return decimal as `${number}`;
}

/** „1.234,56 €" */
export function formatMoneyDe(value: Cents, currency: CurrencyCode = 'EUR'): string {
  return currencyFormatter(currency).format(centsToDecimalString(value));
}

/** „1.234,56" — ohne Währungszeichen. */
export function formatAmountDe(value: Cents): string {
  return plainAmountFormatter.format(centsToDecimalString(value));
}

/** 15000 → „1,5" */
export function formatQuantityDe(quantity: Quantity): string {
  return quantityToCanonicalString(quantity).replace('.', ',');
}

/**
 * 1900 → „19 %", 810 → „8,1 %".
 *
 * Nachkommastellen erscheinen nur, wenn es welche gibt — „19,00 %" wäre auf
 * einer Rechnung unüblich.
 */
export function formatPercentDe(basisPoints: number): string {
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

/**
 * „2026-03-01" → „01.03.2026".
 *
 * Reine Umstellung der Bestandteile, ohne `Date` und ohne Zeitzone: Der Wert
 * ist bereits ein Kalendertag und darf beim Anzeigen nicht verschoben werden.
 */
export function formatPlainDateDe(value: PlainDate | string | null): string {
  if (value === null || value.length !== 10) {
    return '';
  }
  return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`;
}

/**
 * Übersetzt eine deutsche Zahleingabe in die kanonische Form:
 * Tausenderpunkte entfallen, das Komma wird zum Punkt. „1.234,50" → „1234.50".
 */
export function parseGermanDecimal(input: string): string {
  return input.trim().replace(/\./g, '').replace(',', '.');
}
