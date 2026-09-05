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
import type { PdfPostProcessor, PdfRenderer, RenderingPipeline } from '@/domain/rendering/contracts';

import { httpPdfRenderer, isRemoteRendererConfigured } from './http-renderer';
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

/**
 * Wer setzt (M17, B3).
 *
 * Ohne `RENDERER_URL` läuft Chromium im eigenen Prozess, wie seit M5. Mit ihr
 * geht der Auftrag an einen eigenen Dienst — nötig überall dort, wo die
 * Anwendungsinstanz die Fähigkeiten für die Chromium-Sandbox nicht bekommen
 * kann.
 *
 * Entschieden wird **einmal**: Ein Wechsel zur Laufzeit gäbe es nicht, wohl
 * aber die Frage, welcher Renderer einen bestimmten Beleg gesetzt hat.
 *
 * **Die Nachbearbeiter bleiben hier.** Der Seitenstempel und das Briefpapier
 * laufen in der Anwendung, nicht im Renderdienst: Sie brauchen kein Chromium,
 * und das Briefpapier gehört einem Mandanten — ein Dienst, der es kennte,
 * müsste Mandanten kennen.
 */
let renderer: PdfRenderer | undefined;

function pdfRenderer(): PdfRenderer {
  renderer ??= isRemoteRendererConfigured() ? httpPdfRenderer : playwrightPdfRenderer;
  return renderer;
}

/** Setzt die Wahl zurück — ausschließlich für Tests, die beide Wege prüfen. */
export function resetPdfRenderer(): void {
  renderer = undefined;
}

export const defaultPipeline: RenderingPipeline = {
  templateEngine: liquidTemplateEngine,
  // Als Zugriff und nicht als Wert: Die Umgebung steht beim Import des Moduls
  // noch nicht fest (M0 — Module dürfen keine Seiteneffekte haben).
  get pdfRenderer(): PdfRenderer {
    return pdfRenderer();
  },
  postProcessors: [pageNumberStamp],
};
