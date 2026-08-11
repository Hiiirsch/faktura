/**
 * Die zusammengesetzte Ausgabe-Pipeline (NFA-ARCH-06, Spec §3.2).
 *
 *     InvoiceDocument → TemplateEngine → PdfRenderer → PdfPostProcessor[] → PDF
 *
 * In der Kette hängt genau ein Nachbearbeiter: die Seitenangabe. Sie steht hier
 * und nicht in der Fußzeile des Renderers, weil sie erst ab Seite 2 erscheint —
 * und dafür muss die Gesamtseitenzahl bekannt sein, die es beim Setzen noch
 * nicht gibt (FA-PDF-06).
 *
 * ZUGFeRD hängt sich später an dieselbe Stelle: PDF/A-Konvertierung und
 * XML-Einbettung als zwei weitere Prozessoren, ohne dass die Pipeline
 * aufgebrochen werden muss.
 */
import type { PdfPostProcessor, RenderingPipeline } from '@/domain/rendering/contracts';

import { liquidTemplateEngine } from './liquid-engine';
import { pageNumberStamp } from './page-number-stamp';
import { playwrightPdfRenderer } from './playwright-renderer';

/**
 * Führt die Nachbearbeiter der Reihe nach aus.
 *
 * Jeder bekommt das Ergebnis des vorherigen. Ein Fehler bricht die Kette ab und
 * wird durchgereicht: Ein halb nachbearbeitetes PDF auszuliefern wäre
 * schlimmer, als gar keines auszuliefern.
 */
export async function applyPostProcessors(
  pdf: Uint8Array,
  processors: readonly PdfPostProcessor[],
): Promise<Uint8Array> {
  let current = pdf;

  for (const processor of processors) {
    current = await processor.process(current);
  }

  return current;
}

export const defaultPipeline: RenderingPipeline = {
  templateEngine: liquidTemplateEngine,
  pdfRenderer: playwrightPdfRenderer,
  postProcessors: [pageNumberStamp],
};
