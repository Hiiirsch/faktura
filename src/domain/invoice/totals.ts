/**
 * Berechnung von Positionsbeträgen, Steueraufstellung und Summen
 * (FA-CALC-02, -03, -04, -09, -10, Spec §5).
 *
 * Reine Funktion ohne Datenbankzugriff (FA-CALC-10). Alle Beträge sind
 * ganzzahlige Cent, alle Zwischenprodukte laufen über `bigint` — das Produkt
 * aus skalierter Menge, Cent-Betrag und Rabattfaktor überschreitet den sicher
 * darstellbaren Bereich von `number` schon bei alltäglichen Größen.
 *
 * Zwei Regeln aus Spec §5, die den Unterschied machen:
 *
 * 1. Je Position wird **einmal** gerundet, nicht nach jedem Zwischenschritt.
 * 2. Die Steuer wird **je Gruppe** gerundet, nicht je Position. Andernfalls
 *    entstehen Centdifferenzen zwischen der Summe der Positionssteuern und der
 *    ausgewiesenen Gesamtsteuer (FA-CALC-04).
 */
import type { TaxCategoryCode } from '../codes/tax-category';
import { requiresZeroRate } from '../codes/tax-category';
import {
  addCents,
  type Cents,
  centsFromBigInt,
  divideRounded,
  sumCents,
  ZERO_CENTS,
} from '../money/money';
import { type Quantity, QUANTITY_SCALE } from '../quantity/quantity';

/** Steuersätze und Rabatte liegen als Basispunkte vor: 1900 = 19 %. */
export const PERCENT_BASIS_POINTS = 100;
export const FULL_BASIS_POINTS = 10_000;

/** Obergrenze für Steuersätze: 100 % — höher gibt es keinen Satz. */
const MAX_TAX_RATE_BASIS_POINTS = 1_000_000;

export type InvoiceLineInput = {
  readonly quantity: Quantity;
  readonly unitPriceCents: Cents;
  /** 0 bis 10000 (= 0 bis 100 %). */
  readonly discountBasisPoints: number;
  /** 1900 = 19 %. */
  readonly taxRateBasisPoints: number;
  readonly taxCategory: TaxCategoryCode;
};

/** Eine Zeile der Steueraufstellung nach EN 16931 BG-23. */
export type TaxGroup = {
  readonly taxRateBasisPoints: number;
  readonly taxCategory: TaxCategoryCode;
  readonly netCents: Cents;
  readonly taxCents: Cents;
};

export type InvoiceTotals = {
  /** Positionsnetto in der Reihenfolge der Eingabe. */
  readonly lineNets: readonly Cents[];
  readonly taxBreakdown: readonly TaxGroup[];
  readonly netTotalCents: Cents;
  readonly taxTotalCents: Cents;
  readonly grossTotalCents: Cents;
};

function assertValidLine(line: InvoiceLineInput, index: number): void {
  if (
    !Number.isSafeInteger(line.discountBasisPoints) ||
    line.discountBasisPoints < 0 ||
    line.discountBasisPoints > FULL_BASIS_POINTS
  ) {
    throw new RangeError(
      `Position ${String(index + 1)}: Rabatt muss zwischen 0 und 100 % liegen, erhalten ${String(line.discountBasisPoints)} Basispunkte`,
    );
  }

  if (
    !Number.isSafeInteger(line.taxRateBasisPoints) ||
    line.taxRateBasisPoints < 0 ||
    line.taxRateBasisPoints > MAX_TAX_RATE_BASIS_POINTS
  ) {
    throw new RangeError(
      `Position ${String(index + 1)}: Steuersatz außerhalb des zulässigen Bereichs: ${String(line.taxRateBasisPoints)} Basispunkte`,
    );
  }

  // Ein Beleg mit Kategorie AE und 19 % wäre in sich widersprüchlich und
  // steuerlich falsch — er darf gar nicht erst entstehen.
  if (requiresZeroRate(line.taxCategory) && line.taxRateBasisPoints !== 0) {
    throw new RangeError(
      `Position ${String(index + 1)}: Kategorie ${line.taxCategory} verlangt Steuersatz 0, erhalten ${String(line.taxRateBasisPoints)} Basispunkte`,
    );
  }
}

/**
 * Positionsnetto: `Menge × Einzelpreis × (1 − Rabatt)`, ein einziger
 * Rundungsschritt über den vollständigen Bruch.
 */
function calculateLineNet(line: InvoiceLineInput): Cents {
  const numerator =
    BigInt(line.quantity) *
    BigInt(line.unitPriceCents) *
    BigInt(FULL_BASIS_POINTS - line.discountBasisPoints);

  const denominator = QUANTITY_SCALE * BigInt(FULL_BASIS_POINTS);

  return centsFromBigInt(divideRounded(numerator, denominator));
}

function groupKey(line: InvoiceLineInput): string {
  return `${String(line.taxRateBasisPoints)}|${line.taxCategory}`;
}

export function calculateInvoiceTotals(
  lines: readonly InvoiceLineInput[],
): InvoiceTotals {
  const lineNets: Cents[] = [];
  const groups = new Map<string, { line: InvoiceLineInput; netCents: Cents }>();

  lines.forEach((line, index) => {
    assertValidLine(line, index);

    const netCents = calculateLineNet(line);
    lineNets.push(netCents);

    const key = groupKey(line);
    const existing = groups.get(key);
    groups.set(
      key,
      existing === undefined
        ? { line, netCents }
        : { line: existing.line, netCents: addCents(existing.netCents, netCents) },
    );
  });

  const taxBreakdown: TaxGroup[] = [...groups.values()]
    .map(({ line, netCents }) => ({
      taxRateBasisPoints: line.taxRateBasisPoints,
      taxCategory: line.taxCategory,
      netCents,
      // Rundung je Gruppe — das ist der Punkt, an dem sich Centdifferenzen
      // entscheiden (FA-CALC-03).
      taxCents: centsFromBigInt(
        divideRounded(
          BigInt(netCents) * BigInt(line.taxRateBasisPoints),
          BigInt(FULL_BASIS_POINTS),
        ),
      ),
    }))
    // Stabile Reihenfolge: aufsteigend nach Satz, dann nach Kategorie. Ohne
    // sie hinge die Darstellung im PDF von der Eingabereihenfolge ab.
    .sort(
      (a, b) =>
        a.taxRateBasisPoints - b.taxRateBasisPoints ||
        a.taxCategory.localeCompare(b.taxCategory),
    );

  const netTotalCents = sumCents(lineNets);
  const taxTotalCents = sumCents(taxBreakdown.map((group) => group.taxCents));

  return {
    lineNets,
    taxBreakdown,
    netTotalCents,
    taxTotalCents,
    grossTotalCents: addCents(netTotalCents, taxTotalCents),
  };
}

export const EMPTY_TOTALS: InvoiceTotals = {
  lineNets: [],
  taxBreakdown: [],
  netTotalCents: ZERO_CENTS,
  taxTotalCents: ZERO_CENTS,
  grossTotalCents: ZERO_CENTS,
};
