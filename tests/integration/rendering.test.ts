/**
 * Vorlagen-Engine und PDF-Renderer
 * (FA-TPL-07; FA-PDF-04; NFA-SEC-12, -13, -14; NFA-ARCH-07).
 *
 * Läuft gegen echtes Chromium — die Zusagen dieser Anforderungen stecken im
 * Verhalten des Browsers, nicht im TypeScript-Code. Ein Test mit Attrappe
 * würde nichts davon belegen.
 */
import { afterAll, describe, expect, it } from 'vitest';

import type { InvoiceDocument } from '@/domain/document/invoice-document';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';
import {
  DEFAULT_PAGE_GEOMETRY,
  type PdfRenderOptions,
  type TemplateSource,
} from '@/domain/rendering/contracts';
import { liquidTemplateEngine } from '@/infrastructure/rendering/liquid-engine';
import {
  DEFAULT_TEMPLATE_CSS,
  DEFAULT_TEMPLATE_HTML,
} from '@/infrastructure/templates/default-template';
import {
  closeRenderer,
  playwrightPdfRenderer,
  renderAndReportBlocked,
} from '@/infrastructure/rendering/playwright-renderer';

afterAll(async () => {
  await closeRenderer();
});

const document: InvoiceDocument = {
  documentType: 'INVOICE',
  documentTypeLabel: 'Rechnung',
  invoiceNumber: 'RE-2026-0001',
  issueDate: plainDate('2026-03-01'),
  serviceDateFrom: plainDate('2026-02-01'),
  serviceDateTo: plainDate('2026-02-28'),
  dueDate: plainDate('2026-03-15'),
  currency: 'EUR',
  purchaseOrderRef: null,
  seller: {
    name: 'Musterbetrieb Tim',
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
    addressBlock: null,
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
      description: 'Konzeption',
      quantityScaled: 15_000,
      unitCode: 'HUR',
      unitLabel: 'Stunde',
      unitPriceCents: cents(9_500),
      discountBasisPoints: 0,
      taxRateBasisPoints: 1_900,
      taxCategory: 'S',
      taxCategoryLabel: 'Regelsatz',
      lineNetCents: cents(14_250),
    },
  ],
  taxBreakdown: [
    {
      taxRateBasisPoints: 1_900,
      taxCategory: 'S',
      taxCategoryLabel: 'Regelsatz',
      netCents: cents(14_250),
      taxCents: cents(2_708),
    },
  ],
  totals: {
    netCents: cents(14_250),
    taxCents: cents(2_708),
    grossCents: cents(16_958),
    paidCents: cents(0),
    outstandingCents: cents(16_958),
  },
  preceding: null,
  introText: null,
  outroText: null,
  footerText: null,
  notices: [],
  isDraft: false,
  showsTax: true,
};

function template(htmlSource: string, cssSource = ''): TemplateSource {
  return { htmlSource, cssSource, geometry: DEFAULT_PAGE_GEOMETRY };
}

const RENDER_OPTIONS: PdfRenderOptions = {
  geometry: DEFAULT_PAGE_GEOMETRY,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="font-size:8pt;width:100%;text-align:center">' +
    'Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>',
  timeoutMs: 15_000,
};

describe('Vorlagen-Engine (FA-TPL-01, -07)', () => {
  it('setzt die Variablen aus Spec §8.1 ein', async () => {
    const result = await liquidTemplateEngine.render(
      document,
      template(
        '<p>{{ seller.name }}</p><p>{{ buyer.name }}</p><p>{{ invoice.number }}</p>' +
          '<p>{{ invoice.issueDate | date }}</p>' +
          '{% for line in lines %}<p>{{ line.name }} · {{ line.quantity | quantity }} ' +
          '{{ line.unitLabel }} · {{ line.unitPrice | money }} · {{ line.lineNet | money }}</p>' +
          '{% endfor %}' +
          '{% for group in taxBreakdown %}<p>{{ group.rate | percent }} auf ' +
          '{{ group.net | money }} = {{ group.tax | money }}</p>{% endfor %}' +
          '<p>{{ totals.gross | money }}</p>',
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.html).toContain('Musterbetrieb Tim');
    expect(result.html).toContain('Beispiel GmbH');
    expect(result.html).toContain('RE-2026-0001');
    // Kalendertag ohne Zeitzonenverschiebung.
    expect(result.html).toContain('01.03.2026');
    expect(result.html).toContain('1,5 Stunde');
    expect(result.html).toContain('19 % auf');
  });

  it('formatiert Beträge wie die Oberfläche', async () => {
    const result = await liquidTemplateEngine.render(
      document,
      template('<p>{{ totals.gross | money }}</p>'),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Dieselbe Funktion wie in src/ui/format.ts — 169,58 €.
    expect(result.html.replace(/[\u00A0\u202F\u2009]/g, ' ')).toContain('169,58 €');
  });

  it('übernimmt Seitenformat und Ränder in die Druckangaben (Spec §8.2)', async () => {
    const result = await liquidTemplateEngine.render(document, template('<p>x</p>'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.html).toContain('size: A4');
    // Unten 35 mm seit M11: Der Blattfuß liegt in diesem Rand (FA-PDF-12).
    expect(result.html).toContain('margin: 25mm 20mm 35mm 20mm');
  });

  it('meldet einen Syntaxfehler verständlich, statt abzustürzen (FA-TPL-07)', async () => {
    const result = await liquidTemplateEngine.render(
      document,
      template('{% for line in lines %}<p>{{ line.name }}</p>'),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('TEMPLATE_SYNTAX');
    expect(result.error.message.length).toBeGreaterThan(0);
  });

  it('lässt ein fehlendes optionales Feld leer, statt zu scheitern', async () => {
    const result = await liquidTemplateEngine.render(
      document,
      template('<p>[{{ buyer.vatId }}]</p>'),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('[]');
  });
});

/**
 * Keine Umsatzsteuer, wo keine ist (M11, B1, FA-PFL-13).
 *
 * **Warum das die Standardvorlage prüft und nicht ein Fragment.** Die Regel soll
 * genau dort greifen, wo sie im Betrieb wirkt — im Beleg, den jedes Unternehmen
 * ohne Zutun bekommt. Ein eigens gebautes Fragment bewiese nur, dass `{% if %}`
 * funktioniert.
 *
 * Ein Kleinunternehmer darf keine Umsatzsteuer ausweisen (§19 UStG); was
 * ausgewiesen ist, schuldet man nach §14c, auch wenn es falsch ist. Eine Spalte
 * „USt. 0 %" behauptet eine Steuerpflicht, die nicht besteht.
 */
describe('FA-PFL-13 Der Beleg eines Kleinunternehmers', () => {
  const defaultTemplate = {
    htmlSource: DEFAULT_TEMPLATE_HTML,
    cssSource: DEFAULT_TEMPLATE_CSS,
    geometry: DEFAULT_PAGE_GEOMETRY,
  };

  it('zeigt weder Steuerspalte noch Steuerzeile', async () => {
    const result = await liquidTemplateEngine.render(
      { ...document, showsTax: false },
      defaultTemplate,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.html).not.toContain('USt.');
    expect(result.html).not.toContain('Nettobetrag');
    // Der Gesamtbetrag bleibt — er ist die einzige Zahl, die zählt.
    expect(result.html).toContain('Gesamtbetrag');
  });

  it('zeigt beides beim Regelbesteuerer', async () => {
    // Die Gegenprobe: Ohne sie bestünde der Test oben auch dann, wenn die
    // Vorlage die Steuer nie ausgäbe.
    const result = await liquidTemplateEngine.render(
      { ...document, showsTax: true },
      defaultTemplate,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.html).toContain('USt.');
    expect(result.html).toContain('Nettobetrag');
    expect(result.html).toContain('19 % auf');
  });

  it('behält der Beleg die Anzahl seiner Spalten bei', async () => {
    /*
     * Kopf und Rumpf müssen gemeinsam schrumpfen. Bliebe eine Kopfzelle stehen,
     * verschöbe sich jede Zeile um eine Spalte — und das fiele erst am
     * ausgedruckten Beleg auf.
     */
    const result = await liquidTemplateEngine.render(
      { ...document, showsTax: false },
      defaultTemplate,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const headCells = (result.html.match(/<th class="col-/gu) ?? []).length;
    const bodyCells = (result.html.match(/<td class="col-/gu) ?? []).length;

    expect(headCells).toBe(5);
    // Eine Position im Prüfbeleg, also genau eine Zeile mit fünf Zellen.
    expect(bodyCells).toBe(5);
  });
});

/**
 * Der Blattfuß (M11, B2, FA-PDF-12).
 *
 * **Was hier nicht geprüft werden kann**, ist die Lage auf dem Papier — dafür
 * braucht es ein erzeugtes PDF und ein Auge. Was sich prüfen lässt, ist der
 * Aufbau, der sie herstellt: der Fuß in einer Fußgruppe, damit der Umbruch ihn
 * je Seite setzt **und** Platz für ihn lässt.
 *
 * Der erste Anlauf war `position: fixed`. Er erschien auf jeder Seite und hielt
 * keinen Platz frei; auf der zweiten Seite liefen die Positionszeilen mitten
 * durch den Fuß. Deshalb prüft der erste Test die Fußgruppe und nicht nur, dass
 * irgendwo ein Fuß steht.
 */
describe('FA-PDF-12 Der Blattfuß', () => {
  const defaultTemplate = {
    htmlSource: DEFAULT_TEMPLATE_HTML,
    cssSource: DEFAULT_TEMPLATE_CSS,
    geometry: DEFAULT_PAGE_GEOMETRY,
  };

  it('steht in einer Fußgruppe, die der Umbruch freihält', async () => {
    const result = await liquidTemplateEngine.render(document, defaultTemplate);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const footerGroup = result.html.indexOf('<tfoot>');
    const imprint = result.html.indexOf('class="imprint"');
    const bodyGroup = result.html.indexOf('<tbody>');

    expect(footerGroup).toBeGreaterThan(-1);
    // Der Fuß steht **in** der Fußgruppe, und die steht vor dem Rumpf: So
    // verlangt es HTML, und so wiederholt Chromium sie.
    expect(imprint).toBeGreaterThan(footerGroup);
    expect(imprint).toBeLessThan(bodyGroup);
    expect(result.html).toContain('table-footer-group');
  });

  it('trägt die Bankverbindung', async () => {
    const result = await liquidTemplateEngine.render(document, defaultTemplate);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const footer = result.html.slice(
      result.html.indexOf('<tfoot>'),
      result.html.indexOf('</tfoot>'),
    );

    expect(footer).toContain('Bankverbindung');
    expect(footer).toContain('IBAN');
  });

  it('nennt die Steuernummer im Briefkopf, nicht im Fuß', async () => {
    /*
     * §14 Abs. 4 Nr. 2 UStG verlangt Steuernummer **oder** USt-IdNr. auf jeder
     * Rechnung (FA-PFL-02). Sie darf umziehen, aber nicht verschwinden — der
     * Test hält beide Hälften dieser Aussage fest.
     */
    const result = await liquidTemplateEngine.render(document, defaultTemplate);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const head = result.html.slice(
      result.html.indexOf('class="letterhead"'),
      result.html.indexOf('class="address-field"'),
    );
    const footer = result.html.slice(
      result.html.indexOf('<tfoot>'),
      result.html.indexOf('</tfoot>'),
    );

    expect(head).toContain('USt-IdNr.');
    expect(footer).not.toContain('Steuernummer');
    expect(footer).not.toContain('USt-IdNr.');
  });
});

describe('PDF-Renderer', () => {
  it('erzeugt ein PDF', async () => {
    const rendered = await liquidTemplateEngine.render(document, template('<h1>Rechnung</h1>'));
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    const result = await playwrightPdfRenderer.render(rendered.html, RENDER_OPTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // %PDF-1.
    expect(new TextDecoder().decode(result.pdf.subarray(0, 5))).toBe('%PDF-');
    expect(result.pdf.byteLength).toBeGreaterThan(1_000);
  }, 60_000);

  it('führt keine ausgehende Anfrage aus (NFA-SEC-12, A7)', async () => {
    const rendered = await liquidTemplateEngine.render(
      document,
      template(
        '<h1>Rechnung</h1>' +
          '<img src="http://example.com/x.png" alt="">' +
          '<img src="https://interner-dienst.local/geheim.png" alt="">',
      ),
    );
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    const { result, blocked } = await renderAndReportBlocked(rendered.html, RENDER_OPTIONS);

    expect(result.ok).toBe(true);
    expect(blocked).toContain('http://example.com/x.png');
    expect(blocked).toContain('https://interner-dienst.local/geheim.png');
  }, 60_000);

  it('lässt data-URIs zu — darüber kommen Schrift und Logo', async () => {
    // Ein 1×1-PNG als data-URI.
    const pixel =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const rendered = await liquidTemplateEngine.render(
      document,
      template(`<h1>Rechnung</h1><img src="${pixel}" alt="">`),
    );
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    const { result, blocked } = await renderAndReportBlocked(rendered.html, RENDER_OPTIONS);
    expect(result.ok).toBe(true);
    expect(blocked).toEqual([]);
  }, 60_000);

  it('bricht nach dem Timeout kontrolliert ab (NFA-SEC-14)', async () => {
    const rendered = await liquidTemplateEngine.render(document, template('<h1>x</h1>'));
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    const result = await playwrightPdfRenderer.render(rendered.html, {
      ...RENDER_OPTIONS,
      // Unerreichbar kurz — der Abbruch muss ein Ergebniswert sein, keine
      // Ausnahme, und darf den Renderer nicht hinterlassen.
      timeoutMs: 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(['TIMEOUT', 'RENDER_FAILED']).toContain(result.error.kind);

    // Der Renderer ist danach weiter benutzbar.
    const after = await playwrightPdfRenderer.render(rendered.html, RENDER_OPTIONS);
    expect(after.ok).toBe(true);
  }, 60_000);

  it('bricht langen Inhalt über mehrere Seiten um (FA-PDF-04)', async () => {
    const manyLines = Array.from(
      { length: 80 },
      (_, index) => `<p style="margin:12mm 0">Position ${String(index + 1)}</p>`,
    ).join('');

    const rendered = await liquidTemplateEngine.render(document, template(manyLines));
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    const result = await playwrightPdfRenderer.render(rendered.html, RENDER_OPTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Mehrere Seiten und damit ein deutlich größeres Dokument. Die
    // Seitenangabe entsteht nicht mehr hier, sondern als Nachbearbeitung
    // (FA-PDF-06, `page-number-stamp.ts`) — sie erscheint erst ab Seite 2.
    expect(result.pdf.byteLength).toBeGreaterThan(3_000);
  }, 60_000);
});
