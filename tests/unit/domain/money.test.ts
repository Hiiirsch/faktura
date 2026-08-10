/**
 * Cent-Arithmetik — Grundlage für FA-CALC-01 (Geld ausschließlich als Integer
 * in Cent) und FA-CALC-02 (kaufmännische Rundung).
 *
 * Die vollständige Positions- und Steuerberechnung folgt in M3; hier wird das
 * Rechenwerk geprüft, auf dem sie aufsetzt.
 */
import { describe, expect, it } from 'vitest';

import {
  absCents,
  addCents,
  cents,
  centsFromBigInt,
  centsToBigInt,
  compareCents,
  divideRounded,
  isValidCents,
  negateCents,
  parseCents,
  scaleCents,
  subtractCents,
  sumCents,
  ZERO_CENTS,
} from '@/domain/money/money';

describe('cents — Konstruktion (FA-CALC-01)', () => {
  it('nimmt ganzzahlige Werte an', () => {
    expect(cents(0)).toBe(0);
    expect(cents(-1)).toBe(-1);
    expect(cents(123456)).toBe(123456);
  });

  it('weist Nachkommastellen zurück', () => {
    expect(() => cents(1.5)).toThrow(RangeError);
    expect(() => cents(0.1)).toThrow(RangeError);
  });

  it('weist nicht sicher darstellbare Werte zurück', () => {
    expect(() => cents(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    expect(() => cents(Number.NaN)).toThrow(RangeError);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('erkennt gültige Werte ohne zu werfen', () => {
    expect(isValidCents(42)).toBe(true);
    expect(isValidCents(4.2)).toBe(false);
  });
});

describe('Grundrechenarten', () => {
  it('addiert und subtrahiert', () => {
    expect(addCents(cents(1999), cents(1))).toBe(2000);
    expect(subtractCents(cents(1999), cents(2000))).toBe(-1);
  });

  it('summiert eine leere Liste zu null', () => {
    expect(sumCents([])).toBe(ZERO_CENTS);
  });

  it('summiert gemischte Vorzeichen', () => {
    expect(sumCents([cents(1000), cents(-250), cents(-750)])).toBe(0);
  });

  it('negiert und bildet Beträge', () => {
    expect(negateCents(cents(500))).toBe(-500);
    expect(negateCents(cents(-500))).toBe(500);
    expect(absCents(cents(-500))).toBe(500);
    expect(absCents(cents(500))).toBe(500);
  });

  it('vergleicht', () => {
    expect(compareCents(cents(1), cents(2))).toBe(-1);
    expect(compareCents(cents(2), cents(2))).toBe(0);
    expect(compareCents(cents(3), cents(2))).toBe(1);
  });

  it('wandelt verlustfrei nach bigint und zurück', () => {
    expect(centsToBigInt(cents(-98765))).toBe(-98765n);
    expect(centsFromBigInt(-98765n)).toBe(-98765);
  });

  it('meldet einen Überlauf beim Rückweg aus bigint', () => {
    const tooLarge = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => centsFromBigInt(tooLarge)).toThrow(RangeError);
    expect(() => centsFromBigInt(-tooLarge)).toThrow(RangeError);
  });
});

describe('divideRounded — kaufmännische Rundung, symmetrisch (FA-CALC-02)', () => {
  it('rundet ab unterhalb der Hälfte', () => {
    expect(divideRounded(4n, 10n)).toBe(0n);
    expect(divideRounded(149n, 100n)).toBe(1n);
  });

  it('rundet bei genau der Hälfte von der Null weg', () => {
    expect(divideRounded(5n, 10n)).toBe(1n);
    expect(divideRounded(15n, 10n)).toBe(2n);
    expect(divideRounded(-5n, 10n)).toBe(-1n);
    expect(divideRounded(-15n, 10n)).toBe(-2n);
  });

  it('rundet auf oberhalb der Hälfte', () => {
    expect(divideRounded(6n, 10n)).toBe(1n);
    expect(divideRounded(-6n, 10n)).toBe(-1n);
  });

  it('behandelt negative Nenner wie positive', () => {
    expect(divideRounded(5n, -10n)).toBe(-1n);
    expect(divideRounded(-5n, -10n)).toBe(1n);
  });

  it('ist exakt bei glatter Division', () => {
    expect(divideRounded(100n, 4n)).toBe(25n);
    expect(divideRounded(-100n, 4n)).toBe(-25n);
  });

  it('weist die Division durch null zurück', () => {
    expect(() => divideRounded(1n, 0n)).toThrow(RangeError);
  });

  it('rundet symmetrisch, sodass eine Gutschrift die Rechnung neutralisiert', () => {
    // Genau dieser Fall unterscheidet symmetrische von aufrundender Rundung:
    // bei "half up" bliebe je Position ein Cent stehen.
    for (const numerator of [5n, 15n, 25n, 35n]) {
      expect(divideRounded(numerator, 10n) + divideRounded(-numerator, 10n)).toBe(0n);
    }
  });
});

describe('scaleCents', () => {
  it('multipliziert mit einem Bruch und rundet einmal', () => {
    // 19 % von 10,00 € = 1,90 €
    expect(scaleCents(cents(1000), 19n, 100n)).toBe(190);
    // 7 % von 3,33 € = 0,2331 € → 0,23 €
    expect(scaleCents(cents(333), 7n, 100n)).toBe(23);
  });

  it('rundet den Halbwertfall von der Null weg', () => {
    // 0,5 Cent aufwärts
    expect(scaleCents(cents(1), 5n, 10n)).toBe(1);
    expect(scaleCents(cents(-1), 5n, 10n)).toBe(-1);
  });

  it('bleibt bei Zwischenprodukten jenseits von Number.MAX_SAFE_INTEGER exakt', () => {
    // 1.000.000.000,00 € × 1.000.000 als Bruch: das Zwischenprodukt liegt bei
    // 10^17 und wäre als `number` nicht mehr exakt darstellbar.
    const amount = cents(100_000_000_000);
    const result = scaleCents(amount, 1_000_000n, 1_000_000n);
    expect(result).toBe(100_000_000_000);
  });

  it('meldet ein Ergebnis außerhalb des darstellbaren Bereichs', () => {
    expect(() => scaleCents(cents(Number.MAX_SAFE_INTEGER), 2n, 1n)).toThrow(RangeError);
  });
});

describe('parseCents — Eingabe in Cent (FA-CALC-01)', () => {
  it('liest ganze Beträge und Nachkommastellen', () => {
    expect(parseCents('0')).toEqual({ ok: true, value: 0 });
    expect(parseCents('19')).toEqual({ ok: true, value: 1900 });
    expect(parseCents('19.99')).toEqual({ ok: true, value: 1999 });
    expect(parseCents('0.05')).toEqual({ ok: true, value: 5 });
    expect(parseCents('1234.5')).toEqual({ ok: true, value: 123450 });
  });

  it('bleibt bei Beträgen exakt, an denen Fließkomma scheitert', () => {
    // 19.99 * 100 ergibt in IEEE-754 1998.9999999999998.
    for (const [input, expected] of [
      ['19.99', 1999],
      ['0.29', 29],
      ['1.15', 115],
      ['8.87', 887],
      ['1234567.89', 123456789],
    ] as const) {
      expect(parseCents(input), input).toEqual({ ok: true, value: expected });
    }
  });

  it('liest negative Beträge', () => {
    expect(parseCents('-19.99')).toEqual({ ok: true, value: -1999 });
  });

  it('weist leere, formwidrige und zu genaue Eingaben zurück', () => {
    expect(parseCents('   ')).toEqual({ ok: false, error: { kind: 'EMPTY' } });
    expect(parseCents('19,99')).toEqual({ ok: false, error: { kind: 'MALFORMED' } });
    expect(parseCents('abc')).toEqual({ ok: false, error: { kind: 'MALFORMED' } });
    expect(parseCents('1.234')).toEqual({ ok: false, error: { kind: 'TOO_MANY_DECIMALS' } });
  });

  it('weist Beträge außerhalb des darstellbaren Bereichs zurück', () => {
    expect(parseCents('99999999999999999')).toEqual({
      ok: false,
      error: { kind: 'OUT_OF_RANGE' },
    });
  });
});
