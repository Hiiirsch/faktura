/**
 * Nummernvergabe und Statusableitung gegen eine echte Datenbank
 * (FA-NUM-02, -03, -04, -05, -07; FA-STAT-03, -04, -05).
 *
 * FA-NUM-04 — „zwei nebenläufige Festschreibungen erzeugen niemals dieselbe
 * Nummer" — lässt sich nur so prüfen: Die Atomarität steckt in der Datenbank,
 * nicht im TypeScript-Code.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createDraftInvoice, type DraftInvoiceData } from '@/application/invoices/invoice-service';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { addPayment } from '@/application/invoices/payments';
import {
  listInvoiceSequences,
  setSequenceStartValue,
} from '@/application/invoices/invoice-numbering';
import { createCustomer, type CustomerData } from '@/application/customers/customer-service';
import { EMPTY_COMPANY_PROFILE, saveCompanyProfile } from '@/application/company/company-profile';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const ACTOR = 'pruef-akteur';

const CUSTOMER: CustomerData = {
  companyName: 'Beispiel GmbH',
  contactName: null,
  addressLine1: 'Weg 1',
  addressLine2: null,
  postalCode: '10115',
  city: 'Berlin',
  countryCode: 'DE',
  email: null,
  phone: null,
  vatId: null,
  buyerReference: null,
  paymentTerms: null,
  notes: null,
};

function draft(customerId: string, issueDate: string, overrides: Partial<DraftInvoiceData> = {}) {
  return {
    customerId,
    taxScheme: 'STANDARD' as const,
    currency: 'EUR',
    issueDate,
    serviceDateFrom: issueDate,
    serviceDateTo: null,
    dueDate: issueDate,
    introText: null,
    outroText: null,
    purchaseOrderRef: null,
    lines: [
      {
        position: 1,
        name: 'Beratung',
        description: null,
        quantityScaled: 10_000,
        unitCode: 'HUR',
        unitPriceCents: 10_000,
        taxRateBasisPoints: 1_900,
        taxCategory: 'S',
        discountBasisPoints: 0,
      },
    ],
    ...overrides,
  } satisfies DraftInvoiceData;
}

beforeEach(async () => {
  await resetDatabase();
  await prisma.$disconnect();

  // Das Festschreiben liest Nummernformat und Verkäuferdaten aus dem Profil
  // und verlangt eine Steuernummer (FA-RECH-12, FA-RECH-13).
  await saveCompanyProfile(
    {
      ...EMPTY_COMPANY_PROFILE,
      legalName: 'Musterbetrieb Tim',
      addressLine1: 'Hauptstr. 1',
      postalCode: '89518',
      city: 'Heidenheim',
      taxNumber: '12/345/67890',
    },
    ACTOR,
    null,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeCustomer(): Promise<string> {
  const customer = await createCustomer(CUSTOMER, ACTOR, null);
  return customer.id;
}

describe('Nummernvergabe (FA-NUM-02, -03)', () => {
  it('lässt einen Entwurf ohne Nummer (FA-NUM-02)', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.invoiceNumber).toBeNull();
    expect(invoice.status).toBe('DRAFT');
  });

  it('vergibt die Nummer beim Festschreiben und wechselt den Status', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);

    const result = await issueInvoice(id, ACTOR, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.invoiceNumber).toBe('RE-2026-0001');

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.invoiceNumber).toBe('RE-2026-0001');
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.issuedAt).not.toBeNull();
  });

  it('vergibt fortlaufend', async () => {
    const customerId = await makeCustomer();
    const numbers: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
      const result = await issueInvoice(id, ACTOR, null);
      if (result.ok) {
        numbers.push(result.invoiceNumber);
      }
    }

    expect(numbers).toEqual(['RE-2026-0001', 'RE-2026-0002', 'RE-2026-0003']);
  });

  it('schreibt einen bereits festgeschriebenen Beleg nicht erneut fest', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);

    await issueInvoice(id, ACTOR, null);
    const second = await issueInvoice(id, ACTOR, null);

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.kind).toBe('NOT_A_DRAFT');
    }
  });

  it('verlangt ein Rechnungsdatum', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(
      draft(customerId, '2026-03-01', { issueDate: null, dueDate: null, serviceDateFrom: null }),
      ACTOR,
      null,
    );

    const result = await issueInvoice(id, ACTOR, null);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'INCOMPLETE') {
      expect(result.error.violations.map((violation) => violation.kind)).toContain('NO_ISSUE_DATE');
    } else {
      expect.unreachable('Es wurde eine Vollständigkeitsmeldung erwartet');
    }
  });

  it('protokolliert das Festschreiben (FA-STAT-11)', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
    await issueInvoice(id, ACTOR, '10.0.0.1');

    const entries = await prisma.auditLog.findMany({
      where: { entityType: 'Invoice', entityId: id },
      orderBy: { createdAt: 'asc' },
    });

    expect(entries.map((entry) => entry.action)).toEqual(['CREATED', 'ISSUED']);
    expect(entries[1]?.diffJson).toContain('RE-2026-0001');
  });
});

describe('FA-NUM-04 Nebenläufigkeit', () => {
  it('erzeugt bei gleichzeitigem Festschreiben niemals dieselbe Nummer', async () => {
    const customerId = await makeCustomer();

    const drafts = await Promise.all(
      Array.from({ length: 12 }, () =>
        createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null),
      ),
    );

    const results = await Promise.all(
      drafts.map((created) => issueInvoice(created.id, ACTOR, null)),
    );

    const numbers = results
      .filter((result): result is { ok: true; invoiceNumber: string } => result.ok)
      .map((result) => result.invoiceNumber);

    expect(numbers).toHaveLength(12);
    expect(new Set(numbers).size).toBe(12);

    // Lückenlos von 0001 bis 0012 — eine vergebene Nummer wird nie frei.
    expect([...numbers].sort()).toEqual(
      Array.from({ length: 12 }, (_, index) => `RE-2026-${String(index + 1).padStart(4, '0')}`),
    );
  });

  it('hält die Eindeutigkeit auch auf Datenbankebene', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
    await issueInvoice(id, ACTOR, null);

    const second = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
    await expect(
      prisma.invoice.update({
        where: { id: second.id },
        data: { invoiceNumber: 'RE-2026-0001' },
      }),
    ).rejects.toThrow();
  });
});

describe('Zählerbereiche (FA-NUM-05, -06, -07)', () => {
  it('beginnt zum Jahreswechsel neu', async () => {
    const customerId = await makeCustomer();

    const first = await createDraftInvoice(draft(customerId, '2026-12-31'), ACTOR, null);
    const firstResult = await issueInvoice(first.id, ACTOR, null);

    const second = await createDraftInvoice(draft(customerId, '2027-01-02'), ACTOR, null);
    const secondResult = await issueInvoice(second.id, ACTOR, null);

    expect(firstResult.ok && firstResult.invoiceNumber).toBe('RE-2026-0001');
    expect(secondResult.ok && secondResult.invoiceNumber).toBe('RE-2027-0001');
  });

  it('führt die Zählerstände je Bereich (FA-NUM-06)', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
    await issueInvoice(id, ACTOR, null);

    const sequences = await listInvoiceSequences();
    expect(sequences).toEqual([{ scope: 'INVOICE-2026', lastValue: 1 }]);
  });

  it('lässt einen Startwert setzen, solange nichts vergeben ist (FA-NUM-07)', async () => {
    const customerId = await makeCustomer();

    expect(await setSequenceStartValue('INVOICE-2026', 1_000)).toEqual({ ok: true });

    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
    const result = await issueInvoice(id, ACTOR, null);
    expect(result.ok && result.invoiceNumber).toBe('RE-2026-1001');
  });

  it('verweigert den Startwert, sobald eine Nummer vergeben wurde', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
    await issueInvoice(id, ACTOR, null);

    const result = await setSequenceStartValue('INVOICE-2026', 5_000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('ALREADY_IN_USE');
    }
  });

  it('weist einen unbrauchbaren Startwert zurück', async () => {
    expect((await setSequenceStartValue('INVOICE-2026', -1)).ok).toBe(false);
    expect((await setSequenceStartValue('INVOICE-2026', 1.5)).ok).toBe(false);
  });
});

describe('Zeitliche Ordnung des Nummernkreises', () => {
  it('verweigert eine Rückdatierung hinter die zuletzt vergebene Nummer', async () => {
    const customerId = await makeCustomer();

    const later = await createDraftInvoice(draft(customerId, '2026-03-10'), ACTOR, null);
    await issueInvoice(later.id, ACTOR, null);

    const earlier = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
    const result = await issueInvoice(earlier.id, ACTOR, null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('BACKDATED');
    }

    // Der Zähler darf durch den abgelehnten Versuch nicht weitergelaufen sein.
    expect(await listInvoiceSequences()).toEqual([{ scope: 'INVOICE-2026', lastValue: 1 }]);
  });

  it('lässt dasselbe Rechnungsdatum mehrfach zu', async () => {
    const customerId = await makeCustomer();

    const first = await createDraftInvoice(draft(customerId, '2026-03-10'), ACTOR, null);
    await issueInvoice(first.id, ACTOR, null);

    const second = await createDraftInvoice(draft(customerId, '2026-03-10'), ACTOR, null);
    const result = await issueInvoice(second.id, ACTOR, null);

    expect(result.ok).toBe(true);
  });
});

describe('Zahlungen und Statusableitung (FA-STAT-03, -04, -05)', () => {
  async function issuedInvoice(): Promise<string> {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
    await issueInvoice(id, ACTOR, null);
    return id;
  }

  it('berechnet die Summen beim Anlegen', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.netTotalCents).toBe(10_000);
    expect(invoice.taxTotalCents).toBe(1_900);
    expect(invoice.grossTotalCents).toBe(11_900);
  });

  it('wechselt bei Teilzahlung auf teilbezahlt (FA-STAT-04)', async () => {
    const id = await issuedInvoice();
    await addPayment(id, { amountCents: cents(5_000), paidAt: plainDate('2026-03-05'), method: 'Überweisung', note: null });

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.paidTotalCents).toBe(5_000);
  });

  it('wechselt bei vollständiger Zahlung auf bezahlt (FA-STAT-05)', async () => {
    const id = await issuedInvoice();
    await addPayment(id, { amountCents: cents(5_000), paidAt: plainDate('2026-03-05'), method: null, note: null });
    await addPayment(id, { amountCents: cents(6_900), paidAt: plainDate('2026-03-08'), method: null, note: null });

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.status).toBe('PAID');
    expect(invoice.paidTotalCents).toBe(11_900);
  });

  it('speichert Zahlungen als einzelne Datensätze (FA-STAT-03)', async () => {
    const id = await issuedInvoice();
    await addPayment(id, { amountCents: cents(5_000), paidAt: plainDate('2026-03-05'), method: 'Überweisung', note: 'Teilbetrag' });
    await addPayment(id, { amountCents: cents(6_900), paidAt: plainDate('2026-03-08'), method: 'Lastschrift', note: null });

    const payments = await prisma.payment.findMany({
      where: { invoiceId: id },
      orderBy: { paidAt: 'asc' },
    });

    expect(payments).toHaveLength(2);
    expect(payments[0]?.method).toBe('Überweisung');
    expect(payments[0]?.paidAt).toBe('2026-03-05');
    expect(payments[1]?.amountCents).toBe(6_900);
  });

  it('lässt einen Entwurf trotz Zahlung ein Entwurf bleiben', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(draft(customerId, '2026-03-01'), ACTOR, null);
    await addPayment(id, { amountCents: cents(11_900), paidAt: plainDate('2026-03-05'), method: null, note: null });

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.status).toBe('DRAFT');
  });
});

describe('Steuerliche Behandlung je Beleg (FA-CALC-08)', () => {
  it('übernimmt ein vom Vorschlag abweichendes Verfahren', async () => {
    const customerId = await makeCustomer();

    // Für einen deutschen Kunden schlägt determineTaxScheme STANDARD vor.
    // Der Beleg wird bewusst abweichend als Ausfuhr geführt.
    const { id } = await createDraftInvoice(
      draft(customerId, '2026-03-01', {
        taxScheme: 'EXPORT',
        lines: [
          {
            position: 1,
            name: 'Ausfuhrlieferung',
            description: null,
            quantityScaled: 10_000,
            unitCode: 'C62',
            unitPriceCents: 10_000,
            taxRateBasisPoints: 0,
            taxCategory: 'G',
            discountBasisPoints: 0,
          },
        ],
      }),
      ACTOR,
      null,
    );

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });

    expect(invoice.taxScheme).toBe('EXPORT');
    expect(invoice.lines[0]?.taxCategory).toBe('G');
    expect(invoice.taxTotalCents).toBe(0);
    expect(invoice.grossTotalCents).toBe(invoice.netTotalCents);
  });

  it('lässt gemischte Sätze innerhalb des Regelverfahrens zu (FA-CALC-09)', async () => {
    const customerId = await makeCustomer();

    const { id } = await createDraftInvoice(
      draft(customerId, '2026-03-01', {
        lines: [
          {
            position: 1,
            name: 'Beratung',
            description: null,
            quantityScaled: 10_000,
            unitCode: 'HUR',
            unitPriceCents: 10_000,
            taxRateBasisPoints: 1_900,
            taxCategory: 'S',
            discountBasisPoints: 0,
          },
          {
            position: 2,
            name: 'Fachbuch',
            description: null,
            quantityScaled: 10_000,
            unitCode: 'C62',
            unitPriceCents: 10_000,
            taxRateBasisPoints: 700,
            taxCategory: 'S',
            discountBasisPoints: 0,
          },
        ],
      }),
      ACTOR,
      null,
    );

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.netTotalCents).toBe(20_000);
    expect(invoice.taxTotalCents).toBe(2_600);
    expect(invoice.grossTotalCents).toBe(22_600);
  });

  it('weist eine Position zurück, deren Kategorie keinen Steuersatz erlaubt', async () => {
    const customerId = await makeCustomer();

    await expect(
      createDraftInvoice(
        draft(customerId, '2026-03-01', {
          lines: [
            {
              position: 1,
              name: 'Widersprüchlich',
              description: null,
              quantityScaled: 10_000,
              unitCode: 'C62',
              unitPriceCents: 10_000,
              // Reverse Charge mit 19 % wäre steuerlich falsch.
              taxRateBasisPoints: 1_900,
              taxCategory: 'AE',
              discountBasisPoints: 0,
            },
          ],
        }),
        ACTOR,
        null,
      ),
    ).rejects.toThrow(RangeError);
  });
});
