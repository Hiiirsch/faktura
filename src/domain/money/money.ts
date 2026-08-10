/**
 * Geldbeträge als ganzzahlige Cent-Werte (FA-CALC-01, Spec §2).
 *
 * Es gibt in dieser Datei keine Fließkommaoperation. Zwischenergebnisse von
 * Multiplikationen laufen über `bigint`, weil das Produkt aus Betrag, skalierter
 * Menge und Rabattfaktor den sicheren Zahlenbereich von `number` überschreiten
 * kann: 10.000.000,00 € × 1.000 Stück ergibt bereits 10^13, mit einem weiteren
 * Skalierungsfaktor 10^17 — jenseits von Number.MAX_SAFE_INTEGER (≈9·10^15).
 * Das Ergebnis wird erst nach der Rundung wieder in `number` überführt und dabei
 * auf Darstellbarkeit geprüft.
 */

declare const centsBrand: unique symbol;

/** Ein Geldbetrag in Cent. Immer ganzzahlig, kann negativ sein. */
export type Cents = number & { readonly [centsBrand]: true };

export const ZERO_CENTS: Cents = 0 as Cents;

export function isValidCents(value: number): boolean {
  return Number.isSafeInteger(value);
}

/**
 * Erzeugt einen Cent-Betrag. Wirft bei nicht ganzzahligen oder nicht sicher
 * darstellbaren Werten — das wäre ein Programmierfehler, kein Eingabefehler.
 */
export function cents(value: number): Cents {
  if (!isValidCents(value)) {
    throw new RangeError(
      `Cent-Betrag muss eine sichere Ganzzahl sein, erhalten: ${String(value)}`,
    );
  }
  return value as Cents;
}

export type CentsParseError =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'MALFORMED' }
  | { readonly kind: 'TOO_MANY_DECIMALS' }
  | { readonly kind: 'OUT_OF_RANGE' };

/**
 * Liest einen Geldbetrag aus seiner kanonischen Textform („1234.56") und gibt
 * ihn in Cent zurück.
 *
 * Bewusst über die Ziffern der Zeichenkette statt über `parseFloat(x) * 100`:
 * `19.99 * 100` ergibt in Fließkomma 1998.9999999999998, und ein Abschneiden
 * davon wäre um einen Cent falsch (FA-CALC-01). Die Umwandlung deutscher
 * Eingaben ist Aufgabe der Anzeigeschicht.
 */
export function parseCents(input: string): { ok: true; value: Cents } | { ok: false; error: CentsParseError } {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: { kind: 'EMPTY' } };
  }

  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (match === null) {
    return { ok: false, error: { kind: 'MALFORMED' } };
  }

  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.length > 2) {
    return { ok: false, error: { kind: 'TOO_MANY_DECIMALS' } };
  }

  const total = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const signed = sign === '-' ? -total : total;

  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    return { ok: false, error: { kind: 'OUT_OF_RANGE' } };
  }

  return { ok: true, value: Number(signed) as Cents };
}

export function centsToBigInt(value: Cents): bigint {
  return BigInt(value);
}

export function centsFromBigInt(value: bigint): Cents {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Cent-Betrag außerhalb des darstellbaren Bereichs: ${value.toString()}`);
  }
  return Number(value) as Cents;
}

export function addCents(a: Cents, b: Cents): Cents {
  return centsFromBigInt(BigInt(a) + BigInt(b));
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return centsFromBigInt(BigInt(a) - BigInt(b));
}

export function negateCents(value: Cents): Cents {
  const numeric: number = value;
  return cents(-numeric);
}

export function absCents(value: Cents): Cents {
  return cents(Math.abs(value));
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0n;
  for (const value of values) {
    total += BigInt(value);
  }
  return centsFromBigInt(total);
}

export function compareCents(a: Cents, b: Cents): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Ganzzahlige Division mit kaufmännischer Rundung, symmetrisch zur Null
 * (half away from zero): 0,5 → 1 und −0,5 → −1.
 *
 * Symmetrisch deshalb, weil eine Gutschrift den Betrag der Rechnung, die sie
 * storniert, exakt neutralisieren muss. Bei asymmetrischer Rundung bliebe je
 * betroffener Position ein Cent stehen.
 */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new RangeError('Division durch null');
  }

  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

/**
 * Multipliziert einen Cent-Betrag mit dem Bruch `numerator / denominator` und
 * rundet das Ergebnis kaufmännisch auf volle Cent. Ein einziger Rundungsschritt,
 * unabhängig davon, aus wie vielen Faktoren der Bruch zusammengesetzt ist.
 */
export function scaleCents(value: Cents, numerator: bigint, denominator: bigint): Cents {
  return centsFromBigInt(divideRounded(BigInt(value) * numerator, denominator));
}
