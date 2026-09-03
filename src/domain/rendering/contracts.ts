/**
 * Verträge der Ausgabe-Pipeline (NFA-ARCH-06, -07, Spec §3.2).
 *
 *     InvoiceDocument
 *        → TemplateEngine.render()   → HTML
 *        → PdfRenderer.render()      → PDF
 *        → PdfPostProcessor[]        → PDF          ← Erweiterungspunkt
 *        → ArtifactStore.save()      → Datei + Hash
 *
 * Reine Typen ohne Umsetzung: LiquidJS und Playwright sind austauschbar, ohne
 * dass aufrufender Code sich ändert. Die Post-Processor-Kette ist in V1 leer;
 * ZUGFeRD hängt sich später als zwei Prozessoren ein — PDF/A-Konvertierung und
 * XML-Einbettung — ohne dass die Pipeline aufgebrochen werden muss.
 */
import type { InvoiceDocument } from '../document/invoice-document';
import type { ReminderDocument } from '../reminder/reminder-document';

/** Seitenformat und Ränder in Millimetern (Spec §8.2). */
export type PageGeometry = {
  readonly format: 'A4';
  readonly marginTopMm: number;
  readonly marginRightMm: number;
  readonly marginBottomMm: number;
  readonly marginLeftMm: number;
};

/**
 * DIN 5008 Form B: oben 15 mm, seitlich 20 mm (Spec §8.2).
 *
 * **Oben 15 statt 25 mm** (seit M11): Das Anschriftfeld muss bei Form B genau
 * 45 mm unter der Blattkante beginnen, damit es im Fenster eines DIN-lang-
 * Umschlags steht (DIN 680: Fenster 90 × 45 mm, 20 mm von links, 15 mm von
 * unten). Über dem Feld liegen damit 45 mm, von denen der Rand einen Teil
 * verbraucht — bei 25 mm blieben für den Briefkopf 20 mm, und ein Logo von
 * 28 mm passte nicht mehr hinein.
 *
 * **Unten 22 mm statt der 20 mm der Norm** (seit M11). Der Blattfuß steht am
 * Ende des Satzspiegels, also 22 mm über der Blattkante — so dicht am Rand wie
 * ein Briefbogen ihn setzt. Darunter bleiben 10 mm für die Seitenzahl, die als
 * Nachbearbeiter aufs Blatt kommt und 12 mm über der Kante sitzt.
 *
 * Der Wert ist je Vorlage einstellbar; wer einen eigenen Fuß baut, setzt ihn
 * zurück.
 */
export const DEFAULT_PAGE_GEOMETRY: PageGeometry = {
  format: 'A4',
  marginTopMm: 15,
  marginRightMm: 20,
  marginBottomMm: 22,
  marginLeftMm: 20,
};

export type TemplateSource = {
  readonly htmlSource: string;
  readonly cssSource: string;
  readonly geometry: PageGeometry;
};

export type TemplateRenderError = {
  readonly kind: 'TEMPLATE_SYNTAX';
  /** Verständliche Meldung für die Oberfläche (FA-TPL-07). */
  readonly message: string;
  readonly line: number | null;
};

export type TemplateRenderResult =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly error: TemplateRenderError };

/**
 * Setzt ein Dokument in eine Vorlage ein.
 *
 * Ein Syntaxfehler führt zu einem Ergebniswert, nicht zu einer Ausnahme: Er ist
 * ein erwartbarer Fall — jemand bearbeitet eine Vorlage — und muss zu einer
 * verständlichen Meldung führen, nicht zu einem Absturz (FA-TPL-07).
 */
export type TemplateEngine = {
  render(document: InvoiceDocument, template: TemplateSource): Promise<TemplateRenderResult>;
};

/**
 * Dasselbe für die Mahnung (M15, FA-MAHN-06).
 *
 * **Ein eigener Vertrag und keine Verallgemeinerung von `TemplateEngine`.**
 * Dessen Signatur nennt `InvoiceDocument` ausdrücklich; darin liegt die
 * Aussage, welche Variablen eine Belegvorlage vorfindet. Auf ein beliebiges
 * Objekt geöffnet, sagte sie nichts mehr.
 */
export type ReminderTemplateEngine = {
  render(document: ReminderDocument, template: TemplateSource): Promise<TemplateRenderResult>;
};

export type PdfRenderOptions = {
  readonly geometry: PageGeometry;
  /**
   * Kopf- und Fußzeile als HTML, beide optional.
   *
   * Die Seitenangabe entsteht **nicht** hier: Sie erscheint erst ab Seite 2,
   * und die Gesamtzahl der Seiten steht beim Setzen noch nicht fest. Sie wird
   * nachträglich gestempelt (FA-PDF-06, `page-number-stamp.ts`). Ohne Angabe
   * zeichnet Chromium gar keine Kopf- und Fußzeile.
   */
  readonly headerTemplate?: string;
  readonly footerTemplate?: string;
  readonly timeoutMs: number;
};

export type PdfRenderError =
  | { readonly kind: 'TIMEOUT'; readonly timeoutMs: number }
  | { readonly kind: 'RENDER_FAILED'; readonly message: string };

export type PdfRenderResult =
  | { readonly ok: true; readonly pdf: Uint8Array }
  | { readonly ok: false; readonly error: PdfRenderError };

export type PdfRenderer = {
  render(html: string, options: PdfRenderOptions): Promise<PdfRenderResult>;
};

/**
 * Nachbearbeitung des erzeugten PDF (NFA-ARCH-06).
 *
 * In V1 ist die Kette leer. Ein Prozessor bekommt das PDF und gibt eines
 * zurück; mehrere laufen in der angegebenen Reihenfolge.
 */
export type PdfPostProcessor = {
  readonly name: string;
  process(pdf: Uint8Array): Promise<Uint8Array>;
};

/** Die zusammengesetzte Pipeline, wie die Anwendungsschicht sie erhält. */
export type RenderingPipeline = {
  readonly templateEngine: TemplateEngine;
  readonly pdfRenderer: PdfRenderer;
  readonly postProcessors: readonly PdfPostProcessor[];
};
