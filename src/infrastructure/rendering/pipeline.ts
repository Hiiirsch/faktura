/**
 * Die zusammengesetzte Ausgabe-Pipeline (NFA-ARCH-06, Spec §3.2).
 *
 *     InvoiceDocument → TemplateEngine → PdfRenderer → PdfPostProcessor[] → PDF
 *
 * Die Kette der Nachbearbeiter ist in V1 **leer**, und das ist kein Versehen:
 * ZUGFeRD hängt sich später als zwei Prozessoren ein — PDF/A-Konvertierung und
 * XML-Einbettung —, ohne dass an dieser Stelle etwas aufgebrochen werden muss.
 * Eine leere Kette, die durchlaufen wird, ist der Unterschied zwischen einem
 * vorgesehenen Erweiterungspunkt und einem, den man später erst einbaut.
 */
import type { PdfPostProcessor, RenderingPipeline } from '@/domain/rendering/contracts';

import { liquidTemplateEngine } from './liquid-engine';
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
  postProcessors: [],
};
