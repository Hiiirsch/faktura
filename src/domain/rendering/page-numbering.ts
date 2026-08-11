/**
 * Seitenangabe auf mehrseitigen Belegen (FA-PDF-06).
 *
 * **Erst ab Seite 2.** Auf einem einseitigen Beleg ist „Seite 1 von 1" eine
 * Auskunft ohne Empfänger — sie beantwortet eine Frage, die sich niemand
 * stellt, und lässt den Beleg nach Formular aussehen. DIN 5008 sieht
 * Seitennummern ebenfalls nur für Folgeblätter vor, und die verbreiteten
 * Rechnungsprogramme halten es genauso.
 *
 * Ursprünglich verlangte FA-PDF-06 die Angabe auf *jeder* Seite; die Änderung
 * ist vom Auftraggeber am 11.08.2026 freigegeben.
 *
 * Die Regel steht in der Domain und nicht beim Renderer, weil sie fachlich ist:
 * Sie gilt unabhängig davon, ob das PDF von Chromium, von einem
 * Nachbearbeiter oder später von etwas ganz anderem gesetzt wird.
 */

/** Ab welcher Seite eine Nummer erscheint. */
export const FIRST_NUMBERED_PAGE = 2;

/** Ein einseitiger Beleg bekommt keine Seitenangabe. */
export function needsPageNumbers(totalPages: number): boolean {
  return totalPages >= FIRST_NUMBERED_PAGE;
}

/**
 * Die Seitenzahlen, die eine Angabe tragen — eins-basiert.
 *
 * Gibt die Liste zurück statt eines Bereichs: Der Aufrufer läuft ohnehin über
 * Seiten, und eine Liste lässt sich prüfen, ohne die Regel nachzubauen.
 */
export function numberedPages(totalPages: number): readonly number[] {
  if (!needsPageNumbers(totalPages)) {
    return [];
  }

  return Array.from(
    { length: totalPages - FIRST_NUMBERED_PAGE + 1 },
    (_, index) => index + FIRST_NUMBERED_PAGE,
  );
}

export function pageNumberLabel(page: number, totalPages: number): string {
  return `Seite ${String(page)} von ${String(totalPages)}`;
}
