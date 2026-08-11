/**
 * Dateiname erzeugter Belegdateien (FA-PDF-09).
 *
 * Das Muster ist konfigurierbar, weil der Dateiname beim Empfänger im
 * Posteingang und in dessen Buchhaltung landet: „Rechnung_2026-0044.pdf" ist
 * dort brauchbar, „download.pdf" nicht.
 *
 * Der erzeugte Name wird anschließend hart gefiltert. Er stammt aus
 * Firmendaten und Kundennamen, wandert in einen `Content-Disposition`-Header
 * und schlägt beim Empfänger als Datei auf — beides Stellen, an denen ein
 * Schrägstrich, ein Zeilenumbruch oder ein Anführungszeichen nichts zu suchen
 * hat.
 */

export const DEFAULT_FILE_NAME_PATTERN = '{NUMBER}';

export type FileNameInput = {
  /** Belegnummer; bei einem Entwurf noch nicht vergeben. */
  readonly invoiceNumber: string | null;
  /** Kalendertag `YYYY-MM-DD`. */
  readonly issueDate: string | null;
  readonly customerName: string;
  readonly documentTypeLabel: string;
};

/**
 * Die verfügbaren Platzhalter, wie sie die Oberfläche dokumentiert.
 *
 * Bewusst wenige: Ein Dateiname, der zehn Angaben zusammensetzt, ist keiner
 * mehr.
 */
export const FILE_NAME_PLACEHOLDERS = [
  '{NUMBER}',
  '{YYYY}',
  '{MM}',
  '{DD}',
  '{CUSTOMER}',
  '{TYPE}',
] as const;

/**
 * Entfernt alles, was in einem Dateinamen Schaden anrichten oder ihn
 * unbrauchbar machen kann.
 *
 * Erlaubt bleiben Buchstaben (auch Umlaute), Ziffern, Punkt, Unterstrich und
 * Bindestrich. Führende Punkte fallen weg — eine Datei, die auf einem
 * Unix-System als versteckt ankommt, ist ein Ärgernis ohne Nutzen.
 */
function sanitize(value: string): string {
  const collapsed = value
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}._-]/gu, '')
    .replace(/^\.+/, '')
    .slice(0, 120);

  return collapsed.length === 0 ? 'Beleg' : collapsed;
}

export function buildFileName(pattern: string, input: FileNameInput): string {
  const issueDate = input.issueDate ?? '';

  const replacements: Readonly<Record<string, string>> = {
    '{NUMBER}': input.invoiceNumber ?? 'Entwurf',
    '{YYYY}': issueDate.slice(0, 4),
    '{MM}': issueDate.slice(5, 7),
    '{DD}': issueDate.slice(8, 10),
    '{CUSTOMER}': input.customerName,
    '{TYPE}': input.documentTypeLabel,
  };

  const replaced = pattern.replace(
    /\{(?:NUMBER|YYYY|MM|DD|CUSTOMER|TYPE)\}/g,
    (placeholder) => replacements[placeholder] ?? '',
  );

  return `${sanitize(replaced)}.pdf`;
}

/**
 * Ein Muster ist gültig, wenn es mindestens einen bekannten Platzhalter
 * enthält und keinen unbekannten.
 *
 * Die erste Bedingung verhindert, dass alle Belege denselben Dateinamen
 * bekommen und sich beim Empfänger gegenseitig überschreiben; die zweite fängt
 * den Tippfehler ab, der sonst als Text im Dateinamen stünde.
 */
export function isValidFileNamePattern(pattern: string): boolean {
  const known = FILE_NAME_PLACEHOLDERS.map(String);
  const used = [...pattern.matchAll(/\{[^}]*\}/g)].map((match) => match[0]);

  return used.length > 0 && used.every((placeholder) => known.includes(placeholder));
}
