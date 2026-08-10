/**
 * Berechnung und Steueraufstellung
 * (FA-CALC-02, -03, -04, -05, -06, -09, -10, -11).
 *
 * Tests zuerst (Vorgabe für M3). Diese Logik ist der Kern der Anwendung;
 * Fehler darin fallen erst Monate später auf — beim Jahresabschluss oder bei
 * einer Prüfung.
 *
 * Steuersätze und Rabatte liegen als Basispunkte vor: 1900 = 19 %, 750 = 7,5 %.
 */
import { describe, expect, it } from 'vitest';

import { cents } from '@/domain/money/money';
import { quantityFromScaled } from '@/domain/quantity/quantity';
import {
  calculateInvoiceTotals,
  type InvoiceLineInput,
  PERCENT_BASIS_POINTS,
} from '@/domain/invoice/totals';

/** Kurzform für eine Position; Menge in Stück, Preis in Cent. */
function line(overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput {
  return {
    quantity: quantityFromScaled(10_000), // 1
    unitPriceCents: cents(10_000), // 100,00 €
    discountBasisPoints: 0,
    taxRateBasisPoints: 1900,
    taxCategory: 'S',
    ...overrides,
  };
}

describe('Positionsnetto (FA-CALC-02)', () => {
  it('multipliziert Menge mit Einzelpreis', () => {
    const result = calculateInvoiceTotals([
      line({ quantity: quantityFromScaled(30_000), unitPriceCents: cents(10_000) }),
    ]);
    expect(result.lineNets[0]).toBe(30_000);
  });

  it('rechnet mit Nachkommastellen der Menge', () => {
    // 1,5 Stunden × 95,00 € = 142,50 €
    const result = calculateInvoiceTotals([
      line({ quantity: quantityFromScaled(15_000), unitPriceCents: cents(9_500) }),
    ]);
    expect(result.lineNets[0]).toBe(14_250);
  });

  it('rundet kaufmännisch auf Cent', () => {
    // 3 × 3,33 € = 9,99 €; 0,3333 h × 100,00 € = 33,33 €
    expect(
      calculateInvoiceTotals([
        line({ quantity: quantityFromScaled(30_000), unitPriceCents: cents(333) }),
      ]).lineNets[0],
    ).toBe(999);

    expect(
      calculateInvoiceTotals([
        line({ quantity: quantityFromScaled(3_333), unitPriceCents: cents(10_000) }),
      ]).lineNets[0],
    ).toBe(3_333);
  });

  it('rundet den Halbwertfall von der Null weg', () => {
    // 0,5 Stück × 0,01 € = 0,005 € → 0,01 €
    expect(
      calculateInvoiceTotals([
        line({ quantity: quantityFromScaled(5_000), unitPriceCents: cents(1) }),
      ]).lineNets[0],
    ).toBe(1);

    // Negative Menge, gleicher Betrag → −0,01 €
    expect(
      calculateInvoiceTotals([
        line({ quantity: quantityFromScaled(-5_000), unitPriceCents: cents(1) }),
      ]).lineNets[0],
    ).toBe(-1);
  });

  it('rundet nur einmal — nicht je Zwischenschritt', () => {
    // 3 × 10,00 € mit 33,33 % Rabatt:
    // exakt 3000 × (10000 − 3333) / 10000 = 2000,1 → 2000
    const result = calculateInvoiceTotals([
      line({
        quantity: quantityFromScaled(30_000),
        unitPriceCents: cents(1_000),
        discountBasisPoints: 3_333,
      }),
    ]);
    expect(result.lineNets[0]).toBe(2_000);
  });
});

describe('Positionsrabatt (FA-RECH-05, FA-CALC-11)', () => {
  it('zieht den Rabatt vom Positionsbetrag ab', () => {
    // 100,00 € abzüglich 10 %
    const result = calculateInvoiceTotals([line({ discountBasisPoints: 1_000 })]);
    expect(result.lineNets[0]).toBe(9_000);
  });

  it('verarbeitet Nachkommastellen im Rabattsatz', () => {
    // 100,00 € abzüglich 12,5 %
    const result = calculateInvoiceTotals([line({ discountBasisPoints: 1_250 })]);
    expect(result.lineNets[0]).toBe(8_750);
  });

  it('behandelt 100 % Rabatt als Nullbetrag', () => {
    const result = calculateInvoiceTotals([line({ discountBasisPoints: 10_000 })]);
    expect(result.lineNets[0]).toBe(0);
    expect(result.netTotalCents).toBe(0);
    expect(result.grossTotalCents).toBe(0);
  });

  it('weist einen Rabatt außerhalb von 0 bis 100 % zurück', () => {
    expect(() => calculateInvoiceTotals([line({ discountBasisPoints: -1 })])).toThrow(RangeError);
    expect(() => calculateInvoiceTotals([line({ discountBasisPoints: 10_001 })])).toThrow(
      RangeError,
    );
  });
});

describe('Steueraufstellung nach Satz und Kategorie (FA-CALC-03, -04, -09)', () => {
  it('gruppiert Positionen mit gleichem Satz und gleicher Kategorie', () => {
    const result = calculateInvoiceTotals([
      line({ unitPriceCents: cents(10_000) }),
      line({ unitPriceCents: cents(5_000) }),
    ]);

    expect(result.taxBreakdown).toHaveLength(1);
    expect(result.taxBreakdown[0]?.netCents).toBe(15_000);
    expect(result.taxBreakdown[0]?.taxCents).toBe(2_850);
  });

  it('trennt gemischte Steuersätze (FA-CALC-09)', () => {
    const result = calculateInvoiceTotals([
      line({ unitPriceCents: cents(10_000), taxRateBasisPoints: 1_900 }),
      line({ unitPriceCents: cents(10_000), taxRateBasisPoints: 700 }),
    ]);

    expect(result.taxBreakdown).toHaveLength(2);
    // Aufsteigend nach Satz — für eine stabile Ausgabe im PDF.
    expect(result.taxBreakdown.map((group) => group.taxRateBasisPoints)).toEqual([700, 1_900]);
    expect(result.taxBreakdown[0]?.taxCents).toBe(700);
    expect(result.taxBreakdown[1]?.taxCents).toBe(1_900);
    expect(result.taxTotalCents).toBe(2_600);
  });

  it('trennt gleiche Sätze mit verschiedener Kategorie', () => {
    const result = calculateInvoiceTotals([
      line({ taxRateBasisPoints: 0, taxCategory: 'AE' }),
      line({ taxRateBasisPoints: 0, taxCategory: 'E' }),
    ]);

    expect(result.taxBreakdown).toHaveLength(2);
    expect(result.taxBreakdown.map((group) => group.taxCategory).sort()).toEqual(['AE', 'E']);
  });

  it('rundet die Steuer je Gruppe, nicht je Position (FA-CALC-03)', () => {
    // Drei Positionen zu 3,33 €. Je Position gerundet: 3 × round(0,6327) =
    // 3 × 0,63 = 1,89 €. Je Gruppe gerundet: round(9,99 × 0,19) = 1,90 €.
    const result = calculateInvoiceTotals([
      line({ unitPriceCents: cents(333) }),
      line({ unitPriceCents: cents(333) }),
      line({ unitPriceCents: cents(333) }),
    ]);

    expect(result.taxBreakdown[0]?.netCents).toBe(999);
    expect(result.taxBreakdown[0]?.taxCents).toBe(190);
    expect(result.taxTotalCents).toBe(190);
  });

  it('hält die Summe der Gruppensteuern gleich der Gesamtsteuer (FA-CALC-04)', () => {
    const result = calculateInvoiceTotals([
      line({ unitPriceCents: cents(1_999), taxRateBasisPoints: 1_900 }),
      line({ unitPriceCents: cents(333), taxRateBasisPoints: 700 }),
      line({ unitPriceCents: cents(4_567), taxRateBasisPoints: 1_900 }),
      line({ unitPriceCents: cents(89), taxRateBasisPoints: 700 }),
    ]);

    const sumOfGroups = result.taxBreakdown.reduce((total, group) => total + group.taxCents, 0);
    expect(sumOfGroups).toBe(result.taxTotalCents);
  });

  it('hält Netto plus Steuer gleich Brutto', () => {
    const result = calculateInvoiceTotals([
      line({ unitPriceCents: cents(1_999) }),
      line({ unitPriceCents: cents(333), taxRateBasisPoints: 700 }),
    ]);

    expect(result.netTotalCents + result.taxTotalCents).toBe(result.grossTotalCents);
  });

  it('hält die Summe der Positionsnetti gleich dem Gesamtnetto', () => {
    const result = calculateInvoiceTotals([
      line({ unitPriceCents: cents(1_234) }),
      line({ unitPriceCents: cents(5_678), taxRateBasisPoints: 700 }),
      line({ unitPriceCents: cents(9_012), discountBasisPoints: 1_500 }),
    ]);

    const sumOfLines = result.lineNets.reduce((total, value) => total + value, 0);
    expect(sumOfLines).toBe(result.netTotalCents);
  });
});

describe('Steuerbefreite Verfahren (FA-CALC-05, -06, -07)', () => {
  it('führt Kleinunternehmerpositionen mit Satz 0 und Kategorie E', () => {
    const result = calculateInvoiceTotals([
      line({ taxRateBasisPoints: 0, taxCategory: 'E' }),
      line({ taxRateBasisPoints: 0, taxCategory: 'E', unitPriceCents: cents(2_500) }),
    ]);

    expect(result.taxTotalCents).toBe(0);
    expect(result.grossTotalCents).toBe(result.netTotalCents);
    expect(result.taxBreakdown).toHaveLength(1);
    expect(result.taxBreakdown[0]?.taxCategory).toBe('E');
    expect(result.taxBreakdown[0]?.taxCents).toBe(0);
  });

  it('führt Reverse Charge mit Satz 0 und Kategorie AE', () => {
    const result = calculateInvoiceTotals([line({ taxRateBasisPoints: 0, taxCategory: 'AE' })]);

    expect(result.taxTotalCents).toBe(0);
    expect(result.taxBreakdown[0]?.taxCategory).toBe('AE');
  });

  it('weist einen Steuersatz größer null bei befreiten Kategorien zurück', () => {
    // Ein Beleg mit Kategorie AE und 19 % wäre in sich widersprüchlich.
    for (const category of ['AE', 'E', 'G', 'K', 'Z'] as const) {
      expect(() =>
        calculateInvoiceTotals([line({ taxCategory: category, taxRateBasisPoints: 1_900 })]),
      ).toThrow(RangeError);
    }
  });
});

describe('Grenzfälle (FA-CALC-11)', () => {
  it('liefert für eine Rechnung ohne Positionen überall null', () => {
    const result = calculateInvoiceTotals([]);
    expect(result.lineNets).toEqual([]);
    expect(result.taxBreakdown).toEqual([]);
    expect(result.netTotalCents).toBe(0);
    expect(result.taxTotalCents).toBe(0);
    expect(result.grossTotalCents).toBe(0);
  });

  it('verarbeitet Nullbeträge und Nullmengen', () => {
    const result = calculateInvoiceTotals([
      line({ unitPriceCents: cents(0) }),
      line({ quantity: quantityFromScaled(0) }),
    ]);

    expect(result.netTotalCents).toBe(0);
    expect(result.taxTotalCents).toBe(0);
    expect(result.taxBreakdown[0]?.netCents).toBe(0);
  });

  it('verarbeitet negative Positionen', () => {
    // Korrekturposition: 2 Stück gutgeschrieben.
    const result = calculateInvoiceTotals([
      line({ quantity: quantityFromScaled(50_000) }),
      line({ quantity: quantityFromScaled(-20_000) }),
    ]);

    expect(result.lineNets).toEqual([50_000, -20_000]);
    expect(result.netTotalCents).toBe(30_000);
    expect(result.taxTotalCents).toBe(5_700);
  });

  it('rundet auch eine negative Gruppensumme symmetrisch', () => {
    const positive = calculateInvoiceTotals([line({ unitPriceCents: cents(333) })]);
    const negative = calculateInvoiceTotals([
      line({ unitPriceCents: cents(333), quantity: quantityFromScaled(-10_000) }),
    ]);

    // Eine Gutschrift muss die Rechnung exakt neutralisieren.
    const positiveTax: number = positive.taxTotalCents;
    const positiveGross: number = positive.grossTotalCents;
    expect(negative.taxTotalCents).toBe(-positiveTax);
    expect(negative.grossTotalCents).toBe(-positiveGross);
  });

  it('weist einen Steuersatz außerhalb des zulässigen Bereichs zurück', () => {
    expect(() => calculateInvoiceTotals([line({ taxRateBasisPoints: -1 })])).toThrow(RangeError);
    expect(() => calculateInvoiceTotals([line({ taxRateBasisPoints: 1_000_001 })])).toThrow(
      RangeError,
    );
  });

  it('bleibt bei großen Beträgen exakt', () => {
    // 1.000.000 Stück zu 9.999,99 € — das Zwischenprodukt liegt jenseits
    // dessen, was `number` exakt darstellt.
    const result = calculateInvoiceTotals([
      line({
        quantity: quantityFromScaled(10_000_000_000),
        unitPriceCents: cents(999_999),
        taxRateBasisPoints: 1_900,
      }),
    ]);

    expect(result.netTotalCents).toBe(999_999_000_000);
    expect(result.taxTotalCents).toBe(189_999_810_000);
  });

  it('rechnet mit einem Satz mit Nachkommastellen', () => {
    // 8,1 % (Schweiz) auf 1.000,00 € = 81,00 €
    const result = calculateInvoiceTotals([
      line({ unitPriceCents: cents(100_000), taxRateBasisPoints: 810 }),
    ]);
    expect(result.taxTotalCents).toBe(8_100);
    expect(PERCENT_BASIS_POINTS).toBe(100);
  });
});

describe('Reinheit der Berechnung (FA-CALC-10)', () => {
  it('liefert für gleiche Eingaben stets dasselbe Ergebnis', () => {
    const lines = [line(), line({ taxRateBasisPoints: 700 })];
    expect(calculateInvoiceTotals(lines)).toEqual(calculateInvoiceTotals(lines));
  });

  it('verändert die übergebenen Positionen nicht', () => {
    const lines = [line({ discountBasisPoints: 1_000 })];
    const snapshot = structuredClone(lines);
    calculateInvoiceTotals(lines);
    expect(lines).toEqual(snapshot);
  });
});
