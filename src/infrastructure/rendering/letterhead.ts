/**
 * Das Briefpapier als Nachbearbeitungsschritt (M12, FA-TPL-11, NFA-ARCH-06).
 *
 * Der Bogen liegt **unter** dem Beleg: Erst wird das Briefpapier auf eine neue
 * Seite gezeichnet, dann der gesetzte Beleg darüber. Chromium malt keinen
 * weißen Grund — am erzeugten PDF nachgestellt, das einzige `background` im
 * Standard-CSS ist die Kopfleiste der Positionstabelle —, deshalb scheint der
 * Bogen vollständig durch.
 *
 * **Warum ein Abschluss und keine Erweiterung des Vertrags.**
 * `PdfPostProcessor.process(pdf)` bekommt nur das PDF und keinen Zusammenhang.
 * Das Briefpapier hängt aber am Unternehmen — und bei einem festgeschriebenen
 * Beleg am Tag seiner Ausstellung. Statt den Vertrag um einen Kontext zu
 * erweitern, den kein anderer Prozessor braucht, entsteht dieser hier **je
 * Beleg** über die schon geladenen Bytes. Die Kette wird damit pro Lauf
 * zusammengesetzt statt einmal beim Start.
 *
 * **Reihenfolge: vor dem Seitenstempel.** Der Stempel schreibt auf das fertige
 * Blatt. Andersherum läge die Seitenangabe unter dem Briefpapier und wäre auf
 * einem deckenden Bogen unsichtbar.
 *
 * **Was das kostet.** Mit Briefpapier läuft jedes PDF durch pdf-lib, und die
 * Zusage des Seitenstempels — ein einseitiges PDF kommt bytegleich zurück —
 * gilt für diesen Beleg nicht mehr. Das ist hinnehmbar, weil der Hash **nach**
 * der Kette gebildet wird: Was abgelegt wird, ist das Blatt mit dem Bogen.
 * Außerdem steckt das Briefpapier in jedem Beleg; ein schwerer Bogen
 * vervielfacht sich über alle Rechnungen.
 */
import { PDFDocument, type PDFPage } from 'pdf-lib';

import type { PdfPostProcessor } from '@/domain/rendering/contracts';
import { logger } from '@/infrastructure/logging/logger';

/**
 * Baut den Nachbearbeiter für **ein** Briefpapier.
 *
 * Schlägt das Lesen des Bogens fehl, kommt der Beleg unverändert zurück und
 * nicht gar nicht: Dieselbe Regel wie beim Logo — ein Beleg soll nicht an
 * einem Bild scheitern. Der Fehlschlag steht im Log.
 */
export function letterheadBackground(letterhead: Uint8Array): PdfPostProcessor {
  return {
    name: 'letterhead',

    async process(pdf: Uint8Array): Promise<Uint8Array> {
      try {
        const source = await PDFDocument.load(pdf);
        const bogen = await PDFDocument.load(letterhead);

        const [bogenSeite] = await source.embedPdf(bogen, [0]);
        if (bogenSeite === undefined) {
          return pdf;
        }

        for (const page of source.getPages()) {
          const { width, height } = page.getSize();

          /*
           * Der Bogen wird auf das Blattmaß gezogen, nicht mittig gesetzt.
           *
           * Beim Hochladen ist A4 mit 2 mm Spielraum verlangt; innerhalb dieses
           * Spielraums ist Strecken die richtige Antwort — ein zentrierter Bogen
           * ließe an einer Kante einen weißen Streifen, und genau der fiele auf.
           */
          page.drawPage(bogenSeite, { x: 0, y: 0, width, height });

          /*
           * **Ganz nach unten.** `drawPage` hängt den Inhalt hinten an die
           * Zeichenliste, also über den Beleg. Ein Bogen mit Farbfläche
           * verdeckte damit den Text. Der Aufruf verschiebt die eben angehängte
           * Operation an den Anfang.
           */
          moveLastOperationToBack(page);
        }

        return await source.save();
      } catch (error) {
        logger.warn('letterhead.not_applied', { error });
        return pdf;
      }
    },
  };
}

/**
 * Schiebt die zuletzt gezeichnete Ebene unter alles andere.
 *
 * pdf-lib kennt keine Ebenenordnung; es hängt jede Zeichenoperation an den
 * Inhaltsstrom der Seite an. Was zuletzt kommt, liegt oben. Für einen
 * Hintergrund ist das die falsche Richtung, und ein zweiter Weg — den Beleg auf
 * ein neues Dokument mit dem Bogen zu kopieren — verlöre die Seitenobjekte
 * samt allem, was ein späterer Prozessor daran erwartet.
 */
function moveLastOperationToBack(page: PDFPage): void {
  const contents = page.node.normalizedEntries().Contents;

  if (contents === undefined || contents.size() < 2) {
    return;
  }

  const last = contents.get(contents.size() - 1);
  if (last === undefined) {
    return;
  }

  contents.remove(contents.size() - 1);
  contents.insert(0, last);
}
