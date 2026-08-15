/**
 * Lebenszyklus eines Belegs gegen eine echte Datenbank
 * (FA-RECH-10, -11, -12, -13, -14; FA-NUM-08, -09;
 *  FA-STAT-06, -07, -08, -09, -10, -11; NFA-COMP-01, -02; NFA-ARCH-08).
 *
 * Die Unveränderbarkeit ist nur dann eine Zusage, wenn sie sich nicht umgehen
 * lässt — deshalb wird hier nicht der Use Case geprüft, sondern der direkte
 * Schreibzugriff an ihm vorbei.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_COMPANY_PROFILE, saveCompanyProfile } from '@/application/company/company-profile';
import { createCustomer, updateCustomer, type CustomerData } from '@/application/customers/customer-service';
import { cancelInvoice } from '@/application/invoices/cancel-invoice';
import {
  dispatchInvoiceEvent,
  registerInvoiceEventHandler,
} from '@/application/invoices/event-dispatcher';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import {
  createDraftInvoice,
  deleteDraftInvoice,
  type DraftInvoiceData,
  duplicateInvoice,
  updateDraftInvoice,
} from '@/application/invoices/invoice-service';
import { listInvoices, loadInvoiceDetail } from '@/application/invoices/invoice-queries';
import {
  addPayment,
  markAsFullyPaid,
  removePayment,
  updatePayment,
} from '@/application/invoices/payments';
import type { InvoiceEvent } from '@/domain/invoice/events';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';

import { customerBuyer } from '../support/buyer';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';
import { testOrganization } from './setup/organization';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });
const ACTOR = 'pruef-akteur';

const CUSTOMER: CustomerData = {
  companyName: 'Beispiel GmbH',
  contactName: 'Frau Beispiel',
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

function draft(customerId: string, overrides: Partial<DraftInvoiceData> = {}): DraftInvoiceData {
  return {
    buyer: customerBuyer(customerId),
    taxScheme: 'STANDARD',
    currency: 'EUR',
    issueDate: '2026-03-01',
    serviceDateFrom: '2026-02-01',
    serviceDateTo: '2026-02-28',
    dueDate: '2026-03-15',
    introText: null,
    outroText: null,
    purchaseOrderRef: null,
    templateId: null,
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
  };
}

beforeEach(async () => {
  await resetDatabase();
  await prisma.$disconnect();

  await saveCompanyProfile(testOrganization, 
    {
      ...EMPTY_COMPANY_PROFILE,
      legalName: 'Musterbetrieb Tim',
      addressLine1: 'Hauptstr. 1',
      postalCode: '89518',
      city: 'Heidenheim',
      taxNumber: '12/345/67890',
      iban: 'DE89370400440532013000',
    },
    ACTOR,
    null,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeCustomer(overrides: Partial<CustomerData> = {}): Promise<string> {
  const customer = await createCustomer(testOrganization, { ...CUSTOMER, ...overrides }, ACTOR, null);
  return customer.id;
}

async function issuedInvoice(): Promise<string> {
  const customerId = await makeCustomer();
  const { id } = await createDraftInvoice(testOrganization, draft(customerId), ACTOR, null);
  const result = await issueInvoice(testOrganization, id, ACTOR, null);
  expect(result.ok, 'Der Beleg sollte festschreibbar sein').toBe(true);
  return id;
}

describe('Entwurf bearbeiten, duplizieren, löschen (FA-RECH-01, -10, -11)', () => {
  it('ändert Kopfdaten und Positionen eines Entwurfs', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(testOrganization, draft(customerId), ACTOR, null);

    const result = await updateDraftInvoice(testOrganization, 
      id,
      draft(customerId, {
        introText: 'Vielen Dank für Ihren Auftrag.',
        lines: [
          {
            position: 1,
            name: 'Konzeption',
            description: 'Workshop',
            quantityScaled: 20_000,
            unitCode: 'HUR',
            unitPriceCents: 9_500,
            taxRateBasisPoints: 1_900,
            taxCategory: 'S',
            discountBasisPoints: 1_000,
          },
        ],
      }),
      ACTOR,
      null,
    );

    expect(result.ok).toBe(true);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    expect(invoice.introText).toBe('Vielen Dank für Ihren Auftrag.');
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0]?.name).toBe('Konzeption');
    // 2 × 95,00 € abzüglich 10 % = 171,00 €
    expect(invoice.netTotalCents).toBe(17_100);
  });

  it('dupliziert als frischen Entwurf ohne Nummer (FA-RECH-10)', async () => {
    const id = await issuedInvoice();
    const copy = await duplicateInvoice(testOrganization, id, ACTOR, null);

    expect(copy.ok).toBe(true);
    if (!copy.ok) return;

    const duplicated = await prisma.invoice.findUniqueOrThrow({
      where: { id: copy.id },
      include: { lines: true, payments: true },
    });

    expect(duplicated.invoiceNumber).toBeNull();
    expect(duplicated.status).toBe('DRAFT');
    expect(duplicated.issueDate).toBeNull();
    expect(duplicated.snapshotBuyer).toBeNull();
    expect(duplicated.payments).toHaveLength(0);
    expect(duplicated.lines).toHaveLength(1);
  });

  it('löscht Entwürfe, aber keine festgeschriebenen Belege (FA-RECH-11)', async () => {
    const customerId = await makeCustomer();
    const { id: draftId } = await createDraftInvoice(testOrganization, draft(customerId), ACTOR, null);

    expect((await deleteDraftInvoice(testOrganization, draftId, ACTOR, null)).ok).toBe(true);
    expect(await prisma.invoice.findUnique({ where: { id: draftId } })).toBeNull();

    const issuedId = await issuedInvoice();
    const rejected = await deleteDraftInvoice(testOrganization, issuedId, ACTOR, null);
    expect(rejected.ok).toBe(false);
    expect(await prisma.invoice.findUnique({ where: { id: issuedId } })).not.toBeNull();
  });
});

describe('Vollständigkeit vor dem Festschreiben (FA-RECH-12)', () => {
  it('blockiert einen Beleg ohne Positionen', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(testOrganization, draft(customerId, { lines: [] }), ACTOR, null);

    const result = await issueInvoice(testOrganization, id, ACTOR, null);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'INCOMPLETE') {
      expect(result.error.violations.map((violation) => violation.kind)).toContain('NO_LINES');
    } else {
      expect.unreachable('Es wurde eine Vollständigkeitsmeldung erwartet');
    }

    // Der Beleg bleibt Entwurf und erhält keine Nummer.
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.status).toBe('DRAFT');
    expect(invoice.invoiceNumber).toBeNull();
  });

  it('blockiert ohne Steuernummer des eigenen Unternehmens', async () => {
    await saveCompanyProfile(testOrganization, 
      {
        ...EMPTY_COMPANY_PROFILE,
        legalName: 'Ohne Steuernummer',
        addressLine1: 'A 1',
        postalCode: '1',
        city: 'B',
      },
      ACTOR,
      null,
    );

    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(testOrganization, draft(customerId), ACTOR, null);

    const result = await issueInvoice(testOrganization, id, ACTOR, null);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'INCOMPLETE') {
      expect(result.error.violations.map((violation) => violation.kind)).toContain(
        'NO_TAX_IDENTIFIER',
      );
    }
  });
});

describe('Snapshot beim Festschreiben (FA-RECH-13, -14)', () => {
  it('friert Käufer- und Verkäuferdaten ein', async () => {
    const id = await issuedInvoice();
    const detail = await loadInvoiceDetail(testOrganization, id);

    expect(detail?.buyerSnapshot?.name).toBe('Beispiel GmbH');
    expect(detail?.buyerSnapshot?.city).toBe('Berlin');
    expect(detail?.sellerSnapshot?.name).toBe('Musterbetrieb Tim');
    expect(detail?.sellerSnapshot?.iban).toBe('DE89370400440532013000');
    expect(detail?.sellerSnapshot?.taxNumber).toBe('12/345/67890');
  });

  it('lässt eine Altrechnung durch einen Kundenumzug unberührt (FA-RECH-14, A6)', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(testOrganization, draft(customerId), ACTOR, null);
    await issueInvoice(testOrganization, id, ACTOR, null);

    await updateCustomer(testOrganization, 
      customerId,
      { ...CUSTOMER, addressLine1: 'Neue Straße 99', postalCode: '20095', city: 'Hamburg' },
      ACTOR,
      null,
    );

    const detail = await loadInvoiceDetail(testOrganization, id);
    expect(detail?.buyerSnapshot?.addressLine1).toBe('Weg 1');
    expect(detail?.buyerSnapshot?.city).toBe('Berlin');

    // Der Kunde selbst ist umgezogen.
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(customer.city).toBe('Hamburg');
  });
});

describe('Unveränderbarkeit in der Persistenzschicht (FA-NUM-08, -09)', () => {
  it('weist eine inhaltliche Änderung am festgeschriebenen Beleg ab — auch am Use Case vorbei', async () => {
    const id = await issuedInvoice();

    for (const data of [
      { introText: 'nachträglich geändert' },
      { issueDate: '2026-04-01' },
      { netTotalCents: 1 },
      { customerId: 'anderer-kunde' },
      { invoiceNumber: 'RE-2026-9999' },
    ]) {
      await expect(
        prisma.invoice.update({ where: { id }, data }),
        JSON.stringify(data),
      ).rejects.toThrow();
    }
  });

  it('weist eine Änderung an den Positionen ab', async () => {
    const id = await issuedInvoice();
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id } });

    await expect(
      prisma.invoiceLine.update({ where: { id: line.id }, data: { unitPriceCents: 1 } }),
    ).rejects.toThrow();
    await expect(prisma.invoiceLine.delete({ where: { id: line.id } })).rejects.toThrow();
  });

  it('weist das Zurücksetzen auf Entwurf ab', async () => {
    const id = await issuedInvoice();
    await expect(
      prisma.invoice.update({ where: { id }, data: { status: 'DRAFT' } }),
    ).rejects.toThrow();
  });

  it('lässt Zahlungsstand, Status und Stornovermerk weiterhin zu', async () => {
    const id = await issuedInvoice();

    await expect(
      prisma.invoice.update({
        where: { id },
        data: { paidTotalCents: 5_000, status: 'PARTIALLY_PAID' },
      }),
    ).resolves.toBeDefined();
  });

  it('verhindert das Löschen eines festgeschriebenen Belegs', async () => {
    const id = await issuedInvoice();
    await expect(prisma.invoice.delete({ where: { id } })).rejects.toThrow();
  });
});

describe('Audit-Log ist unveränderlich (NFA-COMP-02)', () => {
  it('weist Ändern und Löschen ab', async () => {
    const entry = await prisma.auditLog.create({
      data: {
        organizationId: testOrganization.organizationId,
        entityType: 'Test',
        entityId: 'x',
        action: 'CREATED',
      },
    });

    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'UPDATED' } }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow();
    await expect(prisma.auditLog.deleteMany({ where: { entityType: 'Test' } })).rejects.toThrow();
  });
});

describe('Zahlungen (FA-STAT-06, -07)', () => {
  it('markiert als vollständig bezahlt über den Restbetrag (FA-STAT-06)', async () => {
    const id = await issuedInvoice();
    await addPayment(testOrganization, id, {
      amountCents: cents(5_000),
      paidAt: plainDate('2026-03-05'),
      method: null,
      note: null,
    });

    expect((await markAsFullyPaid(testOrganization, id, plainDate('2026-03-10'), 'Überweisung')).ok).toBe(true);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { payments: true },
    });

    expect(invoice.status).toBe('PAID');
    expect(invoice.paidTotalCents).toBe(11_900);
    // Restbetrag, nicht Gesamtbetrag — sonst entstünde eine Überzahlung.
    expect(invoice.payments).toHaveLength(2);
    expect(invoice.payments[1]?.amountCents).toBe(6_900);
  });

  it('meldet, wenn nichts mehr offen ist', async () => {
    const id = await issuedInvoice();
    await markAsFullyPaid(testOrganization, id, plainDate('2026-03-10'), null);

    const again = await markAsFullyPaid(testOrganization, id, plainDate('2026-03-11'), null);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error.kind).toBe('NOTHING_OUTSTANDING');
    }
  });

  it('korrigiert eine Zahlung und leitet den Status neu ab (FA-STAT-07)', async () => {
    const id = await issuedInvoice();
    await markAsFullyPaid(testOrganization, id, plainDate('2026-03-10'), null);

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: id } });
    await updatePayment(testOrganization, payment.id, {
      amountCents: cents(5_000),
      paidAt: plainDate('2026-03-10'),
      method: null,
      note: 'korrigiert',
    });

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.paidTotalCents).toBe(5_000);
  });

  it('nimmt eine Zahlung zurück und stellt den offenen Zustand wieder her', async () => {
    const id = await issuedInvoice();
    await markAsFullyPaid(testOrganization, id, plainDate('2026-03-10'), null);

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: id } });
    expect((await removePayment(testOrganization, payment.id)).ok).toBe(true);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.paidTotalCents).toBe(0);
  });

  it('nimmt auf einen Entwurf keine Zahlung entgegen', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(testOrganization, draft(customerId), ACTOR, null);

    const result = await addPayment(testOrganization, id, {
      amountCents: cents(100),
      paidAt: plainDate('2026-03-05'),
      method: null,
      note: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NOT_ISSUED');
    }
  });
});

describe('Storno (FA-STAT-08, -09, -10, A4)', () => {
  it('erzeugt ein Stornodokument mit eigener Nummer und Bezug', async () => {
    const id = await issuedInvoice();
    const result = await cancelInvoice(testOrganization, id, 'Falscher Leistungszeitraum', ACTOR, null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const creditNote = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.creditNoteId },
      include: { lines: true },
    });

    expect(creditNote.documentType).toBe('CREDIT_NOTE');
    expect(creditNote.invoiceNumber).toBe('RE-2026-0002');
    expect(creditNote.precedingInvoiceId).toBe(id);
    expect(creditNote.status).toBe('ISSUED');
    expect(creditNote.dueDate).toBeNull();
    // Positive Beträge: Die Richtung steckt im Belegtyp (EN 16931).
    expect(creditNote.grossTotalCents).toBe(11_900);
    expect(creditNote.lines).toHaveLength(1);
  });

  it('setzt das Original auf storniert und lässt es vollständig erhalten (FA-STAT-09)', async () => {
    const id = await issuedInvoice();
    await cancelInvoice(testOrganization, id, null, ACTOR, null);

    const original = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });

    expect(original.status).toBe('CANCELLED');
    expect(original.cancelledAt).not.toBeNull();
    expect(original.invoiceNumber).toBe('RE-2026-0001');
    expect(original.lines).toHaveLength(1);
    expect(original.grossTotalCents).toBe(11_900);
  });

  it('storniert auch eine bereits bezahlte Rechnung (FA-STAT-10)', async () => {
    const id = await issuedInvoice();
    await markAsFullyPaid(testOrganization, id, plainDate('2026-03-10'), null);

    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe('PAID');

    const result = await cancelInvoice(testOrganization, id, 'Rückzahlung erfolgt', ACTOR, null);
    expect(result.ok).toBe(true);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
  });

  it('lässt einen Nummernkreis ohne Lücke zurück (A4)', async () => {
    const id = await issuedInvoice();
    await cancelInvoice(testOrganization, id, null, ACTOR, null);

    const numbers = (
      await prisma.invoice.findMany({
        where: { invoiceNumber: { not: null } },
        orderBy: { invoiceNumber: 'asc' },
      })
    ).map((invoice) => invoice.invoiceNumber);

    expect(numbers).toEqual(['RE-2026-0001', 'RE-2026-0002']);
  });

  it('storniert weder Entwürfe noch Gutschriften noch doppelt', async () => {
    const customerId = await makeCustomer();
    const { id: draftId } = await createDraftInvoice(testOrganization, draft(customerId), ACTOR, null);
    expect((await cancelInvoice(testOrganization, draftId, null, ACTOR, null)).ok).toBe(false);

    const id = await issuedInvoice();
    const first = await cancelInvoice(testOrganization, id, null, ACTOR, null);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect((await cancelInvoice(testOrganization, id, null, ACTOR, null)).ok).toBe(false);
    expect((await cancelInvoice(testOrganization, first.creditNoteId, null, ACTOR, null)).ok).toBe(false);
  });

  it('nimmt auf eine Gutschrift keine Zahlung entgegen', async () => {
    const id = await issuedInvoice();
    const result = await cancelInvoice(testOrganization, id, null, ACTOR, null);
    if (!result.ok) return;

    const payment = await addPayment(testOrganization, result.creditNoteId, {
      amountCents: cents(100),
      paidAt: plainDate('2026-03-20'),
      method: null,
      note: null,
    });

    expect(payment.ok).toBe(false);
    if (!payment.ok) {
      expect(payment.error.kind).toBe('CREDIT_NOTE');
    }
  });
});

describe('Protokollierung (FA-STAT-11, NFA-COMP-01)', () => {
  it('hält jeden Schritt fest', async () => {
    const id = await issuedInvoice();
    await addPayment(testOrganization, id, {
      amountCents: cents(11_900),
      paidAt: plainDate('2026-03-10'),
      method: 'Überweisung',
      note: null,
    });
    await cancelInvoice(testOrganization, id, null, ACTOR, null);

    const actions = (
      await prisma.auditLog.findMany({
        where: { entityType: 'Invoice', entityId: id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((entry) => entry.action);

    expect(actions).toContain('CREATED');
    expect(actions).toContain('ISSUED');
    expect(actions).toContain('PAYMENT_RECORDED');
    expect(actions).toContain('PAID');
    expect(actions).toContain('CANCELLED');
  });
});

describe('Domain-Ereignisse (NFA-ARCH-08)', () => {
  it('lässt sich um einen weiteren Handler ergänzen, ohne die Kernlogik zu ändern', async () => {
    const seen: InvoiceEvent[] = [];
    const unregister = registerInvoiceEventHandler((event) => {
      seen.push(event);
    });

    try {
      const id = await issuedInvoice();
      await markAsFullyPaid(testOrganization, id, plainDate('2026-03-10'), null);
      await cancelInvoice(testOrganization, id, null, ACTOR, null);

      expect(seen.map((event) => event.type)).toEqual([
        'InvoiceIssued',
        'InvoicePaymentRecorded',
        'InvoicePaid',
        'InvoiceCancelled',
      ]);
    } finally {
      unregister();
    }
  });

  it('lässt einen fehlschlagenden Handler den Vorgang nicht kippen', async () => {
    const unregister = registerInvoiceEventHandler(() => {
      throw new Error('Handler kaputt');
    });

    try {
      await expect(
        dispatchInvoiceEvent(testOrganization, {
          type: 'InvoicePaid',
          invoiceId: 'x',
          grossTotalCents: cents(100),
        }),
      ).resolves.toBeUndefined();
    } finally {
      unregister();
    }
  });
});

describe('Liste und Filter (FA-RECH-15, -16; FA-STAT-02)', () => {
  it('filtert nach Status, Kunde und Zeitraum', async () => {
    const customerA = await makeCustomer();
    const customerB = await makeCustomer({ companyName: 'Zweiter Kunde' });

    const { id: issuedId } = await createDraftInvoice(testOrganization, draft(customerA), ACTOR, null);
    await issueInvoice(testOrganization, issuedId, ACTOR, null);
    await createDraftInvoice(testOrganization, draft(customerB, { issueDate: '2026-05-01' }), ACTOR, null);

    expect(await listInvoices(testOrganization, { status: 'ISSUED' })).toHaveLength(1);
    expect(await listInvoices(testOrganization, { status: 'DRAFT' })).toHaveLength(1);
    expect(await listInvoices(testOrganization, { customerId: customerB })).toHaveLength(1);
    expect(await listInvoices(testOrganization, { from: '2026-04-01' })).toHaveLength(1);
    expect(await listInvoices(testOrganization, { to: '2026-03-31' })).toHaveLength(1);
    expect(await listInvoices(testOrganization)).toHaveLength(2);
  });

  it('findet über Nummer, Kundenname und Positionsbezeichnung', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(testOrganization, draft(customerId), ACTOR, null);
    await issueInvoice(testOrganization, id, ACTOR, null);

    expect(await listInvoices(testOrganization, { search: 'RE-2026-0001' })).toHaveLength(1);
    expect(await listInvoices(testOrganization, { search: 'Beispiel' })).toHaveLength(1);
    expect(await listInvoices(testOrganization, { search: 'Beratung' })).toHaveLength(1);
    expect(await listInvoices(testOrganization, { search: 'gibtesnicht' })).toHaveLength(0);
  });

  it('leitet Überfälligkeit ab, statt sie zu speichern (FA-STAT-02)', async () => {
    const customerId = await makeCustomer();
    const { id } = await createDraftInvoice(testOrganization, 
      draft(customerId, { dueDate: '2026-03-10' }),
      ACTOR,
      null,
    );
    await issueInvoice(testOrganization, id, ACTOR, null);

    const before = await listInvoices(testOrganization, {}, new Date('2026-03-09T12:00:00Z'));
    expect(before[0]?.isOverdue).toBe(false);

    const after = await listInvoices(testOrganization, {}, new Date('2026-03-11T12:00:00Z'));
    expect(after[0]?.isOverdue).toBe(true);

    // Der Filter „überfällig" nutzt dieselbe Ableitung.
    expect(await listInvoices(testOrganization, { status: 'OVERDUE' }, new Date('2026-03-11T12:00:00Z'))).toHaveLength(
      1,
    );
    expect(await listInvoices(testOrganization, { status: 'OVERDUE' }, new Date('2026-03-09T12:00:00Z'))).toHaveLength(
      0,
    );
  });

  it('sortiert nach Betrag und Nummer', async () => {
    const customerId = await makeCustomer();

    for (const price of [5_000, 20_000, 10_000]) {
      const { id } = await createDraftInvoice(testOrganization, 
        draft(customerId, {
          lines: [
            {
              position: 1,
              name: 'Position',
              description: null,
              quantityScaled: 10_000,
              unitCode: 'C62',
              unitPriceCents: price,
              taxRateBasisPoints: 1_900,
              taxCategory: 'S',
              discountBasisPoints: 0,
            },
          ],
        }),
        ACTOR,
        null,
      );
      await issueInvoice(testOrganization, id, ACTOR, null);
    }

    const byGross = await listInvoices(testOrganization, { sort: 'gross', direction: 'asc' });
    expect(byGross.map((entry) => entry.grossTotalCents)).toEqual([5_950, 11_900, 23_800]);

    const byNumber = await listInvoices(testOrganization, { sort: 'number', direction: 'asc' });
    expect(byNumber.map((entry) => entry.invoiceNumber)).toEqual([
      'RE-2026-0001',
      'RE-2026-0002',
      'RE-2026-0003',
    ]);
  });
});
