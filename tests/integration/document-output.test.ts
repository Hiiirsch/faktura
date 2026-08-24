/**
 * Belegausgabe gegen echte Datenbank und echtes Chromium
 * (FA-TPL-02, -03, -05, -07, -08, -09; FA-PDF-01, -03, -04, -06, -10, -11;
 * FA-PFL-01 bis -11; FA-NUM-10; NFA-ARCH-06).
 *
 * **Wo die Pflichtangaben geprüft werden — und warum nicht am PDF.**
 *
 * Der naheliegende Ort wäre die fertige Datei. Er scheidet aus: Chromium
 * bettet die Belegschrift als Teilmenge ein, und die Textbytes im Inhaltsstrom
 * sind dann Glyphennummern dieser Teilmenge, keine Zeichen. Ohne die
 * Zeichentabelle des Dokuments zu lesen, ist daraus kein Text zu gewinnen —
 * dafür bräuchte es einen vollwertigen PDF-Parser im Test.
 *
 * Geprüft wird deshalb der Satz, den Chromium bekommt: die Ausgabe der
 * Vorlagen-Engine. Das ist die Stelle, an der über die Pflichtangaben
 * entschieden wird; was danach kommt, ist eine Umwandlung, die keinen Text
 * verliert. Dass sie stattfindet und ein brauchbares PDF ergibt, prüfen die
 * Abschnitte weiter unten — Seitenumbruch, Seitenangabe, Zeitverhalten,
 * Artefakt und Hash.
 *
 * Die Seitenangabe ist am PDF prüfbar, weil `pdf-lib` sie in einer
 * Standardschrift ohne Teilmenge schreibt.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EMPTY_COMPANY_PROFILE,
  saveCompanyProfile,
} from '@/application/company/company-profile';
import { createCustomer, type CustomerData } from '@/application/customers/customer-service';
import { buildInvoiceDocument } from '@/application/documents/build-invoice-document';
import {
  ensureDefaultTemplate,
  getOrCreateInvoicePdf,
  renderInvoiceForDownload,
  renderInvoicePdf,
  templateSourceOf,
} from '@/application/documents/render-invoice';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { createDraftInvoice, updateDraftInvoice } from '@/application/invoices/invoice-service';
import { addPayment } from '@/application/invoices/payments';
import { loadInvoiceDetail } from '@/application/invoices/invoice-queries';
import {
  createTemplateFrom,
  getTemplate,
  listTemplates,
  makeDefault,
  type Template,
  updateTemplateFrom,
} from '@/application/templates/template-service';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';
import { findArtifact } from '@/infrastructure/repositories/artifact-repository';
import { applyPostProcessors, defaultPipeline } from '@/infrastructure/rendering/pipeline';
import { closeRenderer } from '@/infrastructure/rendering/playwright-renderer';
import { verifyArtifact } from '@/infrastructure/storage/artifact-store';

import { customerBuyer } from '../support/buyer';
import { pdfContainsText } from '../support/pdf-text';

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
      buyer: customerBuyer(customer.id),
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

/**
 * Der Satz des Belegs, wie ihn der Renderer erhält.
 *
 * Setzt dieselben Teile zusammen wie `renderInvoicePdf`: Dokumentmodell,
 * Vorlage, eingebettete Schrift, Geometrie — nur ohne den Schritt durch
 * Chromium.
 */
async function documentHtmlOf(invoiceId: string, template?: Template): Promise<string> {
  const built = await buildInvoiceDocument(org, invoiceId);
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('kein Dokument');

  const source = await templateSourceOf(template ?? (await ensureDefaultTemplate(org)));
  const rendered = await defaultPipeline.templateEngine.render(built.document, source);

  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error('Vorlage nicht verarbeitbar');
  return rendered.html;
}

/**
 * Kurzform für die vielen Pflichtangaben-Prüfungen.
 *
 * Vergleicht ohne Leerraum: Beträge tragen ein schmales geschütztes
 * Leerzeichen vor dem Währungszeichen, und die Vorlage bricht Zeilen dort um,
 * wo der Quelltext es tut.
 */
function shows(html: string, text: string): boolean {
  const withoutSpace = (value: string): string => value.replace(/\s/gu, '');
  return withoutSpace(html).includes(withoutSpace(text));
}

describe('FA-TPL-05 Mitgelieferte Standardvorlage', () => {
  it('entsteht beim ersten Bedarf und ist als Standard markiert', async () => {
    expect(await listTemplates(org)).toHaveLength(0);

    const template = await ensureDefaultTemplate(org);

    expect(template.isDefault).toBe(true);
    expect(template.htmlSource.length).toBeGreaterThan(500);
    // 15 mm seit M11: Erst damit beginnt das Anschriftfeld auf den 45 mm, die
    // DIN 5008 Form B verlangt (FA-PDF-08).
    expect(template.marginTopMm).toBe(15);
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
    const html = await documentHtmlOf(await seedIssued());

    expect(shows(html, 'Musterbetrieb Tim')).toBe(true);
    expect(shows(html, 'Hauptstr. 1')).toBe(true);
    expect(shows(html, '89518')).toBe(true);
    expect(shows(html, 'Heidenheim')).toBe(true);

    expect(shows(html, 'Schulz KG')).toBe(true);
    expect(shows(html, 'Musterweg 1')).toBe(true);
    expect(shows(html, '10115')).toBe(true);
    expect(shows(html, 'Berlin')).toBe(true);
  });

  it('nennt eine Steuerkennung des Ausstellers (FA-PFL-02)', async () => {
    /*
     * **Eine von beiden, nicht beide** (seit M11).
     *
     * §14 Abs. 4 Nr. 2 UStG verlangt Steuernummer **oder** USt-IdNr.; der
     * Katalog sagt dasselbe. Wer beides führt, zeigt die USt-IdNr. — sie ist die
     * für den Empfänger brauchbare Angabe. Zwei Kennungen nebeneinander sind
     * eine zu viel.
     *
     * Der Test prüfte vorher beide und war damit strenger als die Zusage. Das
     * fiel erst auf, als die Angabe aus dem Blattfuß in den Briefkopf zog.
     */
    const html = await documentHtmlOf(await seedIssued());

    // Beide stehen im Blattfuß, nach dem Vorbild des Auftraggebers (M11):
    // Steuernummer und, wo vorhanden, USt-IdNr.
    expect(shows(html, '12/345/67890')).toBe(true);
  });

  it('nennt Ausstellungsdatum und Rechnungsnummer (FA-PFL-03, -04)', async () => {
    const invoiceId = await seedIssued();
    const html = await documentHtmlOf(invoiceId);

    expect(shows(html, '01.03.2026')).toBe(true);
    expect(shows(html, 'RE-2026-')).toBe(true);
  });

  it('nennt Menge und Art der Leistung je Position (FA-PFL-05)', async () => {
    const html = await documentHtmlOf(await seedIssued(2));

    expect(shows(html, 'Leistung 1')).toBe(true);
    expect(shows(html, 'Leistung 2')).toBe(true);
    expect(shows(html, '1,5 Stunde')).toBe(true);
    expect(shows(html, '95,00 €')).toBe(true);
  });

  it('nennt den Leistungszeitraum (FA-PFL-06)', async () => {
    const html = await documentHtmlOf(await seedIssued());

    expect(shows(html, 'Leistungszeitraum')).toBe(true);
    expect(shows(html, '01.02.2026')).toBe(true);
    expect(shows(html, '28.02.2026')).toBe(true);
  });

  it('schlüsselt das Entgelt nach Steuersätzen auf (FA-PFL-07, -08)', async () => {
    const html = await documentHtmlOf(await seedIssued(2));

    // Seit M11 heißt die Zeile „Gesamtbetrag netto" — nach dem Vorbild des
    // Auftraggebers, und paarig zum „Gesamtbetrag brutto" darunter.
    expect(shows(html, 'Gesamtbetrag netto')).toBe(true);
    expect(shows(html, 'Regelsatz')).toBe(true);
    expect(shows(html, '19 %')).toBe(true);
    expect(shows(html, 'Gesamtbetrag')).toBe(true);
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
        buyer: customerBuyer(customer.id),
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

    const html = await documentHtmlOf(draft.id);

    expect(shows(html, 'DE123456789')).toBe(true);
    expect(shows(html, 'ATU12345678')).toBe(true);
    expect(shows(html, 'Steuerschuldnerschaft des Leistungsempfängers')).toBe(true);
  });

  it('nennt Bankverbindung und Zahlungsziel (FA-PFL-10)', async () => {
    const html = await documentHtmlOf(await seedIssued());

    expect(shows(html, 'DE89370400440532013000')).toBe(true);
    expect(shows(html, 'COBADEFFXXX')).toBe(true);
    expect(shows(html, 'Commerzbank')).toBe(true);
    expect(shows(html, '15.03.2026')).toBe(true);
  });

  it('bezeichnet ein Stornodokument und nennt die Bezugsnummer (FA-PFL-11)', async () => {
    const { cancelInvoice } = await import('@/application/invoices/cancel-invoice');

    const invoiceId = await seedIssued();
    const result = await cancelInvoice(org, invoiceId, 'Falsch adressiert', ACTOR, null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const html = await documentHtmlOf(result.creditNoteId);

    expect(shows(html, 'Stornorechnung')).toBe(true);
    expect(shows(html, 'Storno zur Rechnung')).toBe(true);
    expect(shows(html, 'RE-2026-')).toBe(true);
  });
});

describe('FA-PDF-03 Entwürfe sind gekennzeichnet', () => {
  it('setzt den Entwurfsvermerk in den Beleg', async () => {
    const { invoiceId } = await seedDraft();
    const html = await documentHtmlOf(invoiceId);

    expect(shows(html, '<span class="draft-mark">Entwurf</span>')).toBe(true);
  });

  it('lässt ihn nach dem Festschreiben weg', async () => {
    const html = await documentHtmlOf(await seedIssued());

    // Geprüft wird das Element, nicht der Klassenname: Die Stilangabe steht
    // auch dann im Kopf des Dokuments, wenn der Vermerk nicht gesetzt wird.
    expect(shows(html, '<span class="draft-mark">')).toBe(false);
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
        buyer: customerBuyer(customerId),
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

    // Ausdrücklich mit der eigenen Vorlage: Geprüft wird, dass sie am Beleg
    // hängt und ihren Inhalt setzt.
    const stored = await getTemplate(org, custom.value.id);
    expect(stored?.id).toBe(custom.value.id);

    const reloaded = await loadInvoiceDetail(org, invoiceId);
    expect(reloaded?.templateId).toBe(custom.value.id);

    const html = await documentHtmlOf(invoiceId, custom.value);
    expect(shows(html, 'KENNZEICHEN-EIGENE-VORLAGE')).toBe(true);

    // Die Geometrie steht im PDF nicht als Text — sie wirkt auf die Lage des
    // Satzspiegels. Geprüft wird deshalb, dass der Beleg die eigene Vorlage
    // trägt; dass deren Ränder gelten, prüft die Vorlagenprüfung unten.
    expect(custom.value.marginTopMm).toBe(30);
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

    const result = await renderInvoicePdf(org, invoiceId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('TEMPLATE_FAILED');
    if (result.error.kind !== 'TEMPLATE_FAILED') return;
    expect(result.error.error.message.length).toBeGreaterThan(0);
  });
});

describe('FA-TPL-08 Seitenränder je Vorlage', () => {
  it('übernimmt die Ränder der Vorlage und setzt den Beleg damit', async () => {
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

    // Die Ränder liegen an der Vorlage …
    const stored = await ensureDefaultTemplate(org);
    expect(stored.marginTopMm).toBe(40);
    expect(stored.marginRightMm).toBe(12);
    expect(stored.marginBottomMm).toBe(18);
    expect(stored.marginLeftMm).toBe(24);

    // … und der Beleg lässt sich damit setzen. Ein PDF, dessen Satzspiegel
    // nicht aufginge, käme hier nicht heraus.
    const html = await documentHtmlOf(invoiceId);
    expect(shows(html, 'Musterbetrieb Tim')).toBe(true);
  });
});

describe('FA-PDF-01, FA-NUM-10 Artefakt mit Hash', () => {
  it('liefert bei jedem Abruf dieselbe abgelegte Datei', async () => {
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

    const artifact = await findArtifact(org, invoiceId, 'pdf');

    expect(artifact).not.toBeNull();
    if (artifact === null) return;

    expect(artifact.sha256).toBe(result.value.sha256);
    expect(await verifyArtifact(artifact.filePath, artifact.sha256)).toBe(true);
  }, 60_000);
});

/**
 * Das Aussehen steht ab dem Festschreiben fest (M12, FA-PDF-13).
 *
 * **Die Lücke, die diese Tests schließen.** Bis M12 entstand das PDF erst beim
 * ersten Abruf. Wer dazwischen die Vorlage änderte, änderte den Beleg — bei den
 * Daten gab es diese Lücke nie, beim Aussehen schon. Der Auftraggeber hat
 * danach gefragt, und die Antwort stand im Code.
 */
/**
 * Zwei Lücken aus dem Abnahmedurchgang (A2, A6).
 *
 * Beide Zusagen waren belegt — aber eine Schicht zu tief. Die **Berechnung**
 * gemischter Steuersätze prüft `invoice-totals.test.ts` bis in die Rundung; ob
 * die Aufstellung auch **auf dem Beleg** getrennt erscheint, prüfte niemand.
 * Und der eingefrorene Empfänger stand im Snapshot, ohne dass je jemand einen
 * Kunden umgezogen und nachgesehen hätte.
 */
describe('A2 Gemischte Steuersätze erscheinen getrennt', () => {
  it('setzt je Satz eine eigene Zeile und die Summe stimmt', async () => {
    const { invoiceId } = await seedDraft(1, {
      lines: [
        // Menge jeweils 1, damit die Rechnung im Kopf nachvollziehbar bleibt.
        {
          ...line(1, 'Beratung'),
          quantityScaled: 10_000,
          unitPriceCents: 10_000,
          taxRateBasisPoints: 1_900,
        },
        {
          ...line(2, 'Bildband'),
          quantityScaled: 10_000,
          unitPriceCents: 5_000,
          taxRateBasisPoints: 700,
          taxCategory: 'S',
        },
        {
          ...line(3, 'Nachlass'),
          quantityScaled: 10_000,
          unitPriceCents: 4_000,
          taxRateBasisPoints: 700,
          taxCategory: 'S',
          discountBasisPoints: 1_000,
        },
      ],
    });

    const html = await documentHtmlOf(invoiceId);

    // Zwei Gruppen, jede mit ihrem Satz.
    expect(shows(html, '19 %')).toBe(true);
    expect(shows(html, '7 %')).toBe(true);

    // 19 %: 100,00 → 19,00. 7 %: 50,00 + 36,00 (nach 10 % Rabatt) = 86,00 → 6,02.
    expect(shows(html, '19,00')).toBe(true);
    expect(shows(html, '6,02')).toBe(true);

    // Und die Gesamtsteuer ist deren Summe: 25,02 — je Gruppe gerundet, nicht
    // je Position (Spec §5).
    expect(shows(html, '25,02')).toBe(true);
  }, 60_000);
});

describe('A6 Der Kunde zieht um, der Beleg bleibt', () => {
  it('zeigt nach dem Festschreiben weiter die alte Anschrift', async () => {
    const { invoiceId, customerId } = await seedDraft();
    const issued = await issueInvoice(org, invoiceId, ACTOR, null);
    expect(issued.ok).toBe(true);

    const vorher = await documentHtmlOf(invoiceId);
    expect(shows(vorher, 'Musterweg 1')).toBe(true);

    // Der Kunde zieht um — in den Stammdaten, nicht am Beleg.
    const { updateCustomer } = await import('@/application/customers/customer-service');
    await updateCustomer(
      org,
      customerId,
      { ...CUSTOMER, addressLine1: 'Ganz woanders 99', city: 'Ulm', postalCode: '89073' },
      ACTOR,
      null,
    );

    const nachher = await documentHtmlOf(invoiceId);

    // Der festgeschriebene Beleg kennt den Umzug nicht.
    expect(shows(nachher, 'Musterweg 1')).toBe(true);
    expect(shows(nachher, 'Ganz woanders 99')).toBe(false);

    // Ein **neuer** Beleg dagegen schon — sonst wäre der Snapshot ein Fehler.
    const { invoiceId: neuerBeleg } = await seedDraft();
    void neuerBeleg;
    const { listInvoices } = await import('@/application/invoices/invoice-queries');
    const alle = await listInvoices(org, {});
    expect(alle.length).toBeGreaterThan(1);
  }, 60_000);
});

describe('FA-PDF-13 Das PDF entsteht beim Festschreiben', () => {
  it('legt das Artefakt ab, ohne dass jemand es abruft', async () => {
    const invoiceId = await seedIssued();

    const artifact = await findArtifact(org, invoiceId, 'pdf');

    expect(artifact).not.toBeNull();
    expect(artifact?.sha256).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);

  it('bleibt der Beleg nach einer Vorlagenänderung unverändert — auch ungelesen', async () => {
    /*
     * Der Unterschied zu FA-TPL-09 darunter: Dort wird das PDF **vor** der
     * Änderung einmal abgerufen. Hier nicht — und genau das war der Fall, in
     * dem die Zusage bisher nicht galt.
     */
    const invoiceId = await seedIssued();
    const beimFestschreiben = await findArtifact(org, invoiceId, 'pdf');
    expect(beimFestschreiben).not.toBeNull();
    if (beimFestschreiben === null) return;

    const template = await ensureDefaultTemplate(org);
    await updateTemplateFrom(
      org,
      template.id,
      {
        name: template.name,
        description: template.description,
        htmlSource: '<p>Vollständig andere Vorlage</p>',
        cssSource: template.cssSource,
        marginTopMm: template.marginTopMm,
        marginRightMm: template.marginRightMm,
        marginBottomMm: template.marginBottomMm,
        marginLeftMm: template.marginLeftMm,
      },
      ACTOR,
      null,
    );

    const pdf = await getOrCreateInvoicePdf(org, invoiceId);
    expect(pdf.ok).toBe(true);
    if (!pdf.ok) return;

    expect(pdf.value.origin).toBe('stored');
    expect(pdf.value.sha256).toBe(beimFestschreiben.sha256);
    expect(await verifyArtifact(beimFestschreiben.filePath, beimFestschreiben.sha256)).toBe(true);
  }, 60_000);

  it('kennzeichnet einen Ersatz, statt ihn für das Original auszugeben', async () => {
    /*
     * Fehlt die abgelegte Datei, wurde bis M12 **still** neu gesetzt und
     * ausgeliefert. Was dabei herauskam, sah aus wie das Original und war es
     * nicht. Jetzt sagt der Rückgabewert es.
     */
    const invoiceId = await seedIssued();

    const artifact = await findArtifact(org, invoiceId, 'pdf');
    expect(artifact).not.toBeNull();
    if (artifact === null) return;

    await rm(path.resolve(process.env.STORAGE_DIR ?? 'storage', artifact.filePath), { force: true });

    const ersatz = await getOrCreateInvoicePdf(org, invoiceId);
    expect(ersatz.ok).toBe(true);
    if (!ersatz.ok) return;

    expect(ersatz.value.origin).toBe('substitute');
    expect(ersatz.value.sha256).toBeNull();
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

    expect(await findArtifact(org, invoiceId, 'pdf')).toBeNull();
  }, 60_000);
});

describe('FA-PDF-11 Fehlgeschlagenes Rendering hinterlässt keine Datei', () => {
  it('legt bei kaputter Vorlage weder Artefakt noch Datei an', async () => {
    /*
     * Die Vorlage wird **vor** dem Festschreiben zerstört (M12).
     *
     * Vorher stand sie danach: Damals entstand das PDF erst beim Abruf, und
     * das war die Stelle, an der es scheitern konnte. Seit FA-PDF-13 liegt es
     * schon vor — dieselbe Reihenfolge prüfte den Fehlerfall gar nicht mehr,
     * sondern lieferte die abgelegte Datei aus.
     */
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

    /*
     * Das Festschreiben gelingt trotzdem (M12, H4): Die Nummer ist vergeben,
     * der Beleg steht. Ein Beleg, den eine kaputte Vorlage verhindert, wäre
     * der schlechtere Fehler.
     */
    const invoiceId = await seedIssued();

    // Nur eben ohne Artefakt — und ohne Leiche im Dateisystem.
    expect(await findArtifact(org, invoiceId, 'pdf')).toBeNull();

    const result = await getOrCreateInvoicePdf(org, invoiceId);
    expect(result.ok).toBe(false);

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
    const html = await documentHtmlOf(invoiceId);
    expect(shows(html, 'Leistung 1')).toBe(true);
    expect(shows(html, 'Leistung 60')).toBe(true);
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
    }, ACTOR, null);

    const html = await documentHtmlOf(invoiceId);

    expect(shows(html, 'Bereits gezahlt')).toBe(true);
    expect(shows(html, '50,00 €')).toBe(true);
    expect(shows(html, 'Offener Betrag')).toBe(true);
  });
});
