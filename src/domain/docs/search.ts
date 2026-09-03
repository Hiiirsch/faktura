/**
 * Die Suche im Handbuch (M16, FA-DOC-03).
 *
 * **In der Domäne und nicht in der Anwendungsschicht.** Sie liest keine
 * Datenbank, kennt keinen Mandanten und braucht keine Sitzung: Der Index liegt
 * als Modul vor, die Suche ist eine reine Funktion über ihm. Damit ist sie ohne
 * Aufbau prüfbar — und die Seite darf sie unmittelbar aufrufen
 * (`app → domain`).
 *
 * **Serverseitig und ohne Client-Bündel.** Das Suchfeld ist ein
 * `GET`-Formular; die Seite liest `?suche=` und setzt die Treffer. Damit
 * funktioniert die Suche ohne JavaScript, es gibt keinen Suchindex im Browser
 * und keine Änderung an der Content-Security-Policy. Eine Volltextsuche über
 * WebAssembly hätte `'wasm-unsafe-eval'` verlangt — genau das, was für pdf.js
 * bewusst vermieden wurde.
 */

/** Ein durchsuchbarer Abschnitt des Handbuchs. */
export type HelpIndexEntry = {
  readonly topicId: string;
  readonly topicTitle: string;
  readonly heading: string;
  readonly text: string;
};

export type HelpSearchResult = {
  readonly topicId: string;
  readonly topicTitle: string;
  readonly heading: string;
  /** Der Ausschnitt um die erste Fundstelle. */
  readonly excerpt: string;
};

/** Wie viele Zeichen um die Fundstelle herum ein Ausschnitt zeigt. */
const EXCERPT_RADIUS = 90;

/** Mehr Treffer liest ohnehin niemand; die Liste soll eine Auswahl bleiben. */
const MAX_RESULTS = 20;

/**
 * Vereinheitlicht für den Vergleich.
 *
 * Umlaute werden zerlegt und ihre Zeichen entfernt: Wer „Vorlagen" sucht, soll
 * „Übersicht" nicht verpassen, und wer „ueberfaellig" tippt, findet
 * „überfällig" trotzdem nicht — dafür bräuchte es eine Ersetzungstabelle, und
 * die wäre eine zweite Vorstellung von deutscher Rechtschreibung. Was hier
 * gelöst wird, ist der häufige Fall: Groß- und Kleinschreibung sowie Akzente.
 */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('de');
}

/**
 * Schneidet einen Ausschnitt um die Fundstelle.
 *
 * An Wortgrenzen gekürzt, damit kein halbes Wort am Rand steht — ein
 * abgeschnittenes „Rechnungsnu" liest sich wie ein Fehler.
 */
function excerptAround(text: string, position: number): string {
  if (text.length <= EXCERPT_RADIUS * 2) {
    return text;
  }

  const rawStart = Math.max(0, position - EXCERPT_RADIUS);
  const rawEnd = Math.min(text.length, position + EXCERPT_RADIUS);

  const start = rawStart === 0 ? 0 : text.indexOf(' ', rawStart) + 1;
  const end = rawEnd === text.length ? text.length : text.lastIndexOf(' ', rawEnd);

  const middle = text.slice(start, end).trim();

  return `${start > 0 ? '… ' : ''}${middle}${end < text.length ? ' …' : ''}`;
}

/**
 * Sucht im Handbuch.
 *
 * Gesucht wird nach **allen** Wörtern der Anfrage: Ein Abschnitt zählt als
 * Treffer, wenn jedes von ihnen darin vorkommt. Das ist die Erwartung, die
 * jemand aus jeder Suchmaske mitbringt — und es macht die Anfrage mit jedem
 * weiteren Wort enger statt breiter.
 *
 * Überschrift und Titel des Themas zählen mit: Wer „Mahnung" sucht, soll den
 * Abschnitt auch dann finden, wenn im Fließtext nur „sie" steht.
 */
export function searchHelp(
  index: readonly HelpIndexEntry[],
  query: string,
): readonly HelpSearchResult[] {
  const terms = normalize(query)
    .split(/\s+/u)
    .filter((term) => term.length > 0);

  if (terms.length === 0) {
    return [];
  }

  const results: HelpSearchResult[] = [];

  for (const entry of index) {
    const haystack = normalize(`${entry.topicTitle} ${entry.heading} ${entry.text}`);
    if (!terms.every((term) => haystack.includes(term))) {
      continue;
    }

    /*
     * Der Ausschnitt zeigt die Fundstelle des **ersten** Wortes im Fließtext.
     * Steht es nur in der Überschrift, beginnt der Ausschnitt vorn — dann ist
     * der Anfang des Abschnitts die beste Auskunft, die es gibt.
     */
    const firstTerm = terms[0] ?? '';
    const position = normalize(entry.text).indexOf(firstTerm);

    results.push({
      topicId: entry.topicId,
      topicTitle: entry.topicTitle,
      heading: entry.heading,
      excerpt: excerptAround(entry.text, position < 0 ? 0 : position),
    });

    if (results.length >= MAX_RESULTS) {
      break;
    }
  }

  return results;
}
