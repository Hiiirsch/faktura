/**
 * FA-TPL-06 — Die Template-Variablen sind in der Oberfläche dokumentiert.
 *
 * Der Test prüft nicht, dass die Liste existiert, sondern dass sie **stimmt**:
 * Jeder dokumentierte Ausdruck wird gegen den tatsächlichen Gültigkeitsbereich
 * gehalten, den die Engine aufbaut. Eine Dokumentation, die neben der
 * Wirklichkeit herläuft, kostet den Leser Zeit und endet in einer leeren Stelle
 * im Beleg — das ist schlimmer als keine.
 */
import { describe, expect, it } from 'vitest';

import type { InvoiceDocument } from '@/domain/document/invoice-document';
import { cents } from '@/domain/money/money';
import { TEMPLATE_VARIABLES, variablesOfGroup } from '@/domain/rendering/template-variables';
import { plainDate } from '@/domain/time/plain-date';
import { buildScope } from '@/infrastructure/rendering/liquid-engine';

const document: InvoiceDocument = {
  documentType: 'INVOICE',
  documentTypeLabel: 'Rechnung',
  invoiceNumber: 'RE-2026-0001',
  issueDate: plainDate('2026-03-01'),
  serviceDateFrom: plainDate('2026-02-01'),
  serviceDateTo: plainDate('2026-02-28'),
  dueDate: plainDate('2026-03-15'),
  currency: 'EUR',
  purchaseOrderRef: 'B-1',
  seller: {
    name: 'Musterbetrieb',
    address: {
      addressLine1: 'Hauptstr. 1',
      addressLine2: null,
      postalCode: '89518',
      city: 'Heidenheim',
      countryCode: 'DE',
    },
    email: null,
    phone: null,
    website: null,
    vatId: 'DE123456789',
    taxNumber: '12/345/67890',
    registerCourt: null,
    registerNumber: null,
    managingDirector: null,
    bankAccountHolder: 'Tim',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    bankName: 'Commerzbank',
    isSmallBusiness: false,
  },
  buyer: {
    name: 'Beispiel GmbH',
    contactName: null,
    address: {
      addressLine1: 'Weg 1',
      addressLine2: null,
      postalCode: '10115',
      city: 'Berlin',
      countryCode: 'DE',
    },
    email: null,
    phone: null,
    vatId: null,
    customerNumber: 'K-0001',
    buyerReference: null,
  },
  lines: [
    {
      position: 1,
      name: 'Beratung',
      description: null,
      quantityScaled: 10_000,
      unitCode: 'HUR',
      unitLabel: 'Stunde',
      unitPriceCents: cents(9_500),
      discountBasisPoints: 0,
      taxRateBasisPoints: 1_900,
      taxCategory: 'S',
      taxCategoryLabel: 'Regelsatz',
      lineNetCents: cents(9_500),
    },
  ],
  taxBreakdown: [
    {
      taxRateBasisPoints: 1_900,
      taxCategory: 'S',
      taxCategoryLabel: 'Regelsatz',
      netCents: cents(9_500),
      taxCents: cents(1_805),
    },
  ],
  totals: {
    netCents: cents(9_500),
    taxCents: cents(1_805),
    grossCents: cents(11_305),
    paidCents: cents(0),
    outstandingCents: cents(11_305),
  },
  preceding: { invoiceNumber: 'RE-2026-0000', issueDate: plainDate('2026-02-01') },
  introText: null,
  outroText: null,
  footerText: null,
  notices: [],
  isDraft: false,
};

/** Läuft einen Punktpfad wie `seller.address.city` durch den Bereich. */
function resolve(scope: Record<string, unknown>, path: string): unknown {
  let current: unknown = scope;

  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

describe('FA-TPL-06 Variablenreferenz', () => {
  const scope = buildScope(document);

  it('enthält jede dokumentierte Wurzel im Gültigkeitsbereich', () => {
    const missing: string[] = [];

    for (const variable of TEMPLATE_VARIABLES) {
      if (variable.group === 'filters') {
        continue;
      }

      // Positionen und Steuergruppen sind Schleifenvariablen; sie werden
      // gegen das erste Element geprüft.
      const path =
        variable.group === 'lines'
          ? variable.expression.replace(/^line\./, 'lines.0.')
          : variable.group === 'taxBreakdown'
            ? variable.expression.replace(/^group\./, 'taxBreakdown.0.')
            : variable.expression;

      if (resolve(scope, path) === undefined) {
        missing.push(variable.expression);
      }
    }

    expect(missing).toEqual([]);
  });

  it('dokumentiert jeden Zweig des Gültigkeitsbereichs', () => {
    const documented = new Set(
      TEMPLATE_VARIABLES.map((variable) => variable.expression.split('.')[0]),
    );

    const undocumented = Object.keys(scope).filter(
      (key) => !documented.has(key) && key !== 'lines' && key !== 'taxBreakdown',
    );

    expect(undocumented).toEqual([]);
  });

  it('führt jede Gruppe mit Einträgen', () => {
    for (const group of [
      'seller',
      'buyer',
      'invoice',
      'lines',
      'taxBreakdown',
      'totals',
      'notices',
      'filters',
    ] as const) {
      expect(variablesOfGroup(group).length, group).toBeGreaterThan(0);
    }
  });

  it('nennt jeden Filter, den die Engine registriert', () => {
    const filters = variablesOfGroup('filters').map((variable) => variable.expression);

    for (const filter of ['| money', '| decimal', '| quantity', '| percent', '| date']) {
      expect(filters).toContain(filter);
    }
  });

  it('führt keinen Ausdruck doppelt', () => {
    const expressions = TEMPLATE_VARIABLES.map((variable) => variable.expression);
    expect(new Set(expressions).size).toBe(expressions.length);
  });
});
