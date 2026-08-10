/**
 * Mengen als ganzzahlige, skalierte Werte (Spec §2: „Decimal mit definierter
 * Nachkommastellenzahl (Vorschlag: 4)").
 *
 * Gespeichert und gerechnet wird ausschließlich mit dem skalierten Integer:
 * 1,5 Stunden sind 15000. Damit bleibt die Berechnungskette frei von
 * Fließkommazahlen (FA-CALC-01) — anders als bei einem `Decimal`-Feld, das
 * SQLite intern als REAL ablegen würde.
 *
 * Negative Mengen sind zulässig (Gutschrift- und Korrekturpositionen),
 * negative Einzelpreise nicht — diese Regel gehört zur Positionsvalidierung.
 */
import { err, ok, type Result } from '../shared/result';

declare const quantityBrand: unique symbol;

/** Eine Menge, skaliert mit 10^QUANTITY_DECIMALS. */
export type Quantity = number & { readonly [quantityBrand]: true };

export const QUANTITY_DECIMALS = 4;
export const QUANTITY_SCALE = 10_000n;

/** Begrenzt die Eingabe auf einen Bereich, der sicher darstellbar bleibt. */
const MAX_INTEGER_DIGITS = 12;

export const ZERO_QUANTITY: Quantity = 0 as Quantity;

export type QuantityParseError =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'MALFORMED'; readonly input: string }
  | { readonly kind: 'TOO_MANY_DECIMALS'; readonly maxDecimals: number }
  | { readonly kind: 'OUT_OF_RANGE'; readonly maxIntegerDigits: number };

export function quantityFromScaled(scaled: number): Quantity {
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError(`Skalierte Menge muss eine sichere Ganzzahl sein, erhalten: ${String(scaled)}`);
  }
  return scaled as Quantity;
}

export function quantityToScaledBigInt(quantity: Quantity): bigint {
  return BigInt(quantity);
}

/**
 * Liest eine Menge aus ihrer kanonischen Textform (Punkt als Dezimaltrennzeichen).
 * Die Umwandlung deutscher Eingaben („1,5") ist Aufgabe der Anzeigeschicht —
 * die Domain kennt keine Lokalisierung.
 */
export function parseQuantity(input: string): Result<Quantity, QuantityParseError> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return err({ kind: 'EMPTY' });
  }

  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (match === null) {
    return err({ kind: 'MALFORMED', input: trimmed });
  }

  const [, sign, integerPart = '', fractionPart = ''] = match;

  if (fractionPart.length > QUANTITY_DECIMALS) {
    return err({ kind: 'TOO_MANY_DECIMALS', maxDecimals: QUANTITY_DECIMALS });
  }
  if (integerPart.replace(/^0+(?=\d)/, '').length > MAX_INTEGER_DIGITS) {
    return err({ kind: 'OUT_OF_RANGE', maxIntegerDigits: MAX_INTEGER_DIGITS });
  }

  const padded = fractionPart.padEnd(QUANTITY_DECIMALS, '0');
  const scaled = BigInt(integerPart + padded);
  const signed = sign === '-' ? -scaled : scaled;

  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    return err({ kind: 'OUT_OF_RANGE', maxIntegerDigits: MAX_INTEGER_DIGITS });
  }

  return ok(quantityFromScaled(Number(signed)));
}

/** Kanonische Textform mit Punkt als Trennzeichen, ohne überflüssige Nullen. */
export function quantityToCanonicalString(quantity: Quantity): string {
  const negative = quantity < 0;
  const absolute = BigInt(Math.abs(quantity));
  const integerPart = absolute / QUANTITY_SCALE;
  const fractionPart = (absolute % QUANTITY_SCALE).toString().padStart(QUANTITY_DECIMALS, '0');
  const trimmedFraction = fractionPart.replace(/0+$/, '');
  const body = trimmedFraction.length > 0
    ? `${integerPart.toString()}.${trimmedFraction}`
    : integerPart.toString();
  return negative ? `-${body}` : body;
}

export function addQuantity(a: Quantity, b: Quantity): Quantity {
  return quantityFromScaled(a + b);
}

export function negateQuantity(quantity: Quantity): Quantity {
  const scaled: number = quantity;
  return quantityFromScaled(-scaled);
}

export function isNegativeQuantity(quantity: Quantity): boolean {
  return quantity < 0;
}

export function isZeroQuantity(quantity: Quantity): boolean {
  return quantity === 0;
}
