/**
 * Empfänger ohne Kundendatensatz (M5.7 — FA-RECH-02, FA-RECH-12, FA-PFL-01,
 * FA-NUM-08).
 *
 * Ein Beleg richtet sich an jemanden, aber nicht jeder Empfänger gehört in die
 * Stammdaten. Geprüft wird deshalb nicht nur, dass ein freier Empfänger
 * *angelegt* werden kann, sondern dass er den ganzen Weg trägt: durch die
 * Vollständigkeitsprüfung, ins eingefrorene Dokument, in die Liste und in die
 * Suche.
 *
 * Dazu die beiden Zusagen, die durch die Lockerung gefährdet wären: Der
 * Organisationstrigger greift auch dann noch, wenn `customerId` NULL ist — er
 * hing zuvor an SQLites NULL-Semantik und fiele sonst still weg. Und der
 * Empfänger eines festgeschriebenen Belegs bleibt unveränderlich, gleich aus
 * welcher Quelle er stammt.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EMPTY_COMPANY_PROFILE,
  saveCompanyProfile,
} from '@/application/company/company-profile';
import { buildInvoiceDocument } from '@/application/documents/build-invoice-document';
import { ensureDefaultTemplate, templateSourceOf } from '@/application/documents/render-invoice';
import { issueInvoice, type IssueResult } from '@/application/invoices/issue-invoice';
import {
  createDraftInvoice,
  type DraftInvoiceData,
  updateDraftInvoice,
} from '@/application/invoices/invoice-service';
import { listInvoices, loadInvoiceDetail } from '@/application/invoices/invoice-queries';
import { type DraftBuyer, EMPTY_BUYER_FIELDS } from '@/domain/invoice/buyer';
import { defaultPipeline } from '@/infrastructure/rendering/pipeline';
import { organizationContextOf } from '@/infrastructure/repositories/organization-context';

import { customerBuyer, fieldsBuyer, freeBuyer } from '../support/buyer';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';
import { testOrganization as org } from './setup/organization';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const ACTOR = 'pruef-akteur';

const COMPANY = {
  ...EMPTY_COMPANY_PROFILE,
  legalName: 'Musterbetrieb Tim',
  addressLine1: 'Hauptstr. 1',
  postalCode: '89518',
  city: 'Heidenheim',
  countryCode: 'DE',
  taxNumber: '12/345/67890',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  bankAccountHolder: 'Tim Musterbetrieb',
};

const FIELDS = {
  name: 'Stadtverwaltung Heidenheim',
  addressLine1: 'Grabenstraße 15',
  postalCode: '89522',
  city: 'Heidenheim an der Brenz',
  countryCode: 'DE',
};

const FREE_TEXT = [
  'Landratsamt Heidenheim',
  'Amt für Vermessung',
  'Sachgebiet Liegenschaften',
  'Felsenstraße 36',
  '89518 Heidenheim',
].join('\n');

beforeEach(async () => {
  await resetDatabase();
  await saveCompanyProfile(org, COMPANY, ACTOR, null);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function draft(buyer: DraftBuyer, overrides: Partial<DraftInvoiceData> = {}): DraftInvoiceData {
  return {
    buyer,
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
        unitPriceCents: 9_500,
        taxRateBasisPoints: 1_900,
        taxCategory: 'S',
        discountBasisPoints: 0,
      },
    ],
    ...overrides,
  };
}

/**
 * Der Satz des Belegs, wie ihn der Renderer erhält — ohne den Schritt durch
 * Chromium. Am PDF selbst ist der Text nicht prüfbar; die Begründung steht im
 * Kopf von `document-output.test.ts`.
 */
async function documentHtmlOf(invoiceId: string): Promise<string> {
  const built = await buildInvoiceDocument(org, invoiceId);
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('kein Dokument');

  const source = await templateSourceOf(await ensureDefaultTemplate(org));
  const rendered = await defaultPipeline.templateEngine.render(built.document, source);

  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error('Vorlage nicht verarbeitbar');
  return rendered.html;
}

/** Die Verstöße einer abgewiesenen Festschreibung. */
function violationKinds(result: IssueResult): readonly string[] {
  if (result.ok || result.error.kind !== 'INCOMPLETE') {
    return [];
  }
  return result.error.violations.map((violation) => violation.kind);
}

/** Vergleicht ohne Rücksicht auf Umbrüche und Einrückung des Vorlagensatzes. */
function shows(html: string, text: string): boolean {
  const flat = (value: string): string => value.replace(/\s+/gu, ' ').trim();
  return flat(html).includes(flat(text));
}

describe('FA-RECH-02 Empfänger am Beleg', () => {
  it('legt einen Beleg mit Empfängerfeldern an und schreibt ihn fest', async () => {
    const created = await createDraftInvoice(org, draft(fieldsBuyer(FIELDS)), ACTOR, null);
    const issued = await issueInvoice(org, created.id, ACTOR, null);

    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const detail = await loadInvoiceDetail(org, created.id);
    expect(detail?.customerId).toBeNull();
    expect(detail?.buyerSnapshot).not.toBeNull();
  });

  it('trägt den freien Anschriftenblock Zeile für Zeile in den Beleg', async () => {
    const created = await createDraftInvoice(org, draft(freeBuyer(FREE_TEXT)), ACTOR, null);

    const built = await buildInvoiceDocument(org, created.id);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.document.buyer.addressBlock).toEqual([
      'Landratsamt Heidenheim',
      'Amt für Vermessung',
      'Sachgebiet Liegenschaften',
      'Felsenstraße 36',
      '89518 Heidenheim',
    ]);
    // Der Name für Liste und Dateiname ist die erste Zeile — er wird nicht
    // zusätzlich gespeichert, sondern gelesen.
    expect(built.document.buyer.name).toBe('Landratsamt Heidenheim');

    const html = await documentHtmlOf(created.id);

    for (const line of FREE_TEXT.split('\n')) {
      expect(shows(html, line)).toBe(true);
    }
    // Ohne Kundendatensatz erscheint keine leere Kundennummernzeile.
    expect(shows(html, 'Kundennummer')).toBe(false);
  });

  it('findet freie Empfänger über die Suche', async () => {
    await createDraftInvoice(org, draft(fieldsBuyer(FIELDS)), ACTOR, null);
    await createDraftInvoice(org, draft(freeBuyer(FREE_TEXT)), ACTOR, null);

    const byFieldName = await listInvoices(org, { search: 'Stadtverwaltung' });
    expect(byFieldName).toHaveLength(1);
    expect(byFieldName[0]?.customerName).toBe('Stadtverwaltung Heidenheim');

    const byBlock = await listInvoices(org, { search: 'Vermessung' });
    expect(byBlock).toHaveLength(1);
    expect(byBlock[0]?.customerName).toBe('Landratsamt Heidenheim');
  });
});

describe('FA-PFL-01 Name und Anschrift bleiben Pflicht', () => {
  it('weist einen Beleg ohne jeden Empfänger ab', async () => {
    const created = await createDraftInvoice(
      org,
      draft({ mode: 'FIELDS', customerId: null, fields: EMPTY_BUYER_FIELDS, freeText: null }),
      ACTOR,
      null,
    );
    const issued = await issueInvoice(org, created.id, ACTOR, null);

    expect(issued.ok).toBe(false);
    expect(violationKinds(issued)).toContain('NO_BUYER');
  });

  it('weist Empfängerfelder ohne Anschrift ab', async () => {
    const created = await createDraftInvoice(
      org,
      draft(fieldsBuyer({ name: 'Nur ein Name' })),
      ACTOR,
      null,
    );
    const issued = await issueInvoice(org, created.id, ACTOR, null);

    expect(issued.ok).toBe(false);
    expect(violationKinds(issued)).toContain('NO_BUYER_ADDRESS');
  });

  it('weist einen freien Block aus einer einzigen Zeile ab', async () => {
    const created = await createDraftInvoice(org, draft(freeBuyer('Landratsamt')), ACTOR, null);
    const issued = await issueInvoice(org, created.id, ACTOR, null);

    expect(issued.ok).toBe(false);
    expect(violationKinds(issued)).toContain('NO_BUYER_ADDRESS');
  });
});

describe('FA-NUM-08 Empfänger nach dem Festschreiben', () => {
  it('lässt den Empfänger eines festgeschriebenen Belegs nicht mehr ändern', async () => {
    const created = await createDraftInvoice(org, draft(freeBuyer(FREE_TEXT)), ACTOR, null);
    const issued = await issueInvoice(org, created.id, ACTOR, null);
    expect(issued.ok).toBe(true);

    // Über die Anwendungsschicht: Ein festgeschriebener Beleg ist kein Entwurf.
    const updated = await updateDraftInvoice(
      org,
      created.id,
      draft(freeBuyer('Jemand anders\nAndere Straße 2\n12345 Anderswo')),
      ACTOR,
      null,
    );
    expect(updated.ok).toBe(false);

    // Und am Datenbanktrigger, der auch ohne Prisma greift.
    await expect(
      prisma.invoice.update({
        where: { id: created.id },
        data: { buyerFreeText: 'Jemand anders\nAndere Straße 2' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.invoice.update({ where: { id: created.id }, data: { buyerMode: 'FIELDS' } }),
    ).rejects.toThrow();
  });
});

describe('Mandantengrenze bei fehlendem Kunden', () => {
  it('weist eine fremde Vorlage auch dann ab, wenn kein Kunde am Beleg hängt', async () => {
    const second = organizationContextOf('org_zweite');
    await prisma.organization.create({
      data: { id: 'org_zweite', name: 'Zweite' },
    });
    const foreignTemplate = await prisma.template.create({
      data: {
        organizationId: second.organizationId,
        name: 'Fremd',
        htmlSource: '<html></html>',
        cssSource: '',
        isDefault: false,
      },
    });

    await expect(
      prisma.invoice.create({
        data: {
          organizationId: org.organizationId,
          customerId: null,
          buyerMode: 'FREE',
          buyerFreeText: FREE_TEXT,
          templateId: foreignTemplate.id,
          documentType: 'INVOICE',
          status: 'DRAFT',
        },
      }),
    ).rejects.toThrow();
  });

  it('nimmt einen freien Empfänger ohne Kundenverweis an', async () => {
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: org.organizationId,
        customerId: null,
        buyerMode: 'FREE',
        buyerFreeText: FREE_TEXT,
        documentType: 'INVOICE',
        status: 'DRAFT',
      },
    });

    expect(invoice.customerId).toBeNull();
  });
});

describe('Kundenbezug bleibt der Regelfall', () => {
  it('nimmt den Empfänger weiterhin aus den Stammdaten', async () => {
    const customer = await prisma.customer.create({
      data: {
        organizationId: org.organizationId,
        customerNumber: 'K-0001',
        companyName: 'Schulz KG',
        addressLine1: 'Musterweg 1',
        postalCode: '10115',
        city: 'Berlin',
        countryCode: 'DE',
      },
    });

    const created = await createDraftInvoice(org, draft(customerBuyer(customer.id)), ACTOR, null);
    const detail = await loadInvoiceDetail(org, created.id);

    expect(detail?.customerId).toBe(customer.id);

    const list = await listInvoices(org, {});
    expect(list[0]?.customerName).toBe('Schulz KG');
  });
});
