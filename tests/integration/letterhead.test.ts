/**
 * Briefpapier hochladen und verknüpfen (M12 — FA-TPL-11, NFA-SEC-31).
 *
 * Die Prüfung liegt auf zwei Schichten, und beide werden hier gegen **echte
 * PDF-Dateien** gehalten statt gegen Bytefolgen: Seitenzahl und Blattmaß sind
 * genau die Eigenschaften, die man einer erfundenen Datei nicht ansieht. Die
 * Dateien entstehen im Test mit pdf-lib — derselben Bibliothek, die sie später
 * unter den Beleg legt.
 */
import { inflateSync } from 'node:zlib';

import { PDFDocument, rgb } from 'pdf-lib';
import { describe, expect, it, beforeEach } from 'vitest';

import {
  EMPTY_COMPANY_PROFILE,
  getCompanyProfile,
  saveCompanyProfile,
  setCompanyLetterhead,
} from '@/application/company/company-profile';
import { storeLetterheadAsset } from '@/application/company/letterhead';
import { readAssetContent } from '@/application/assets/asset-service';
import { createCustomer } from '@/application/customers/customer-service';
import { getOrCreateInvoicePdf, renderInvoicePdf } from '@/application/documents/render-invoice';
import { createDraftInvoice } from '@/application/invoices/invoice-service';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { MAX_LETTERHEAD_BYTES } from '@/domain/assets/pdf-upload';

import { customerBuyer } from '../support/buyer';

import { resetDatabase, TEST_ACTOR_ID } from './setup/database';
import { testOrganization as org } from './setup/organization';

const ACTOR = TEST_ACTOR_ID;

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

/**
 * Ein Bogen in Punkten — A4 misst 595,276 × 841,890.
 *
 * Auf jede Seite kommt eine Farbfläche, und das ist kein Beiwerk: Eine
 * **leere** PDF-Seite trägt gar keinen Inhaltsstrom, und pdf-lib weigert sich,
 * eine solche Seite einzubetten. Ein Bogen ohne Gestaltung ist kein Bogen —
 * dass er den Beleg trotzdem nicht umwirft, prüft ein eigener Fall weiter
 * unten.
 */
async function pdfWithPages(sizes: readonly (readonly [number, number])[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (const [width, height] of sizes) {
    document
      .addPage([width, height])
      .drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.87, 0.92, 0.87) });
  }
  return document.save();
}

const A4: readonly [number, number] = [595.276, 841.89];
const A5: readonly [number, number] = [419.528, 595.276];

async function a4Letterhead(): Promise<Uint8Array> {
  return pdfWithPages([A4]);
}

beforeEach(async () => {
  await resetDatabase();
  await saveCompanyProfile(org, COMPANY, ACTOR, null);
});

describe('FA-TPL-11 Ein Briefpapier ist eine einseitige A4-PDF', () => {
  it('nimmt einen A4-Bogen an und legt ihn ab', async () => {
    const result = await storeLetterheadAsset(
      org,
      await a4Letterhead(),
      'application/pdf',
      'briefpapier.pdf',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mimeType).toBe('application/pdf');
    expect(result.value.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Die Datei liegt wirklich da und ist die hochgeladene.
    const content = await readAssetContent(result.value);
    expect(content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(content.byteLength).toBe(result.value.byteSize);
  });

  it('weist ein zweiseitiges Briefpapier ab — die zweite Seite sähe niemand', async () => {
    const result = await storeLetterheadAsset(
      org,
      await pdfWithPages([A4, A4]),
      'application/pdf',
      'zwei-seiten.pdf',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('MULTIPLE_PAGES');
    if (result.error.kind !== 'MULTIPLE_PAGES') return;
    expect(result.error.pageCount).toBe(2);
  });

  it('weist A5 ab und nennt das gefundene Maß', async () => {
    const result = await storeLetterheadAsset(
      org,
      await pdfWithPages([A5]),
      'application/pdf',
      'zu-klein.pdf',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NOT_A4');
    if (result.error.kind !== 'NOT_A4') return;
    expect(Math.round(result.error.widthMm)).toBe(148);
    expect(Math.round(result.error.heightMm)).toBe(210);
  });

  it('weist eine beschädigte Datei als solche ab, nicht als Serverfehler', async () => {
    // Signatur stimmt, der Rest ist Unsinn — pdf-lib scheitert beim Lesen.
    const kaputt = new TextEncoder().encode('%PDF-1.7\nkein gültiger Objektbaum\n%%EOF');

    const result = await storeLetterheadAsset(org, kaputt, 'application/pdf', 'kaputt.pdf');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('UNREADABLE');
  });

  it('weist ein PNG mit gefälschtem Typ ab, bevor pdf-lib es anfasst', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

    const result = await storeLetterheadAsset(org, png, 'application/pdf', 'logo.pdf');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NOT_A_PDF');
  });

  it('weist eine zu große Datei ab', async () => {
    const gross = new Uint8Array(MAX_LETTERHEAD_BYTES + 1);
    gross.set(new TextEncoder().encode('%PDF-'));

    const result = await storeLetterheadAsset(org, gross, 'application/pdf', 'gross.pdf');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('TOO_LARGE');
  });

  it('legt bei jeder Ablehnung nichts ab — kein Datensatz, keine Datei', async () => {
    const vorher = await getCompanyProfile(org);
    expect(vorher?.letterheadAssetId ?? null).toBeNull();

    await storeLetterheadAsset(org, await pdfWithPages([A4, A4]), 'application/pdf', 'zwei.pdf');

    const nachher = await getCompanyProfile(org);
    expect(nachher?.letterheadAssetId ?? null).toBeNull();
  });
});

describe('FA-TPL-11 Das Briefpapier hängt am Unternehmen', () => {
  it('lässt sich verknüpfen und wieder lösen', async () => {
    const stored = await storeLetterheadAsset(
      org,
      await a4Letterhead(),
      'application/pdf',
      'briefpapier.pdf',
    );
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    await setCompanyLetterhead(org, stored.value.id, ACTOR, null);
    expect((await getCompanyProfile(org))?.letterheadAssetId).toBe(stored.value.id);

    await setCompanyLetterhead(org, null, ACTOR, null);
    expect((await getCompanyProfile(org))?.letterheadAssetId).toBeNull();
  });

  it('lässt sich hinterlegen, bevor die Firmendaten erfasst sind', async () => {
    /*
     * Dieselbe Falle wie beim Logo (M10): Ein `update` setzte voraus, dass die
     * Zeile schon existiert, und wer die Reihenfolge nicht kannte, bekam eine
     * Datenbankausnahme statt einer Meldung.
     */
    await resetDatabase();

    const stored = await storeLetterheadAsset(
      org,
      await a4Letterhead(),
      'application/pdf',
      'briefpapier.pdf',
    );
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    await setCompanyLetterhead(org, stored.value.id, ACTOR, null);
    expect((await getCompanyProfile(org))?.letterheadAssetId).toBe(stored.value.id);
  });
});

/**
 * Der ganze Weg: hochladen, Beleg setzen, nachsehen.
 *
 * Hier läuft echtes Chromium und echtes pdf-lib. Geprüft wird wieder die
 * **Reihenfolge** der Zeichenoperationen — an einem Belegsatz, den Chromium
 * erzeugt hat, nicht an einem im Test zusammengesetzten.
 */
async function seedDraft(lineCount = 1): Promise<string> {
  const customer = await createCustomer(
    org,
    {
      companyName: 'Beispielkunde GmbH',
      contactName: null,
      addressLine1: 'Marktplatz 3',
      addressLine2: null,
      postalCode: '89522',
      city: 'Heidenheim',
      countryCode: 'DE',
      email: null,
      phone: null,
      vatId: null,
      buyerReference: null,
      paymentTerms: 14,
      notes: null,
    },
    ACTOR,
    null,
  );

  const draft = await createDraftInvoice(
    org,
    {
      buyer: customerBuyer(customer.id),
      taxScheme: 'STANDARD',
      currency: 'EUR',
      issueDate: '2026-03-01',
      serviceDateFrom: '2026-02-01',
      serviceDateTo: null,
      dueDate: '2026-03-15',
      introText: null,
      outroText: null,
      purchaseOrderRef: null,
      templateId: null,
      lines: Array.from({ length: lineCount }, (_unused, index) => ({
        position: index + 1,
        name: `Leistung ${String(index + 1)}`,
        description: null,
        quantityScaled: 10_000,
        unitCode: 'HUR' as const,
        unitPriceCents: 9_500,
        taxRateBasisPoints: 1_900,
        taxCategory: 'S' as const,
        discountBasisPoints: 0,
      })),
    },
    ACTOR,
    null,
  );

  return draft.id;
}

async function streamsOfPage(pdf: Uint8Array, pageIndex: number): Promise<string[]> {
  const document = await PDFDocument.load(pdf);
  const page = document.getPages()[pageIndex];
  if (page === undefined) {
    throw new Error('Seite fehlt');
  }

  const contents = page.node.normalizedEntries().Contents;
  const streams: string[] = [];

  for (let index = 0; index < (contents?.size() ?? 0); index += 1) {
    const stream = document.context.lookup(contents?.get(index)) as unknown as {
      getContents(): Uint8Array;
    };
    const raw = Buffer.from(stream.getContents());
    try {
      streams.push(inflateSync(raw).toString('latin1'));
    } catch {
      streams.push(raw.toString('latin1'));
    }
  }

  return streams;
}

async function hinterlegtesBriefpapier(): Promise<void> {
  const stored = await storeLetterheadAsset(
    org,
    await a4Letterhead(),
    'application/pdf',
    'briefpapier.pdf',
  );
  if (!stored.ok) {
    throw new Error('Briefpapier ließ sich nicht ablegen');
  }
  await setCompanyLetterhead(org, stored.value.id, ACTOR, null);
}

describe('FA-TPL-11 Das Briefpapier liegt unter dem erzeugten Beleg', () => {
  it('erscheint im PDF eines Entwurfs', async () => {
    await hinterlegtesBriefpapier();
    const invoiceId = await seedDraft();

    const rendered = await renderInvoicePdf(org, invoiceId);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    const streams = await streamsOfPage(rendered.value.pdf, 0);
    const bogen = streams.findIndex((stream) => stream.includes('Do'));
    const satz = streams.findIndex((stream) => stream.includes('Tj') || stream.includes('TJ'));

    expect(bogen).toBeGreaterThanOrEqual(0);
    expect(satz).toBeGreaterThanOrEqual(0);
    expect(bogen).toBeLessThan(satz);
  }, 60_000);

  it('steckt im abgelegten PDF eines festgeschriebenen Belegs', async () => {
    await hinterlegtesBriefpapier();
    const invoiceId = await seedDraft();

    const issued = await issueInvoice(org, invoiceId, ACTOR, null);
    expect(issued.ok).toBe(true);

    const pdf = await getOrCreateInvoicePdf(org, invoiceId);
    expect(pdf.ok).toBe(true);
    if (!pdf.ok) return;

    expect(pdf.value.origin).toBe('stored');

    const streams = await streamsOfPage(pdf.value.pdf, 0);
    expect(streams.findIndex((stream) => stream.includes('Do'))).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('bleibt am Beleg, auch wenn das Briefpapier danach ausgetauscht wird', async () => {
    /*
     * Zusammen mit FA-PDF-13 ist das die eigentliche Zusage: Ein
     * festgeschriebener Beleg trägt seine Daten im Snapshot, sein Aussehen als
     * fertige Datei und seinen Bogen als Kennung darin.
     */
    await hinterlegtesBriefpapier();
    const invoiceId = await seedDraft();
    await issueInvoice(org, invoiceId, ACTOR, null);

    const vorher = await getOrCreateInvoicePdf(org, invoiceId);
    expect(vorher.ok).toBe(true);
    if (!vorher.ok) return;

    await setCompanyLetterhead(org, null, ACTOR, null);

    const nachher = await getOrCreateInvoicePdf(org, invoiceId);
    expect(nachher.ok).toBe(true);
    if (!nachher.ok) return;

    expect(nachher.value.sha256).toBe(vorher.value.sha256);
  }, 60_000);

  it('liegt auf jeder Seite eines mehrseitigen Belegs', async () => {
    await hinterlegtesBriefpapier();
    const invoiceId = await seedDraft(60);

    const rendered = await renderInvoicePdf(org, invoiceId);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    const document = await PDFDocument.load(rendered.value.pdf);
    expect(document.getPageCount()).toBeGreaterThan(1);

    for (let index = 0; index < document.getPageCount(); index += 1) {
      const streams = await streamsOfPage(rendered.value.pdf, index);
      expect(streams.findIndex((stream) => stream.includes('Do'))).toBeGreaterThanOrEqual(0);
    }
  }, 90_000);

  it('wirft den Beleg nicht um, wenn der Bogen leer ist', async () => {
    /*
     * Eine PDF-Seite ohne jeden Inhalt hat keinen Inhaltsstrom, und pdf-lib
     * lehnt es ab, sie einzubetten. Das ist eine gültige, wenn auch sinnlose
     * Datei — der Beleg muss trotzdem entstehen. Dieselbe Regel wie beim Logo.
     */
    const leer = await PDFDocument.create();
    leer.addPage([595.276, 841.89]);
    const stored = await storeLetterheadAsset(
      org,
      await leer.save(),
      'application/pdf',
      'leer.pdf',
    );
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    await setCompanyLetterhead(org, stored.value.id, ACTOR, null);

    const invoiceId = await seedDraft();
    const rendered = await renderInvoicePdf(org, invoiceId);

    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect((await PDFDocument.load(rendered.value.pdf)).getPageCount()).toBe(1);
  }, 60_000);

  it('lässt die Seitenangabe über dem Bogen stehen', async () => {
    /*
     * Die Reihenfolge der Kette: Briefpapier, dann Seitenstempel. Andersherum
     * läge die Angabe unter einer deckenden Fläche und wäre fort.
     */
    await hinterlegtesBriefpapier();
    const invoiceId = await seedDraft(60);

    const rendered = await renderInvoicePdf(org, invoiceId);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    /*
     * Der Stempel schreibt in Helvetica ohne Teilmenge — sein Text steht als
     * Hexfolge im Strom, nicht als Klartext: pdf-lib setzt jede Zeichenkette
     * als `<…> Tj`.
     */
    const streams = await streamsOfPage(rendered.value.pdf, 1);
    const hex = Buffer.from('Seite', 'latin1').toString('hex').toUpperCase();
    const stempel = streams.findIndex((stream) => stream.toUpperCase().includes(hex));
    const bogen = streams.findIndex((stream) => stream.includes('Do'));

    expect(stempel).toBeGreaterThanOrEqual(0);
    expect(bogen).toBeLessThan(stempel);
  }, 90_000);
});
