/**
 * Mengen als skalierte Ganzzahlen — Grundlage für FA-CALC-01. Negative Mengen
 * sind zulässig (Korrektur- und Gutschriftpositionen, FA-CALC-11).
 */
import { describe, expect, it } from 'vitest';

import { isErr, isOk, unwrap } from '@/domain/shared/result';
import {
  addQuantity,
  isNegativeQuantity,
  isZeroQuantity,
  negateQuantity,
  parseQuantity,
  QUANTITY_DECIMALS,
  QUANTITY_SCALE,
  quantityFromScaled,
  quantityToCanonicalString,
  quantityToScaledBigInt,
  ZERO_QUANTITY,
} from '@/domain/quantity/quantity';

describe('parseQuantity', () => {
  it('liest ganze Zahlen', () => {
    expect(unwrap(parseQuantity('3'))).toBe(30_000);
    expect(unwrap(parseQuantity('0'))).toBe(0);
  });

  it('liest Nachkommastellen bis zur festgelegten Genauigkeit', () => {
    expect(unwrap(parseQuantity('1.5'))).toBe(15_000);
    expect(unwrap(parseQuantity('0.0001'))).toBe(1);
    expect(unwrap(parseQuantity('2.25'))).toBe(22_500);
  });

  it('liest negative Mengen (FA-CALC-11)', () => {
    expect(unwrap(parseQuantity('-1.5'))).toBe(-15_000);
    expect(unwrap(parseQuantity('-0.0001'))).toBe(-1);
  });

  it('ignoriert umgebende Leerzeichen', () => {
    expect(unwrap(parseQuantity('  7.5  '))).toBe(75_000);
  });

  it('weist leere Eingaben zurück', () => {
    const result = parseQuantity('   ');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('EMPTY');
    }
  });

  it('weist nicht numerische Eingaben zurück', () => {
    for (const input of ['abc', '1,5', '1.2.3', '--1', '1e5', '+1', '.5']) {
      const result = parseQuantity(input);
      expect(isErr(result), `Eingabe "${input}" hätte scheitern müssen`).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe('MALFORMED');
      }
    }
  });

  it('weist zu viele Nachkommastellen zurück, statt still zu runden', () => {
    const result = parseQuantity('1.00005');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('TOO_MANY_DECIMALS');
      if (result.error.kind === 'TOO_MANY_DECIMALS') {
        expect(result.error.maxDecimals).toBe(QUANTITY_DECIMALS);
      }
    }
  });

  it('weist zu viele Vorkommastellen zurück', () => {
    const result = parseQuantity('1234567890123');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('OUT_OF_RANGE');
    }
  });

  it('weist Werte zurück, die skaliert nicht mehr sicher darstellbar sind', () => {
    // 12 Vorkommastellen passen durch die Stellenprüfung, das skalierte
    // Ergebnis (·10^4) liegt aber jenseits von Number.MAX_SAFE_INTEGER.
    for (const input of ['999999999999', '-999999999999']) {
      const result = parseQuantity(input);
      expect(isErr(result), `Eingabe "${input}" hätte scheitern müssen`).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe('OUT_OF_RANGE');
      }
    }
  });

  it('akzeptiert führende Nullen', () => {
    expect(isOk(parseQuantity('000001.5'))).toBe(true);
    expect(unwrap(parseQuantity('000001.5'))).toBe(15_000);
  });
});

describe('quantityToCanonicalString', () => {
  it('gibt ganze Mengen ohne Nachkommastellen aus', () => {
    expect(quantityToCanonicalString(quantityFromScaled(30_000))).toBe('3');
    expect(quantityToCanonicalString(ZERO_QUANTITY)).toBe('0');
  });

  it('kürzt nachlaufende Nullen', () => {
    expect(quantityToCanonicalString(quantityFromScaled(15_000))).toBe('1.5');
    expect(quantityToCanonicalString(quantityFromScaled(15_500))).toBe('1.55');
  });

  it('gibt die kleinste darstellbare Menge aus', () => {
    expect(quantityToCanonicalString(quantityFromScaled(1))).toBe('0.0001');
  });

  it('gibt negative Mengen mit Vorzeichen aus', () => {
    expect(quantityToCanonicalString(quantityFromScaled(-15_000))).toBe('-1.5');
    expect(quantityToCanonicalString(quantityFromScaled(-1))).toBe('-0.0001');
  });

  it('ist zum Parsen invers', () => {
    for (const input of ['0', '1', '1.5', '-2.25', '0.0001', '-0.0001', '999999.9999']) {
      const parsed = unwrap(parseQuantity(input));
      expect(quantityToCanonicalString(parsed)).toBe(input);
    }
  });
});

describe('Rechnen mit Mengen', () => {
  it('addiert', () => {
    expect(addQuantity(quantityFromScaled(15_000), quantityFromScaled(5_000))).toBe(20_000);
  });

  it('negiert', () => {
    expect(negateQuantity(quantityFromScaled(15_000))).toBe(-15_000);
    expect(negateQuantity(quantityFromScaled(-15_000))).toBe(15_000);
  });

  it('erkennt Vorzeichen und Null', () => {
    expect(isNegativeQuantity(quantityFromScaled(-1))).toBe(true);
    expect(isNegativeQuantity(ZERO_QUANTITY)).toBe(false);
    expect(isZeroQuantity(ZERO_QUANTITY)).toBe(true);
    expect(isZeroQuantity(quantityFromScaled(1))).toBe(false);
  });

  it('liefert den skalierten Wert als bigint für die Berechnungskette', () => {
    expect(quantityToScaledBigInt(quantityFromScaled(15_000))).toBe(15_000n);
    expect(QUANTITY_SCALE).toBe(10_000n);
  });

  it('weist nicht ganzzahlige skalierte Werte zurück', () => {
    expect(() => quantityFromScaled(1.5)).toThrow(RangeError);
  });
});
