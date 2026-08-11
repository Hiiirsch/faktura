/**
 * Belegausgabe gegen echte Datenbank und echtes Chromium
 * (FA-TPL-02, -03, -05, -07, -08, -09; FA-PDF-01, -03, -04, -06, -10, -11;
 * FA-PFL-01 bis -11; FA-NUM-10; NFA-ARCH-06).
 *
 * Die Pflichtangaben werden am gesetzten HTML geprüft, nicht am PDF: Der Text
 * steht dort in derselben Form, aber lesbar. Was danach Chromium daraus macht,
 * prüfen die PDF-Tests weiter unten — dort geht es um Seitenumbruch,
 * Seitenzahlen und Zeitverhalten, nicht mehr um Inhalte.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EMPTY_COMPANY_PROFILE,
  saveCompanyProfile,
} from '@/application/company/company-profile';
import { createCustomer, type CustomerData } from '@/application/customers/customer-service';
import {
  ensureDefaultTemplate,
  getOrCreateInvoicePdf,
  renderInvoiceForDownload,
  renderInvoiceHtml,
  renderInvoicePdf,
} from '@/application/documents/render-invoice';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { createDraftInvoice, updateDraftInvoice } from '@/application/invoices/invoice-service';
import { addPayment } from '@/application/invoices/payments';
import {
  createTemplateFrom,
  listTemplates,
  makeDefault,
  updateTemplateFrom,
} from '@/application/templates/template-service';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';
import { applyPostProcessors } from '@/infrastructure/rendering/pipeline';
import { closeRenderer } from '@/infrastructure/rendering/playwright-renderer';
import { verifyArtifact } from '@/infrastructure/storage/artifact-store';

import { pdfContainsText } from '../support/pdf-text';

import { resetDatabase } from './setup/database';
import { testOrganization as org } from './setup/organization';

const ACTOR = 'pruef-akteur';

const COMPANY = {
  ...EMPTY_COMPANY_PROFILE,
  legalName: 'Musterbetrieb Tim',
  addressLine1: 'Hauptstr. 1',
  postalCode: '89518',
  city: 'Heidenheim',
  countryCode: 'DE',
  phone: '07321 123456',
  email: 'post@musterbetrieb.example',
  taxNumber: '12/345/67890',
  vatId: 'DE123456789',
  bankAccountHolder: 'Tim Musterbetrieb',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  bankName: 'Commerzbank',
  registerCourt: 'Amtsgericht Ulm',
  registerNumber: 'HRB 12345',
  managingDirector: 'Tim Muster',
};

const CUSTOMER: CustomerData = {
  companyName: 'Schulz KG',
  contactName: 'Frau Schulz',
  addressLine1: 'Musterweg 1',
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

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeRenderer();
});

function line(position: number, name: string) {
  return {
    position,
    name,
    description: `Beschreibung zu ${name}`,
    quantityScaled: 15_000,
    unitCode: 'HUR',
    unitPriceCents: 9_500,
    taxRateBasisPoints: 1_900,
    taxCategory: 'S',
    discountBasisPoints: 0,
  };
}

/** Legt Firma, Kunde und einen Entwurf an; gibt die Belegkennung zurück. */
async function seedDraft(
  lineCount = 1,
  overrides: Partial<Parameters<typeof createDraftInvoice>[1]> = {},
): Promise<{ invoiceId: string; customerId: string }> {
  await saveCompanyProfile(org, COMPANY, ACTOR, null);
  const customer = await createCustomer(org, CUSTOMER, ACTOR, null);

  const draft = await createDraftInvoice(
    org,
    {
      customerId: customer.id,
      taxScheme: 'STANDARD',
      currency: 'EUR',
      issueDate: '2026-03-01',
      serviceDateFrom: '2026-02-01',
      serviceDateTo: '2026-02-28',
      dueDate: '2026-03-15',
      introText: 'Vielen Dank für den Auftrag.',
      outroText: null,
      purchaseOrderRef: 'BST-4711',
      templateId: null,
      lines: Array.from({ length: lineCount }, (_, index) =>
        line(index + 1, `Leistung ${String(index + 1)}`),
      ),
      ...overrides,
    },
    ACTOR,
    null,
  );

  return { invoiceId: draft.id, customerId: customer.id };
}

async function seedIssued(lineCount = 1): Promise<string> {
  const { invoiceId } = await seedDraft(lineCount);
  const issued = await issueInvoice(org, invoiceId, ACTOR, null);
  expect(issued.ok).toBe(true);
  return invoiceId;
}

async function htmlOf(invoiceId: string): Promise<string> {
  const result = await renderInvoiceHtml(org, invoiceId);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('kein HTML');
  return result.value;
}

/** Normalisiert geschützte Leerzeichen, damit Beträge vergleichbar sind. */
function plain(html: string): string {
  return html.replace(/[\u00A0\u202F\u2009]/g, ' ');
}

describe('FA-TPL-05 Mitgelieferte Standardvorlage', () => {
  it('entsteht beim ersten Bedarf und ist als Standard markiert', async () => {
    expect(await listTemplates(org)).toHaveLength(0);

    const template = await ensureDefaultTemplate(org);

    expect(template.isDefault).toBe(true);
    expect(template.htmlSource.length).toBeGreaterThan(500);
    expect(template.marginTopMm).toBe(25);
    expect(template.marginLeftMm).toBe(20);
    expect(await listTemplates(org)).toHaveLength(1);
  });

  it('wird nicht bei jedem Aufruf erneut angelegt', async () => {
    const first = await ensureDefaultTemplate(org);
    const second = await ensureDefaultTemplate(org);

    expect(second.id).toBe(first.id);
    expect(await listTemplates(org)).toHaveLength(1);
  });
});

describe('FA-PFL-01 bis -11 Pflichtangaben auf dem Beleg', () => {
  it('nennt Name und Anschrift beider Parteien (FA-PFL-01)', async () => {
    const html = await htmlOf(await seedIssued());

    expect(html).toContain('Musterbetrieb Tim');
    expect(html).toContain('Hauptstr. 1');
    expect(html).toContain('89518');
    expect(html).toContain('Heidenheim');

    expect(html).toContain('Schulz KG');
    expect(html).toContain('Musterweg 1');
    expect(html).toContain('10115');
    expect(html).toContain('Berlin');
  });

  it('nennt Steuernummer und USt-IdNr des Ausstellers (FA-PFL-02)', async () => {
    const html = await htmlOf(await seedIssued());

    expect(html).toContain('12/345/67890');
    expect(html).toContain('DE123456789');
  });

  it('nennt Ausstellungsdatum und Rechnungsnummer (FA-PFL-03, -04)', async () => {
    const invoiceId = await seedIssued();
    const html = await htmlOf(invoiceId);

    expect(html).toContain('01.03.2026');
    expect(html).toMatch(/RE-2026-\d{4}/);
  });

  it('nennt Menge und Art der Leistung je Position (FA-PFL-05)', async () => {
    const html = plain(await htmlOf(await seedIssued(2)));

    expect(html).toContain('Leistung 1');
    expect(html).toContain('Leistung 2');
    expect(html).toContain('1,5 Stunde');
    expect(html).toContain('95,00 €');
  });

  it('nennt den Leistungszeitraum (FA-PFL-06)', async () => {
    const html = await htmlOf(await seedIssued());

    expect(html).toContain('Leistungszeitraum');
    expect(html).toContain('01.02.2026');
    expect(html).toContain('28.02.2026');
  });

  it('schlüsselt das Entgelt nach Steuersätzen auf (FA-PFL-07, -08)', async () => {
    const html = plain(await htmlOf(await seedIssued(2)));

    expect(html).toContain('Nettobetrag');
    expect(html).toContain('Regelsatz');
    expect(html).toContain('19 %');
    expect(html).toContain('Gesamtbetrag');
  });

  it('trägt bei Reverse Charge beide USt-IdNr und den Hinweis (FA-PFL-09)', async () => {
    await saveCompanyProfile(org, COMPANY, ACTOR, null);
    const customer = await createCustomer(
      org,
      { ...CUSTOMER, countryCode: 'AT', vatId: 'ATU12345678' },
      ACTOR,
      null,
    );

    const draft = await createDraftInvoice(
      org,
      {
        customerId: customer.id,
        taxScheme: 'REVERSE_CHARGE',
        currency: 'EUR',
        issueDate: '2026-03-01',
        serviceDateFrom: '2026-02-01',
        serviceDateTo: null,
        dueDate: '2026-03-15',
        introText: null,
        outroText: null,
        purchaseOrderRef: null,
        templateId: null,
        lines: [{ ...line(1, 'Beratung'), taxRateBasisPoints: 0, taxCategory: 'AE' }],
      },
      ACTOR,
      null,
    );

    const issued = await issueInvoice(org, draft.id, ACTOR, null);
    expect(issued.ok).toBe(true);

    const html = await htmlOf(draft.id);

    expect(html).toContain('DE123456789');
    expect(html).toContain('ATU12345678');
    expect(html).toContain('Steuerschuldnerschaft des Leistungsempfängers');
  });

  it('nennt Bankverbindung und Zahlungsziel (FA-PFL-10)', async () => {
    const html = await htmlOf(await seedIssued());

    expect(html).toContain('DE89370400440532013000');
    expect(html).toContain('COBADEFFXXX');
    expect(html).toContain('Commerzbank');
    expect(html).toContain('15.03.2026');
  });

  it('bezeichnet ein Stornodokument und nennt die Bezugsnummer (FA-PFL-11)', async () => {
    const { cancelInvoice } = await import('@/application/invoices/cancel-invoice');

    const invoiceId = await seedIssued();
    const result = await cancelInvoice(org, invoiceId, 'Falsch adressiert', ACTOR, null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const html = await htmlOf(result.creditNoteId);

    expect(html).toContain('Stornorechnung');
    expect(html).toContain('Storno zur Rechnung');
    expect(html).toMatch(/RE-2026-\d{4}/);
  });
});

describe('FA-PDF-03 Entwürfe sind gekennzeichnet', () => {
  it('setzt den Entwurfsvermerk in den Beleg', async () => {
    const { invoiceId } = await seedDraft();
    const html = await htmlOf(invoiceId);

    expect(html).toContain('<span class="draft-mark">Entwurf</span>');
  });

  it('lässt ihn nach dem Festschreiben weg', async () => {
    const html = await htmlOf(await seedIssued());

    // Geprüft wird das Element, nicht der Klassenname: Die Stilangabe steht
    // auch dann im Kopf des Dokuments, wenn der Vermerk nicht gesetzt wird.
    expect(html).not.toContain('<span class="draft-mark">');
  });
});

describe('FA-TPL-02, -03 Mehrere Vorlagen', () => {
  it('führt genau eine Standardvorlage, auch nach dem Umhängen', async () => {
    await ensureDefaultTemplate(org);

    const second = await createTemplateFrom(
      org,
      {
        name: 'Zweite',
        description: null,
        htmlSource: '<p>{{ invoice.number }}</p>',
        cssSource: 'body { font-size: 10pt; }',
        marginTopMm: 20,
        marginRightMm: 15,
        marginBottomMm: 15,
        marginLeftMm: 15,
      },
      ACTOR,
      null,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.isDefault).toBe(false);

    const changed = await makeDefault(org, second.value.id, ACTOR, null);
    expect(changed.ok).toBe(true);

    const templates = await listTemplates(org);
    expect(templates.filter((template) => template.isDefault)).toHaveLength(1);
    expect(templates.find((template) => template.isDefault)?.id).toBe(second.value.id);
  });

  it('setzt einen Beleg in seine eigene Vorlage statt in die Standardvorlage', async () => {
    const { invoiceId, customerId } = await seedDraft();
    await ensureDefaultTemplate(org);

    const custom = await createTemplateFrom(
      org,
      {
        name: 'Nur für diesen Beleg',
        description: null,
        htmlSource: '<p>KENNZEICHEN-EIGENE-VORLAGE {{ invoice.number }}</p>',
        cssSource: '',
        marginTopMm: 30,
        marginRightMm: 10,
        marginBottomMm: 10,
        marginLeftMm: 10,
      },
      ACTOR,
      null,
    );
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;

    const updated = await updateDraftInvoice(
      org,
      invoiceId,
      {
        customerId,
        taxScheme: 'STANDARD',
        currency: 'EUR',
        issueDate: '2026-03-01',
        serviceDateFrom: '2026-02-01',
        serviceDateTo: null,
        dueDate: '2026-03-15',
        introText: null,
        outroText: null,
        purchaseOrderRef: null,
        templateId: custom.value.id,
        lines: [line(1, 'Beratung')],
      },
      ACTOR,
      null,
    );
    expect(updated.ok).toBe(true);

    const html = await htmlOf(invoiceId);
    expect(html).toContain('KENNZEICHEN-EIGENE-VORLAGE');
    // Und die Geometrie der eigenen Vorlage, nicht die der Standardvorlage.
    expect(html).toContain('margin: 30mm 10mm 10mm 10mm');
  });
});

describe('FA-TPL-07 Syntaxfehler', () => {
  it('meldet ihn verständlich, statt abzustürzen', async () => {
    const invoiceId = await seedIssued();
    const template = await ensureDefaultTemplate(org);

    const broken = await updateTemplateFrom(
      org,
      template.id,
      {
        name: template.name,
        description: template.description,
        htmlSource: '{% for line in lines %}<p>{{ line.name }}</p>',
        cssSource: template.cssSource,
        marginTopMm: template.marginTopMm,
        marginRightMm: template.marginRightMm,
        marginBottomMm: template.marginBottomMm,
        marginLeftMm: template.marginLeftMm,
      },
      ACTOR,
      null,
    );
    expect(broken.ok).toBe(true);

    const result = await renderInvoiceHtml(org, invoiceId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('TEMPLATE_FAILED');
    if (result.error.kind !== 'TEMPLATE_FAILED') return;
    expect(result.error.error.message.length).toBeGreaterThan(0);
  });
});

describe('FA-TPL-08 Seitenränder je Vorlage', () => {
  it('übernimmt die Ränder der Vorlage in die Druckangaben', async () => {
    const invoiceId = await seedIssued();
    const template = await ensureDefaultTemplate(org);

    await updateTemplateFrom(
      org,
      template.id,
      {
        name: template.name,
        description: template.description,
        htmlSource: template.htmlSource,
        cssSource: template.cssSource,
        marginTopMm: 40,
        marginRightMm: 12,
        marginBottomMm: 18,
        marginLeftMm: 24,
      },
      ACTOR,
      null,
    );

    const html = await htmlOf(invoiceId);
    expect(html).toContain('margin: 40mm 12mm 18mm 24mm');
  });
});

describe('FA-PDF-01, FA-NUM-10 Artefakt mit Hash', () => {
  it('legt das PDF beim ersten Abruf ab und liefert danach dieselbe Datei', async () => {
    const invoiceId = await seedIssued();

    const first = await getOrCreateInvoicePdf(org, invoiceId);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(new TextDecoder().decode(first.value.pdf.subarray(0, 5))).toBe('%PDF-');
    expect(first.value.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.value.fileName).toMatch(/^RE-2026-\d{4}\.pdf$/);

    const second = await getOrCreateInvoicePdf(org, invoiceId);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.sha256).toBe(first.value.sha256);
    expect(second.value.pdf).toEqual(first.value.pdf);
  }, 60_000);

  it('hinterlegt eine Datei, die dem gespeicherten Hash entspricht', async () => {
    const invoiceId = await seedIssued();

    const result = await getOrCreateInvoicePdf(org, invoiceId);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.sha256 === null) return;

    const { findArtifact } = await import('@/infrastructure/repositories/artifact-repository');
    const artifact = await findArtifact(org, invoiceId, 'pdf');

    expect(artifact).not.toBeNull();
    if (artifact === null) return;

    expect(artifact.sha256).toBe(result.value.sha256);
    expect(await verifyArtifact(artifact.filePath, artifact.sha256)).toBe(true);
  }, 60_000);
});

describe('FA-TPL-09 Vorlagenänderung verändert erzeugte PDFs nicht', () => {
  it('liefert nach der Änderung unverändert dieselben Bytes', async () => {
    const invoiceId = await seedIssued();

    const before = await getOrCreateInvoicePdf(org, invoiceId);
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const template = await ensureDefaultTemplate(org);
    await updateTemplateFrom(
      org,
      template.id,
      {
        name: template.name,
        description: template.description,
        htmlSource: '<p>VOLLSTÄNDIG ANDERE VORLAGE</p>',
        cssSource: 'body { color: #000; }',
        marginTopMm: 10,
        marginRightMm: 10,
        marginBottomMm: 10,
        marginLeftMm: 10,
      },
      ACTOR,
      null,
    );

    const after = await getOrCreateInvoicePdf(org, invoiceId);
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    expect(after.value.sha256).toBe(before.value.sha256);
    expect(after.value.pdf).toEqual(before.value.pdf);
  }, 90_000);

  it('setzt einen Entwurf dagegen bei jedem Abruf neu', async () => {
    const { invoiceId } = await seedDraft();

    const first = await renderInvoiceForDownload(org, invoiceId);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Ein Entwurf wird nicht abgelegt: kein Hash, kein Artefakt.
    expect(first.value.sha256).toBeNull();

    const { findArtifact } = await import('@/infrastructure/repositories/artifact-repository');
    expect(await findArtifact(org, invoiceId, 'pdf')).toBeNull();
  }, 60_000);
});

describe('FA-PDF-11 Fehlgeschlagenes Rendering hinterlässt keine Datei', () => {
  it('legt bei kaputter Vorlage weder Artefakt noch Datei an', async () => {
    const invoiceId = await seedIssued();
    const template = await ensureDefaultTemplate(org);

    await updateTemplateFrom(
      org,
      template.id,
      {
        name: template.name,
        description: template.description,
        htmlSource: '{% for line in lines %}<p>{{ line.name }}</p>',
        cssSource: template.cssSource,
        marginTopMm: 25,
        marginRightMm: 20,
        marginBottomMm: 20,
        marginLeftMm: 20,
      },
      ACTOR,
      null,
    );

    const result = await getOrCreateInvoicePdf(org, invoiceId);
    expect(result.ok).toBe(false);

    const { findArtifact } = await import('@/infrastructure/repositories/artifact-repository');
    expect(await findArtifact(org, invoiceId, 'pdf')).toBeNull();
  }, 60_000);
});

describe('FA-PDF-04, -06, -10 Seitenumbruch, Seitenangabe, Zeitverhalten', () => {
  it('bricht 60 Positionen über mehrere Seiten um', async () => {
    const invoiceId = await seedIssued(60);

    const result = await renderInvoicePdf(org, invoiceId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Ein einseitiges PDF dieser Vorlage liegt deutlich darunter; die Größe
    // ist hier der belastbare Hinweis auf mehrere Seiten.
    expect(result.value.pdf.byteLength).toBeGreaterThan(20_000);

    // Und jede Position ist enthalten — nichts geht beim Umbruch verloren.
    const html = await htmlOf(invoiceId);
    expect(html).toContain('Leistung 1');
    expect(html).toContain('Leistung 60');
  }, 120_000);

  it('lässt den einseitigen Beleg ohne Seitenangabe (FA-PDF-06)', async () => {
    const invoiceId = await seedIssued(1);

    const result = await renderInvoicePdf(org, invoiceId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // „Seite 1 von 1" wäre eine Auskunft ohne Empfänger.
    expect(pdfContainsText(result.value.pdf, 'Seite 1 von')).toBe(false);
  }, 120_000);

  it('setzt die Seitenangabe ab Seite 2 (FA-PDF-06)', async () => {
    const invoiceId = await seedIssued(60);

    const result = await renderInvoicePdf(org, invoiceId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(pdfContainsText(result.value.pdf, 'Seite 2 von')).toBe(true);
    // Die erste Seite bleibt frei.
    expect(pdfContainsText(result.value.pdf, 'Seite 1 von')).toBe(false);
  }, 120_000);

  it('setzt 10 Positionen in unter 3 Sekunden (FA-PDF-10)', async () => {
    const invoiceId = await seedIssued(10);

    // Ein Durchgang zum Aufwärmen: Der Browserstart ist einmalig und gehört
    // nicht in die Messung — im Betrieb läuft er beim ersten Beleg.
    await renderInvoicePdf(org, invoiceId);

    const started = performance.now();
    const result = await renderInvoicePdf(org, invoiceId);
    const elapsed = performance.now() - started;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(3_000);
  }, 120_000);
});

describe('NFA-ARCH-06 Post-Processor-Kette', () => {
  it('ist in V1 leer und lässt das PDF unverändert', async () => {
    const pdf = new Uint8Array([1, 2, 3]);
    expect(await applyPostProcessors(pdf, [])).toEqual(pdf);
  });

  it('führt eingehängte Prozessoren in der angegebenen Reihenfolge aus', async () => {
    const order: string[] = [];

    const appendByte = (name: string, byte: number) => ({
      name,
      process: (input: Uint8Array): Promise<Uint8Array> => {
        order.push(name);
        return Promise.resolve(new Uint8Array([...input, byte]));
      },
    });

    const result = await applyPostProcessors(new Uint8Array([0]), [
      appendByte('pdfa', 1),
      appendByte('xml', 2),
    ]);

    expect(order).toEqual(['pdfa', 'xml']);
    expect([...result]).toEqual([0, 1, 2]);
  });

  it('reicht einen Fehler durch, statt ein halbes Ergebnis zu liefern', async () => {
    const failing = {
      name: 'kaputt',
      process: (): Promise<Uint8Array> => Promise.reject(new Error('Konvertierung fehlgeschlagen')),
    };

    await expect(applyPostProcessors(new Uint8Array([0]), [failing])).rejects.toThrow(
      'Konvertierung fehlgeschlagen',
    );
  });
});

describe('Zahlungen erscheinen im Beleg', () => {
  it('weist bereits gezahlten und offenen Betrag aus', async () => {
    const invoiceId = await seedIssued();

    await addPayment(org, invoiceId, {
      amountCents: cents(5_000),
      paidAt: plainDate('2026-03-05'),
      method: null,
      note: null,
    });

    const html = plain(await htmlOf(invoiceId));

    expect(html).toContain('Bereits gezahlt');
    expect(html).toContain('50,00 €');
    expect(html).toContain('Offener Betrag');
  });
});
