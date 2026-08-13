/**
 * Liest den gesetzten Text aus einem PDF — für Tests.
 *
 * Ein PDF legt seinen Text in Inhaltsströmen ab, und die sind in aller Regel
 * mit Flate komprimiert; eine Suche in den Rohbytes findet deshalb nichts.
 * Diese Hilfsfunktion entpackt alle Ströme, die sich entpacken lassen, und gibt
 * ihren Inhalt zurück.
 *
 * Bewusst ohne PDF-Bibliothek: Gebraucht wird nicht ein Parser, sondern die
 * Antwort auf die Frage „steht dieser Satz im Dokument". Ein vollständiger
 * Parser im Test würde mehr Annahmen mitbringen als die Prüfung selbst.
 */
import { inflateSync } from 'node:zlib';

const STREAM_START = Buffer.from('stream');
const STREAM_END = Buffer.from('endstream');

/**
 * Entpackt alle Inhaltsströme und hängt sie aneinander.
 *
 * Ströme, die sich nicht entpacken lassen — Bilder, Schriften, unbekannte
 * Filter —, werden übergangen. Sie enthalten keinen gesetzten Text.
 */
export function extractPdfText(pdf: Uint8Array): string {
  const bytes = Buffer.from(pdf);
  const parts: string[] = [];

  let position = 0;

  while (position < bytes.length) {
    const start = bytes.indexOf(STREAM_START, position);
    if (start === -1) {
      break;
    }

    const end = bytes.indexOf(STREAM_END, start);
    if (end === -1) {
      break;
    }

    // Nach `stream` folgt ein Zeilenumbruch, der nicht zum Inhalt gehört.
    let contentStart = start + STREAM_START.length;
    if (bytes[contentStart] === 0x0d) contentStart += 1;
    if (bytes[contentStart] === 0x0a) contentStart += 1;

    const chunk = bytes.subarray(contentStart, end);

    try {
      parts.push(inflateSync(chunk).toString('latin1'));
    } catch {
      // Kein Flate-Strom oder beschädigt — für die Textsuche ohne Belang.
      parts.push(chunk.toString('latin1'));
    }

    position = end + STREAM_END.length;
  }

  return parts.join('\n');
}

/**
 * Der gesetzte Text eines PDF.
 *
 * PDF kennt zwei Schreibweisen für Textliterale: in Klammern `(Text)` und
 * hexadezimal `<54657874>`. pdf-lib verwendet die zweite, Chromium die erste —
 * gelesen werden deshalb beide.
 */
export function pdfShownText(pdf: Uint8Array): string {
  const streams = extractPdfText(pdf);

  const literals = [...streams.matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((match) =>
    (match[1] ?? '').replace(/\\([()\\])/g, '$1'),
  );

  const hex = [...streams.matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((match) => {
    const digits = (match[1] ?? '').replace(/\s/g, '');
    const characters: string[] = [];
    for (let index = 0; index + 1 < digits.length; index += 2) {
      characters.push(String.fromCharCode(Number.parseInt(digits.slice(index, index + 2), 16)));
    }
    return characters.join('');
  });

  return [...literals, ...hex].join('\n');
}

/**
 * Ob ein Satz im Dokument steht.
 *
 * Verglichen wird **ohne Leerraum** — auf beiden Seiten. Der Grund liegt im
 * Format: Ein Satz landet nicht als ein Stück im PDF, sondern als Folge von
 * Anzeigebefehlen, die der Setzer nach Belieben schneidet. Zwischen zwei
 * Tabellenzellen steht dann kein Leerzeichen, wo im Beleg eines zu sehen ist.
 * Ein Vergleich Zeichen für Zeichen würde daran scheitern, ohne dass am Beleg
 * etwas falsch wäre.
 *
 * Innerhalb eines Wortes schneidet Chromium bei lateinischer Schrift nicht —
 * darauf beruht die Prüfung.
 */
export function pdfContainsText(pdf: Uint8Array, needle: string): boolean {
  const withoutSpace = (value: string): string => value.replace(/\s/gu, '');
  return withoutSpace(pdfShownText(pdf)).includes(withoutSpace(needle));
}
