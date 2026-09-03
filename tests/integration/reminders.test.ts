/**
 * Mahnwesen von Ende zu Ende (M15 — FA-MAHN-01 bis -07).
 *
 * Geprüft werden die Zusagen, die still brechen können:
 *
 * - Eine Mahnung friert die Beträge ein. Zahlt der Kunde danach, ändert das den
 *   verschickten Brief nicht — die Zeile ist unveränderlich.
 * - Die Stufen zählen hoch und enden nach der dritten.
 * - Der Nummernkreis der Mahnungen ist **getrennt** von dem der Belege. Zählte
 *   eine Mahnung dort mit, entstünde in der Rechnungsfolge eine Lücke, die
 *   niemand erklären kann (FA-NUM-05).
 * - Das PDF entsteht einmal und liegt danach als Artefakt vor.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_COMPANY_PROFILE, saveCompanyProfile } from '@/application/company/company-profile';
import { createCustomer, type CustomerData } from '@/application/customers/customer-service';
import { cancelInvoice } from '@/application/invoices/cancel-invoice';
import { createDraftInvoice, type DraftInvoiceData } from '@/application/invoices/invoice-service';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { addPayment } from '@/application/invoices/payments';
import { createInvoiceReminder } from '@/application/reminders/create-reminder';
import { getRemindersForInvoice } from '@/application/reminders/reminder-queries';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';

import { customerBuyer } from '../support/buyer';

import { DATA_DATABASE_URL, resetDatabase, TEST_ACTOR_ID } from './setup/database';
import { testOrganization } from './setup/organization';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });
const ACTOR = TEST_ACTOR_ID;

/** Der Bezugstag: lange nach der Fälligkeit des Belegs. */
const NOW = new Date('2026-04-15T09:00:00Z');

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
  await prisma.$disconnect();
  await resetDatabase();
  await prisma.$disconnect();

  await saveCompanyProfile(
    testOrganization,
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

async function issuedInvoice(overrides: Partial<DraftInvoiceData> = {}): Promise<string> {
  const customer = await createCustomer(testOrganization, CUSTOMER, ACTOR, null);
  const { id } = await createDraftInvoice(
    testOrganization,
    draft(customer.id, overrides),
    ACTOR,
    null,
  );
  const result = await issueInvoice(testOrganization, id, ACTOR, null);
  expect(result.ok, 'Der Beleg sollte festschreibbar sein').toBe(true);
  return id;
}

describe('FA-MAHN-01 Eine Mahnung entsteht', () => {
  it('trägt Nummer, Stufe, eingefrorene Beträge und ein PDF', async () => {
    const invoiceId = await issuedInvoice();

    const result = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { reminder } = result.value;
    expect(reminder.level).toBe(1);
    expect(reminder.number).toMatch(/^MA-2026-\d{4}$/u);
    // Eine Stunde zu 100,00 EUR plus 19 % = 119,00 EUR, nichts gezahlt.
    // (`quantityScaled: 10_000` ist die Menge **1** — Skala 10^4.)
    expect(reminder.outstandingCents).toBe(11_900);
    // Stufe 1 kostet nichts — die Voreinstellung der Firmendaten.
    expect(reminder.feeCents).toBe(0);
    expect(reminder.totalCents).toBe(11_900);
    expect(reminder.issueDate).toBe('2026-04-15');
    // Sieben Tage neue Frist, ab dem Tag der Mahnung.
    expect(reminder.dueDate).toBe('2026-04-22');

    expect(result.value.pdfCreated).toBe(true);
    const artifact = await prisma.reminderArtifact.findFirstOrThrow({
      where: { reminderId: reminder.id },
    });
    expect(artifact.byteSize).toBeGreaterThan(1_000);
    expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(artifact.fileName).toBe(`${reminder.number}.pdf`);
  }, 60_000);

  it('zählt in einem eigenen Nummernkreis, ohne die Belegfolge zu stören', async () => {
    /*
     * Der Nummernkreis der Rechnungen muss lückenlos sein (FA-NUM-05). Zählte
     * eine Mahnung darin mit, entstünde eine Lücke, die niemand erklären kann.
     */
    const invoiceId = await issuedInvoice();
    await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);

    const scopes = await prisma.numberSequence.findMany({ orderBy: { scope: 'asc' } });
    const namen = scopes.map((entry) => entry.scope);

    expect(namen.some((name) => name.startsWith('INVOICE'))).toBe(true);
    expect(namen.some((name) => name.startsWith('REMINDER'))).toBe(true);

    const nächsterBeleg = await issuedInvoice();
    const beleg = await prisma.invoice.findUniqueOrThrow({ where: { id: nächsterBeleg } });
    // Die zweite Rechnung trägt die zweite Belegnummer — die Mahnung dazwischen
    // hat den Zähler nicht angefasst.
    expect(beleg.invoiceNumber).toMatch(/0002$/u);
  }, 60_000);

  it('friert die Beträge ein — eine spätere Zahlung ändert die Mahnung nicht', async () => {
    const invoiceId = await issuedInvoice();
    const result = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await addPayment(
      testOrganization,
      invoiceId,
      { amountCents: cents(1_900), paidAt: plainDate('2026-04-16'), method: null, note: null },
      ACTOR,
      null,
    );

    const unverändert = await prisma.reminder.findUniqueOrThrow({
      where: { id: result.value.reminder.id },
    });
    expect(unverändert.outstandingCents).toBe(11_900);
  }, 60_000);

  it('lässt sich nicht ändern und nicht löschen', async () => {
    const invoiceId = await issuedInvoice();
    const result = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Wie im Bestand ohne Meldungsmuster: Prisma verpackt den Trigger-Text.
    // Die Gegenprobe steht darunter — abgewiesen **und** unverändert.
    await expect(
      prisma.reminder.update({
        where: { id: result.value.reminder.id },
        data: { totalCents: 1 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.reminder.delete({ where: { id: result.value.reminder.id } }),
    ).rejects.toThrow();

    const unverändert = await prisma.reminder.findUniqueOrThrow({
      where: { id: result.value.reminder.id },
    });
    expect(unverändert.totalCents).toBe(result.value.reminder.totalCents);
  }, 60_000);
});

describe('FA-MAHN-02 Die Stufen', () => {
  it('zählt hoch und endet nach der dritten', async () => {
    const invoiceId = await issuedInvoice();

    const erste = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);
    const zweite = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);
    const dritte = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);

    expect(erste.ok && erste.value.reminder.level).toBe(1);
    expect(zweite.ok && zweite.value.reminder.level).toBe(2);
    expect(dritte.ok && dritte.value.reminder.level).toBe(3);

    // Die Gebühren steigen mit der Stufe — 0 / 5 / 10 EUR aus den Firmendaten.
    expect(zweite.ok && zweite.value.reminder.feeCents).toBe(500);
    expect(dritte.ok && dritte.value.reminder.totalCents).toBe(12_900);

    const vierte = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);
    expect(vierte.ok).toBe(false);
    if (vierte.ok) return;
    expect(vierte.error).toEqual({
      kind: 'REFUSED',
      refusal: { kind: 'LAST_LEVEL_REACHED' },
    });
  }, 120_000);
});

describe('FA-MAHN-01 Was nicht gemahnt wird', () => {
  it('weist einen Entwurf ab', async () => {
    const customer = await createCustomer(testOrganization, CUSTOMER, ACTOR, null);
    const { id } = await createDraftInvoice(testOrganization, draft(customer.id), ACTOR, null);

    const result = await createInvoiceReminder(testOrganization, id, ACTOR, null, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: 'REFUSED', refusal: { kind: 'NOT_ISSUED' } });
  }, 60_000);

  it('weist einen bezahlten Beleg ab', async () => {
    const invoiceId = await issuedInvoice();
    await addPayment(
      testOrganization,
      invoiceId,
      { amountCents: cents(11_900), paidAt: plainDate('2026-03-10'), method: null, note: null },
      ACTOR,
      null,
    );

    const result = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      kind: 'REFUSED',
      refusal: { kind: 'NOTHING_OUTSTANDING' },
    });
  }, 60_000);

  it('weist einen noch nicht fälligen Beleg ab', async () => {
    const invoiceId = await issuedInvoice();

    // Bezugstag vor der Fälligkeit am 15. März.
    const result = await createInvoiceReminder(
      testOrganization,
      invoiceId,
      ACTOR,
      null,
      new Date('2026-03-10T09:00:00Z'),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: 'REFUSED', refusal: { kind: 'NOT_OVERDUE' } });
  }, 60_000);

  it('weist einen stornierten Beleg und die Gutschrift dazu ab', async () => {
    const invoiceId = await issuedInvoice();
    const storno = await cancelInvoice(testOrganization, invoiceId, 'Irrtum', ACTOR, null);
    expect(storno.ok).toBe(true);
    if (!storno.ok) return;

    const original = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);
    expect(original.ok).toBe(false);
    if (original.ok) return;
    expect(original.error).toEqual({ kind: 'REFUSED', refusal: { kind: 'CANCELLED' } });

    // Und die Gutschrift selbst fordert nichts ein.
    const gutschrift = await createInvoiceReminder(
      testOrganization,
      storno.creditNoteId,
      ACTOR,
      null,
      NOW,
    );
    expect(gutschrift.ok).toBe(false);
    if (gutschrift.ok) return;
    expect(gutschrift.error).toEqual({
      kind: 'REFUSED',
      refusal: { kind: 'NOT_AN_INVOICE' },
    });
  }, 60_000);
});

describe('NFA-COMP-01 Der Vorgang steht im Protokoll', () => {
  it('nennt Akteur, Stufe und Nummer', async () => {
    const invoiceId = await issuedInvoice();
    const result = await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const eintrag = await prisma.auditLog.findFirstOrThrow({ where: { action: 'REMINDED' } });

    expect(eintrag.actorId).toBe(ACTOR);
    expect(eintrag.entityType).toBe('Reminder');
    expect(eintrag.entityId).toBe(result.value.reminder.id);
    expect(eintrag.diffJson ?? '').toContain(result.value.reminder.number);
  }, 60_000);

  it('führt die Mahnungen am Beleg auf', async () => {
    const invoiceId = await issuedInvoice();
    await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);
    await createInvoiceReminder(testOrganization, invoiceId, ACTOR, null, NOW);

    const liste = await getRemindersForInvoice(testOrganization, invoiceId);

    expect(liste.map((entry) => entry.level)).toEqual([1, 2]);
  }, 60_000);
});
