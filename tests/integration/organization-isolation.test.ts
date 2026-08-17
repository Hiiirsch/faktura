/**
 * Mandantentrennung (M5.5a).
 *
 * Der Nachweis, dass der Organisationskontext nicht nur mitgeführt, sondern
 * auch gewirkt hat: Zwei Organisationen mit vollständigen Datenbeständen, und
 * aus dem Kontext der einen ist von der anderen nichts zu sehen, nichts zu
 * ändern und nichts zu löschen.
 *
 * Geprüft wird an der Anwendungsschicht, nicht an der Repository-Schicht: Der
 * Fehler, den dieser Test finden soll, ist ein vergessener Filter irgendwo auf
 * dem Weg — und der zeigt sich erst, wenn der ganze Weg läuft.
 *
 * Zusätzlich die Zusagen, die erst mit zwei Organisationen prüfbar werden:
 * beide dürfen dieselbe Kunden- und Rechnungsnummer führen, und der
 * Nummernkreis der zweiten beginnt bei eins statt im Kreis der ersten
 * fortzuzählen (FA-NUM-02, FA-KUND-02).
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { listCatalogItems, createCatalogItem } from '@/application/catalog/catalog-service';
import {
  EMPTY_COMPANY_PROFILE,
  getCompanyProfile,
  saveCompanyProfile,
} from '@/application/company/company-profile';
import {
  createCustomer,
  type CustomerData,
  getCustomer,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
} from '@/application/customers/customer-service';
import { buildInvoiceDocument } from '@/application/documents/build-invoice-document';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { listInvoiceSequences } from '@/application/invoices/invoice-numbering';
import {
  createDraftInvoice,
  deleteDraftInvoice,
  duplicateInvoice,
  updateDraftInvoice,
} from '@/application/invoices/invoice-service';
import { listInvoices, loadInvoiceDetail } from '@/application/invoices/invoice-queries';
import { addPayment, listPayments } from '@/application/invoices/payments';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';
import { fullyAuthorized } from '@/application/auth/authorize';
import { organizationContextOf } from '@/infrastructure/repositories/organization-context';

import { customerBuyer } from '../support/buyer';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';
import { testOrganization } from './setup/organization';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const ACTOR = 'pruef-akteur';

/** Die zweite Organisation entsteht in jedem Test neu. */
const SECOND_ORGANIZATION_ID = 'org_zweite';
const second = fullyAuthorized(organizationContextOf(SECOND_ORGANIZATION_ID));

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

const COMPANY = {
  ...EMPTY_COMPANY_PROFILE,
  legalName: 'Musterbetrieb',
  addressLine1: 'Hauptstr. 1',
  postalCode: '89518',
  city: 'Heidenheim',
  taxNumber: '12/345/67890',
};

beforeEach(async () => {
  await resetDatabase();
  await prisma.organization.create({
    data: { id: SECOND_ORGANIZATION_ID, name: 'Zweite Organisation' },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Legt in einer Organisation einen vollständigen Datenbestand an: Firmenprofil,
 * Kunde, Katalogeintrag und einen festgeschriebenen Beleg mit Zahlung.
 */
async function seed(organization: typeof testOrganization, marker: string) {
  await saveCompanyProfile(
    organization,
    { ...COMPANY, legalName: `Betrieb ${marker}` },
    ACTOR,
    null,
  );

  const customer = await createCustomer(
    organization,
    { ...CUSTOMER, companyName: `Kunde ${marker}` },
    ACTOR,
    null,
  );

  const item = await createCatalogItem(
    organization,
    {
      name: `Leistung ${marker}`,
      description: null,
      unitPriceCents: cents(10_000),
      unitCode: 'C62',
      taxRateBasisPoints: 1_900,
    },
    ACTOR,
    null,
  );

  const draft = await createDraftInvoice(
    organization,
    {
      buyer: customerBuyer(customer.id),
      taxScheme: 'STANDARD',
      currency: 'EUR',
      issueDate: '2026-03-01',
      serviceDateFrom: '2026-02-01',
      serviceDateTo: null,
      dueDate: '2026-03-15',
      introText: `Beleg ${marker}`,
      outroText: null,
      purchaseOrderRef: null,
      templateId: null,
      lines: [
        {
          position: 1,
          name: `Leistung ${marker}`,
          description: null,
          quantityScaled: 10_000,
          unitCode: 'C62',
          unitPriceCents: 10_000,
          taxRateBasisPoints: 1_900,
          taxCategory: 'S',
          discountBasisPoints: 0,
        },
      ],
    },
    ACTOR,
    null,
  );

  const issued = await issueInvoice(organization, draft.id, ACTOR, null);
  expect(issued.ok).toBe(true);

  await addPayment(organization, draft.id, {
    amountCents: cents(1_000),
    paidAt: plainDate('2026-03-05'),
    method: null,
    note: null,
  });

  return { customerId: customer.id, catalogItemId: item.id, invoiceId: draft.id };
}

describe('Lesen bleibt auf die eigene Organisation beschränkt', () => {
  it('zeigt weder Kunden noch Katalog noch Belege der anderen', async () => {
    const a = await seed(testOrganization, 'A');
    const b = await seed(second, 'B');

    const customersOfA = await listCustomers(testOrganization, { includeArchived: true });
    expect(customersOfA).toHaveLength(1);
    expect(customersOfA[0]?.companyName).toBe('Kunde A');
    expect(customersOfA.map((customer) => customer.id)).not.toContain(b.customerId);

    const catalogOfA = await listCatalogItems(testOrganization, true);
    expect(catalogOfA.map((entry) => entry.id)).toEqual([a.catalogItemId]);

    const invoicesOfA = await listInvoices(testOrganization);
    expect(invoicesOfA.map((invoice) => invoice.id)).toEqual([a.invoiceId]);
  });

  it('findet einen fremden Datensatz auch bei bekannter Kennung nicht', async () => {
    await seed(testOrganization, 'A');
    const b = await seed(second, 'B');

    expect(await getCustomer(testOrganization, b.customerId)).toBeNull();
    expect(await loadInvoiceDetail(testOrganization, b.invoiceId)).toBeNull();
    expect(await listPayments(testOrganization, b.invoiceId)).toEqual([]);
  });

  it('baut kein Dokument aus einem fremden Beleg', async () => {
    await seed(testOrganization, 'A');
    const b = await seed(second, 'B');

    const result = await buildInvoiceDocument(testOrganization, b.invoiceId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NOT_FOUND');
  });

  it('liefert je Organisation ein eigenes Firmenprofil', async () => {
    await seed(testOrganization, 'A');
    await seed(second, 'B');

    expect((await getCompanyProfile(testOrganization))?.legalName).toBe('Betrieb A');
    expect((await getCompanyProfile(second))?.legalName).toBe('Betrieb B');
  });
});

describe('Schreiben greift nicht auf fremde Datensätze durch', () => {
  it('ändert einen fremden Kunden nicht', async () => {
    await seed(testOrganization, 'A');
    const b = await seed(second, 'B');

    const result = await updateCustomer(
      testOrganization,
      b.customerId,
      { ...CUSTOMER, companyName: 'Übernommen' },
      ACTOR,
      null,
    );
    expect(result).toBeNull();

    expect((await getCustomer(second, b.customerId))?.companyName).toBe('Kunde B');
  });

  it('archiviert einen fremden Kunden nicht', async () => {
    await seed(testOrganization, 'A');
    const b = await seed(second, 'B');

    expect(await setCustomerArchived(testOrganization, b.customerId, true, ACTOR, null)).toBeNull();
    expect((await getCustomer(second, b.customerId))?.isArchived).toBe(false);
  });

  it('löscht, dupliziert und ändert einen fremden Entwurf nicht', async () => {
    await seed(testOrganization, 'A');
    const b = await seed(second, 'B');

    const draftOfB = await createDraftInvoice(
      second,
      {
        buyer: customerBuyer(b.customerId),
        taxScheme: 'STANDARD',
        currency: 'EUR',
        issueDate: '2026-03-02',
        serviceDateFrom: null,
        serviceDateTo: null,
        dueDate: '2026-03-16',
        introText: null,
        outroText: null,
        purchaseOrderRef: null,
      templateId: null,
                lines: [],
      },
      ACTOR,
      null,
    );

    const deleted = await deleteDraftInvoice(testOrganization, draftOfB.id, ACTOR, null);
    expect(deleted.ok).toBe(false);

    const duplicated = await duplicateInvoice(testOrganization, draftOfB.id, ACTOR, null);
    expect(duplicated.ok).toBe(false);

    const updated = await updateDraftInvoice(
      testOrganization,
      draftOfB.id,
      {
        buyer: customerBuyer(b.customerId),
        taxScheme: 'STANDARD',
        currency: 'EUR',
        issueDate: '2026-03-02',
        serviceDateFrom: null,
        serviceDateTo: null,
        dueDate: '2026-03-16',
        introText: 'Fremdzugriff',
        outroText: null,
        purchaseOrderRef: null,
      templateId: null,
                lines: [],
      },
      ACTOR,
      null,
    );
    expect(updated.ok).toBe(false);

    // Der Entwurf steht unverändert da.
    const stillThere = await loadInvoiceDetail(second, draftOfB.id);
    expect(stillThere?.introText).toBeNull();
  });

  it('schreibt keinen fremden Beleg fest und bucht keine Zahlung darauf', async () => {
    await seed(testOrganization, 'A');
    const b = await seed(second, 'B');

    const draftOfB = await createDraftInvoice(
      second,
      {
        buyer: customerBuyer(b.customerId),
        taxScheme: 'STANDARD',
        currency: 'EUR',
        issueDate: '2026-03-03',
        serviceDateFrom: null,
        serviceDateTo: null,
        dueDate: '2026-03-17',
        introText: null,
        outroText: null,
        purchaseOrderRef: null,
      templateId: null,
                lines: [
          {
            position: 1,
            name: 'Leistung',
            description: null,
            quantityScaled: 10_000,
            unitCode: 'C62',
            unitPriceCents: 5_000,
            taxRateBasisPoints: 1_900,
            taxCategory: 'S',
            discountBasisPoints: 0,
          },
        ],
      },
      ACTOR,
      null,
    );

    const issued = await issueInvoice(testOrganization, draftOfB.id, ACTOR, null);
    expect(issued.ok).toBe(false);
    if (issued.ok) return;
    expect(issued.error.kind).toBe('NOT_FOUND');

    const payment = await addPayment(testOrganization, b.invoiceId, {
      amountCents: cents(500),
      paidAt: plainDate('2026-03-06'),
      method: null,
      note: null,
    });
    expect(payment.ok).toBe(false);
    if (payment.ok) return;
    expect(payment.error.kind).toBe('NOT_FOUND');

    expect(await listPayments(second, b.invoiceId)).toHaveLength(1);
  });
});

describe('Nummernkreise gelten je Organisation', () => {
  it('vergibt beiden dieselbe Kunden- und Rechnungsnummer (FA-KUND-02, FA-NUM-02)', async () => {
    const a = await seed(testOrganization, 'A');
    const b = await seed(second, 'B');

    const customerA = await getCustomer(testOrganization, a.customerId);
    const customerB = await getCustomer(second, b.customerId);
    expect(customerA?.customerNumber).toBe(customerB?.customerNumber);

    const invoiceA = await loadInvoiceDetail(testOrganization, a.invoiceId);
    const invoiceB = await loadInvoiceDetail(second, b.invoiceId);
    expect(invoiceA?.invoiceNumber).toBe(invoiceB?.invoiceNumber);
    expect(invoiceA?.invoiceNumber).not.toBeNull();
  });

  it('beginnt den Zähler der zweiten Organisation bei eins', async () => {
    // Drei Belege in A, danach der erste in B.
    await seed(testOrganization, 'A1');
    const sequencesOfA = await listInvoiceSequences(testOrganization);
    expect(sequencesOfA[0]?.lastValue).toBe(1);

    await seed(second, 'B1');
    const sequencesOfB = await listInvoiceSequences(second);
    expect(sequencesOfB).toHaveLength(1);
    expect(sequencesOfB[0]?.lastValue).toBe(1);
  });
});

describe('Die Datenbank weist Verweise über die Mandantengrenze ab', () => {
  it('lässt keine Rechnung auf einen fremden Kunden zeigen', async () => {
    await seed(testOrganization, 'A');
    const b = await seed(second, 'B');

    await expect(
      prisma.invoice.create({
        data: {
          organizationId: testOrganization.organizationId,
          customerId: b.customerId,
          documentType: 'INVOICE',
          status: 'DRAFT',
        },
      }),
    ).rejects.toThrow();
  });

  it('lässt keine Position mit fremder Organisation an einem Beleg zu', async () => {
    const a = await seed(testOrganization, 'A');
    await seed(second, 'B');

    await expect(
      prisma.invoiceLine.create({
        data: {
          organizationId: SECOND_ORGANIZATION_ID,
          invoiceId: a.invoiceId,
          position: 99,
          name: 'Eingeschmuggelt',
          quantityScaled: 10_000,
          unitCode: 'C62',
          unitPriceCents: 100,
          taxRateBasisPoints: 1_900,
          taxCategory: 'S',
          discountBasisPoints: 0,
          lineNetCents: 100,
        },
      }),
    ).rejects.toThrow();
  });

  it('lässt keine Zahlung mit fremder Organisation an einem Beleg zu', async () => {
    const a = await seed(testOrganization, 'A');
    await seed(second, 'B');

    await expect(
      prisma.payment.create({
        data: {
          organizationId: SECOND_ORGANIZATION_ID,
          invoiceId: a.invoiceId,
          amountCents: 100,
          paidAt: '2026-03-07',
        },
      }),
    ).rejects.toThrow();
  });
});
