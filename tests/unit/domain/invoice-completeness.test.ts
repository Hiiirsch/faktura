/**
 * Vollständigkeitsprüfung vor dem Festschreiben (FA-RECH-12).
 *
 * Nach dem Festschreiben ist der Beleg unveränderlich — was hier durchrutscht,
 * lässt sich nur noch durch Storno heilen.
 */
import { describe, expect, it } from 'vitest';

import {
  type IssueCandidate,
  isReadyToIssue,
  validateForIssue,
} from '@/domain/invoice/completeness';
import { type DraftBuyer, EMPTY_BUYER_FIELDS } from '@/domain/invoice/buyer';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';

function candidate(overrides: Partial<IssueCandidate> = {}): IssueCandidate {
  return {
    buyer: { mode: 'CUSTOMER', customerId: 'kunde-1', fields: EMPTY_BUYER_FIELDS, freeText: null },
    issueDate: plainDate('2026-03-01'),
    serviceDateFrom: plainDate('2026-02-01'),
    serviceDateTo: plainDate('2026-02-28'),
    dueDate: plainDate('2026-03-15'),
    taxScheme: 'STANDARD',
    lines: [
      {
        name: 'Beratung',
        quantityScaled: 10_000,
        unitPriceCents: cents(10_000),
        taxRateBasisPoints: 1_900,
        taxCategory: 'S',
      },
    ],
    sellerHasTaxIdentifier: true,
    sellerVatId: 'DE123456789',
    buyerVatId: null,
    ...overrides,
  };
}

function kinds(input: IssueCandidate): readonly string[] {
  return validateForIssue(input).map((violation) => violation.kind);
}

describe('Vollständiger Beleg', () => {
  it('lässt sich festschreiben', () => {
    expect(validateForIssue(candidate())).toEqual([]);
    expect(isReadyToIssue(candidate())).toBe(true);
  });
});

describe('Fehlende Pflichtangaben', () => {
  const buyer = (overrides: Partial<DraftBuyer>): DraftBuyer => ({
    mode: 'CUSTOMER',
    customerId: null,
    fields: EMPTY_BUYER_FIELDS,
    freeText: null,
    ...overrides,
  });

  it('verlangt einen Empfänger aus den Stammdaten', () => {
    expect(kinds(candidate({ buyer: buyer({ customerId: null }) }))).toContain('NO_BUYER');
    expect(kinds(candidate({ buyer: buyer({ customerId: '' }) }))).toContain('NO_BUYER');
  });

  // M5.7: Der Empfänger darf auch am Beleg stehen — Name und Anschrift bleiben
  // Pflicht (FA-PFL-01), nur die Quelle ist frei.
  it('verlangt bei eigenen Feldern Namen und Anschrift', () => {
    const fields = {
      ...EMPTY_BUYER_FIELDS,
      name: 'Beispiel GmbH',
      addressLine1: 'Weg 1',
      city: 'Berlin',
    };

    expect(kinds(candidate({ buyer: buyer({ mode: 'FIELDS', fields }) }))).toEqual([]);
    expect(
      kinds(candidate({ buyer: buyer({ mode: 'FIELDS', fields: EMPTY_BUYER_FIELDS }) })),
    ).toContain('NO_BUYER');
    expect(
      kinds(candidate({ buyer: buyer({ mode: 'FIELDS', fields: { ...fields, city: null } }) })),
    ).toContain('NO_BUYER_ADDRESS');
  });

  it('verlangt beim freien Block mehr als eine Zeile', () => {
    const free = (freeText: string | null): DraftBuyer => buyer({ mode: 'FREE', freeText });

    expect(kinds(candidate({ buyer: free('Beispiel GmbH\nWeg 1\n10115 Berlin') }))).toEqual([]);
    expect(kinds(candidate({ buyer: free(null) }))).toContain('NO_BUYER');
    expect(kinds(candidate({ buyer: free('   ') }))).toContain('NO_BUYER');
    // Ein Name ohne Anschrift genügt §14 UStG nicht.
    expect(kinds(candidate({ buyer: free('Beispiel GmbH') }))).toContain('NO_BUYER_ADDRESS');
  });

  it('verlangt mindestens eine Position', () => {
    expect(kinds(candidate({ lines: [] }))).toContain('NO_LINES');
  });

  it('verlangt eine Bezeichnung je Position', () => {
    const violations = validateForIssue(
      candidate({
        lines: [
          {
            name: '   ',
            quantityScaled: 10_000,
            unitPriceCents: cents(100),
            taxRateBasisPoints: 1_900,
            taxCategory: 'S',
          },
        ],
      }),
    );

    const violation = violations.find((entry) => entry.kind === 'LINE_WITHOUT_NAME');
    expect(violation).toBeDefined();
    if (violation?.kind === 'LINE_WITHOUT_NAME') {
      expect(violation.position).toBe(1);
    }
  });

  it('verlangt Rechnungs-, Leistungs- und Fälligkeitsdatum', () => {
    expect(kinds(candidate({ issueDate: null }))).toContain('NO_ISSUE_DATE');
    expect(kinds(candidate({ dueDate: null }))).toContain('NO_DUE_DATE');
    // BT-72 ist Pflichtangabe.
    expect(kinds(candidate({ serviceDateFrom: null }))).toContain('NO_SERVICE_DATE');
  });

  it('verlangt Steuernummer oder USt-IdNr des Ausstellers', () => {
    expect(kinds(candidate({ sellerHasTaxIdentifier: false }))).toContain('NO_TAX_IDENTIFIER');
  });

  it('meldet alle Verstöße gemeinsam', () => {
    const violations = kinds(
      candidate({
        buyer: buyer({ customerId: null }),
        lines: [],
        issueDate: null,
        sellerHasTaxIdentifier: false,
      }),
    );
    expect(violations.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Widersprüchliche Angaben', () => {
  it('lehnt eine Fälligkeit vor dem Rechnungsdatum ab', () => {
    expect(
      kinds(candidate({ issueDate: plainDate('2026-03-15'), dueDate: plainDate('2026-03-01') })),
    ).toContain('DUE_BEFORE_ISSUE');
  });

  it('erlaubt Fälligkeit am Rechnungstag selbst', () => {
    expect(
      kinds(candidate({ issueDate: plainDate('2026-03-01'), dueDate: plainDate('2026-03-01') })),
    ).not.toContain('DUE_BEFORE_ISSUE');
  });

  it('lehnt einen rückwärts laufenden Leistungszeitraum ab', () => {
    expect(
      kinds(
        candidate({
          serviceDateFrom: plainDate('2026-02-28'),
          serviceDateTo: plainDate('2026-02-01'),
        }),
      ),
    ).toContain('SERVICE_PERIOD_REVERSED');
  });

  it('lehnt einen Steuersatz ab, den die Kategorie nicht zulässt', () => {
    expect(
      kinds(
        candidate({
          lines: [
            {
              name: 'Reverse Charge mit Satz',
              quantityScaled: 10_000,
              unitPriceCents: cents(100),
              taxRateBasisPoints: 1_900,
              taxCategory: 'AE',
            },
          ],
        }),
      ),
    ).toContain('TAX_RATE_CONTRADICTS_CATEGORY');
  });
});

describe('Reverse Charge (FA-PFL-09)', () => {
  it('verlangt beide USt-IdNr', () => {
    expect(
      kinds(
        candidate({
          taxScheme: 'REVERSE_CHARGE',
          buyerVatId: null,
          lines: [
            {
              name: 'Leistung',
              quantityScaled: 10_000,
              unitPriceCents: cents(100),
              taxRateBasisPoints: 0,
              taxCategory: 'AE',
            },
          ],
        }),
      ),
    ).toContain('MISSING_VAT_IDS_FOR_REVERSE_CHARGE');

    expect(
      kinds(
        candidate({
          taxScheme: 'REVERSE_CHARGE',
          sellerVatId: null,
          buyerVatId: 'ATU12345678',
          lines: [
            {
              name: 'Leistung',
              quantityScaled: 10_000,
              unitPriceCents: cents(100),
              taxRateBasisPoints: 0,
              taxCategory: 'AE',
            },
          ],
        }),
      ),
    ).toContain('MISSING_VAT_IDS_FOR_REVERSE_CHARGE');
  });

  it('lässt den Beleg mit beiden Nummern zu', () => {
    expect(
      validateForIssue(
        candidate({
          taxScheme: 'REVERSE_CHARGE',
          sellerVatId: 'DE123456789',
          buyerVatId: 'ATU12345678',
          lines: [
            {
              name: 'Leistung',
              quantityScaled: 10_000,
              unitPriceCents: cents(100),
              taxRateBasisPoints: 0,
              taxCategory: 'AE',
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('verlangt die Nummern bei anderen Verfahren nicht', () => {
    expect(kinds(candidate({ taxScheme: 'SMALL_BUSINESS', buyerVatId: null }))).not.toContain(
      'MISSING_VAT_IDS_FOR_REVERSE_CHARGE',
    );
  });
});
