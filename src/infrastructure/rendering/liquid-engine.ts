/**
 * Vorlagen-Engine auf LiquidJS (Spec §2, §8.1, FA-TPL-01, -07; NFA-ARCH-07).
 *
 * Liquid statt Nunjucks oder EJS, weil eine hochgeladene Vorlage
 * ausführbarer Inhalt ist: Liquid kennt keine beliebige Codeausführung, nur
 * Ausgabe und einfache Kontrollstrukturen (Spec §8.4).
 *
 * Die Filter `money`, `date` und `decimal` greifen auf dieselben Funktionen zu
 * wie die Oberfläche (`@/domain/format/de`). Damit steht im PDF derselbe Betrag
 * wie auf dem Bildschirm — eine zweite Formatierung würde früher oder später
 * abweichen.
 */
import { Liquid, type LiquidError } from 'liquidjs';

import type { InvoiceDocument } from '@/domain/document/invoice-document';
import { buildPaymentTermsNotice } from '@/domain/document/notices';
import {
  formatAmountDe,
  formatMoneyDe,
  formatPercentDe,
  formatPlainDateDe,
  formatQuantityDe,
} from '@/domain/format/de';
import { cents } from '@/domain/money/money';
import { quantityFromScaled } from '@/domain/quantity/quantity';
import type {
  TemplateEngine,
  TemplateRenderResult,
  TemplateSource,
} from '@/domain/rendering/contracts';

/**
 * Die Engine wird einmal aufgebaut und wiederverwendet.
 *
 * `strictVariables` bleibt aus: Eine Vorlage, die ein optionales Feld
 * ausgibt — etwa die USt-IdNr eines Kunden ohne solche — soll eine leere
 * Stelle erzeugen und nicht das ganze Dokument scheitern lassen.
 */
function createLiquid(): Liquid {
  const engine = new Liquid({
    strictFilters: true,
    strictVariables: false,
    // Vorlagen kommen ausschließlich aus der Datenbank; ein Dateisystemzugriff
    // über `{% include %}` wäre ein Ausbruchspfad und bleibt deshalb zu.
    root: [],
    dynamicPartials: false,
  });

  engine.registerFilter('money', (value: unknown, currency: unknown) =>
    typeof value === 'number'
      ? formatMoneyDe(cents(value), typeof currency === 'string' ? (currency as 'EUR') : 'EUR')
      : '',
  );

  engine.registerFilter('decimal', (value: unknown) =>
    typeof value === 'number' ? formatAmountDe(cents(value)) : '',
  );

  engine.registerFilter('quantity', (value: unknown) =>
    typeof value === 'number' ? formatQuantityDe(quantityFromScaled(value)) : '',
  );

  engine.registerFilter('percent', (value: unknown) =>
    typeof value === 'number' ? formatPercentDe(value) : '',
  );

  // `date` überschreibt den eingebauten Filter: Unsere Kalendertage sind
  // Zeichenketten, kein Zeitpunkt — sie durch eine Zeitzone zu schicken würde
  // sie um einen Tag verschieben.
  engine.registerFilter('date', (value: unknown) =>
    typeof value === 'string' ? formatPlainDateDe(value) : '',
  );

  return engine;
}

let sharedEngine: Liquid | undefined;

function engine(): Liquid {
  sharedEngine ??= createLiquid();
  return sharedEngine;
}

/** Baut aus Vorlage, CSS und Geometrie ein vollständiges HTML-Dokument. */
function assembleDocument(body: string, template: TemplateSource): string {
  const { geometry } = template;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<style>
@page {
  size: ${geometry.format};
  margin: ${String(geometry.marginTopMm)}mm ${String(geometry.marginRightMm)}mm ${String(geometry.marginBottomMm)}mm ${String(geometry.marginLeftMm)}mm;
}
${template.cssSource}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function describeError(error: unknown): { message: string; line: number | null } {
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const liquidError = error as LiquidError & { line?: number };
    return {
      message: liquidError.message,
      line: typeof liquidError.line === 'number' ? liquidError.line : null,
    };
  }
  return { message: 'Die Vorlage konnte nicht verarbeitet werden.', line: null };
}

export const liquidTemplateEngine: TemplateEngine = {
  async render(document: InvoiceDocument, template: TemplateSource): Promise<TemplateRenderResult> {
    try {
      // `parseAndRender` ist mit `any` typisiert; das Ergebnis ist die
      // gerenderte Zeichenkette.
      const rendered: unknown = await engine().parseAndRender(
        template.htmlSource,
        buildScope(document),
      );
      const body = typeof rendered === 'string' ? rendered : '';
      return { ok: true, html: assembleDocument(body, template) };
    } catch (error) {
      const described = describeError(error);
      return {
        ok: false,
        error: { kind: 'TEMPLATE_SYNTAX', message: described.message, line: described.line },
      };
    }
  },
};

/**
 * Die Variablen, die einer Vorlage zur Verfügung stehen (Spec §8.1).
 *
 * Bewusst flach gehalten und an der Spezifikation orientiert: `seller`,
 * `buyer`, `invoice`, `lines`, `taxBreakdown`, `totals`, `notices`.
 */
export function buildScope(document: InvoiceDocument): Record<string, unknown> {
  return {
    seller: document.seller,
    buyer: document.buyer,
    invoice: {
      documentType: document.documentType,
      documentTypeLabel: document.documentTypeLabel,
      number: document.invoiceNumber,
      issueDate: document.issueDate,
      serviceDateFrom: document.serviceDateFrom,
      serviceDateTo: document.serviceDateTo,
      dueDate: document.dueDate,
      currency: document.currency,
      purchaseOrderRef: document.purchaseOrderRef,
      introText: document.introText,
      outroText: document.outroText,
      isDraft: document.isDraft,
      preceding: document.preceding,
    },
    lines: document.lines.map((line) => ({
      position: line.position,
      name: line.name,
      description: line.description,
      quantity: line.quantityScaled,
      unitCode: line.unitCode,
      unitLabel: line.unitLabel,
      unitPrice: line.unitPriceCents,
      discount: line.discountBasisPoints,
      taxRate: line.taxRateBasisPoints,
      taxCategory: line.taxCategory,
      taxCategoryLabel: line.taxCategoryLabel,
      lineNet: line.lineNetCents,
    })),
    taxBreakdown: document.taxBreakdown.map((group) => ({
      rate: group.taxRateBasisPoints,
      category: group.taxCategory,
      categoryLabel: group.taxCategoryLabel,
      net: group.netCents,
      tax: group.taxCents,
    })),
    totals: {
      net: document.totals.netCents,
      tax: document.totals.taxCents,
      gross: document.totals.grossCents,
      paid: document.totals.paidCents,
      outstanding: document.totals.outstandingCents,
    },
    notices: document.notices,
    /**
     * Zahlungshinweise getrennt von den Pflichthinweisen (FA-PFL-10).
     *
     * Sie stehen im Beleg an anderer Stelle — beim Zahlungsblock, nicht bei den
     * steuerlichen Hinweisen. Zusammengeworfen müsste die Vorlage sie wieder
     * auseinandersortieren.
     */
    paymentNotices: [
      buildPaymentTermsNotice(document.dueDate, document.documentType === 'CREDIT_NOTE'),
    ].filter((notice): notice is string => notice !== null),
    footerText: document.footerText,
  };
}
