/**
 * Seitenangabe als Nachbearbeitungsschritt (FA-PDF-06, NFA-ARCH-06).
 *
 * Chromium kann die Angabe zwar selbst setzen (`footerTemplate`), aber nicht
 * abhängig von der Seitenzahl: Es fügt `pageNumber` und `totalPages` erst beim
 * Drucken als Text ein, und in der Fußzeile lässt sich darauf nicht
 * verzweigen. Für „erst ab Seite 2" muss die Gesamtzahl vorher bekannt sein —
 * also nachher.
 *
 * Deshalb hier, in der Kette, die genau dafür vorgesehen ist: Das fertige PDF
 * kommt herein, die Angabe wird auf die Folgeseiten geschrieben, das PDF geht
 * hinaus. Zugleich der erste tatsächliche Nachbearbeiter — bis hierhin war die
 * Kette leer und ihr Nutzen eine Behauptung.
 *
 * Gesetzt wird in Helvetica aus dem PDF-Standardsatz. Sie muss nicht
 * eingebettet werden und ist in jedem Betrachter vorhanden; für sechs Wörter
 * am Blattfuß wären weitere 30 kB eingebettete Schrift je Beleg nicht
 * gerechtfertigt.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import {
  needsPageNumbers,
  numberedPages,
  pageNumberLabel,
} from '@/domain/rendering/page-numbering';
import type { PdfPostProcessor } from '@/domain/rendering/contracts';

/** Abstand der Grundlinie vom unteren Blattrand, in Punkt (1 mm ≈ 2,835 pt). */
const BASELINE_FROM_BOTTOM_PT = 34;

/** Abstand vom rechten Blattrand, in Punkt — bündig mit dem Satzspiegel. */
const RIGHT_MARGIN_PT = 57;

const FONT_SIZE_PT = 7;

/** `--ink-muted` des Belegs: die Angabe ist Beiwerk, nicht Inhalt. */
const INK_MUTED = rgb(0x5c / 255, 0x62 / 255, 0x5c / 255);

export const pageNumberStamp: PdfPostProcessor = {
  name: 'page-number',

  async process(pdf: Uint8Array): Promise<Uint8Array> {
    const document = await PDFDocument.load(pdf);
    const pages = document.getPages();

    if (!needsPageNumbers(pages.length)) {
      // Einseitiger Beleg: unverändert zurück. Bewusst dieselben Bytes und
      // nicht ein neu geschriebenes PDF — sonst hinge der Hash des Artefakts
      // an der Version von pdf-lib.
      return pdf;
    }

    const font = await document.embedFont(StandardFonts.Helvetica);

    for (const pageNumber of numberedPages(pages.length)) {
      const page = pages[pageNumber - 1];
      if (page === undefined) {
        continue;
      }

      const text = pageNumberLabel(pageNumber, pages.length);
      const width = font.widthOfTextAtSize(text, FONT_SIZE_PT);

      page.drawText(text, {
        x: page.getWidth() - RIGHT_MARGIN_PT - width,
        y: BASELINE_FROM_BOTTOM_PT,
        size: FONT_SIZE_PT,
        font,
        color: INK_MUTED,
      });
    }

    // `useObjectStreams: false`: Der Inhalt bleibt im Klartext lesbar. Das
    // kostet wenige hundert Byte und macht das Ergebnis prüfbar, ohne einen
    // PDF-Parser in den Test zu holen.
    return document.save({ useObjectStreams: false });
  },
};
