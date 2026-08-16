/**
 * Ein minimaler tar-Schreiber (ustar).
 *
 * **Warum von Hand und nicht als Abhängigkeit.** Eine Sicherung ist das
 * Bauteil, dessen Ausgabe man Jahre später noch lesen können muss — womöglich
 * ohne diese Anwendung, auf einem fremden Rechner, unter Zeitdruck. `tar` ist
 * dafür das richtige Format, weil es überall vorhanden ist; ein Paket dafür
 * wäre eine weitere Stelle, an der eine Sicherung scheitern kann, und sein
 * Nutzen beschränkte sich auf die hundert Zeilen hier.
 *
 * **Warum nicht das Kommando `tar` aufrufen.** Der Weg über `child_process`
 * setzt voraus, dass das Werkzeug im Container liegt, und macht die Erzeugung
 * vom Dateisystem abhängig — die Sicherung soll aber auch als Strom an den
 * Browser gehen können, ohne vorher irgendwo zu landen (NFA-BETR-05).
 *
 * Geschrieben wird die ustar-Variante: 512-Byte-Kopf je Eintrag, Inhalt auf
 * 512 Byte aufgefüllt, zwei Nullblöcke am Ende. Nicht unterstützt sind
 * Verknüpfungen, Sonderdateien und Pfade über 100 Zeichen — nichts davon
 * kommt in einer Sicherung dieser Anwendung vor, und ein stiller Fehlschlag
 * wäre schlimmer als eine klare Grenze: `tarEntry()` wirft, statt zu kürzen.
 */

const BLOCK_SIZE = 512;
/** ustar begrenzt den Namen auf 100 Zeichen; das Präfixfeld nutzen wir nicht. */
const MAX_NAME_LENGTH = 100;

export type TarEntry = {
  /** Pfad im Archiv, mit `/` getrennt, ohne führenden Schrägstrich. */
  readonly name: string;
  readonly content: Uint8Array;
  /** Zeitpunkt der letzten Änderung; fehlt er, gilt der Erzeugungszeitpunkt. */
  readonly mtime?: Date;
};

function writeString(block: Uint8Array, offset: number, value: string, length: number): void {
  const bytes = new TextEncoder().encode(value);
  block.set(bytes.subarray(0, length), offset);
}

/** Zahlenfelder in tar sind oktal, nullgefüllt und mit `\0` abgeschlossen. */
function writeOctal(block: Uint8Array, offset: number, value: number, length: number): void {
  const text = value.toString(8).padStart(length - 1, '0');
  writeString(block, offset, text, length - 1);
}

function header(entry: TarEntry, now: Date): Uint8Array {
  if (entry.name.length > MAX_NAME_LENGTH) {
    throw new Error(`Pfad zu lang für tar (max. ${String(MAX_NAME_LENGTH)}): ${entry.name}`);
  }

  const block = new Uint8Array(BLOCK_SIZE);

  writeString(block, 0, entry.name, MAX_NAME_LENGTH);
  writeOctal(block, 100, 0o644, 8); // Rechte
  writeOctal(block, 108, 0, 8); // Besitzer
  writeOctal(block, 116, 0, 8); // Gruppe
  writeOctal(block, 124, entry.content.length, 12);
  writeOctal(block, 136, Math.floor((entry.mtime ?? now).getTime() / 1000), 12);
  writeString(block, 156, '0', 1); // Typ: gewöhnliche Datei
  writeString(block, 257, 'ustar', 6);
  writeString(block, 263, '00', 2);

  // Die Prüfsumme wird über den Kopf gebildet, wobei ihr eigenes Feld als
  // Leerzeichen gilt — deshalb erst füllen, dann rechnen, dann eintragen.
  block.fill(0x20, 148, 156);
  let checksum = 0;
  for (const byte of block) {
    checksum += byte;
  }
  writeOctal(block, 148, checksum, 7);
  writeString(block, 155, '\0', 1);

  return block;
}

function padding(length: number): number {
  const remainder = length % BLOCK_SIZE;
  return remainder === 0 ? 0 : BLOCK_SIZE - remainder;
}

/** Ein einzelner Archiveintrag: Kopf, Inhalt, Auffüllung. */
export function tarEntry(entry: TarEntry, now: Date = new Date()): Uint8Array {
  const pad = padding(entry.content.length);
  const result = new Uint8Array(BLOCK_SIZE + entry.content.length + pad);

  result.set(header(entry, now), 0);
  result.set(entry.content, BLOCK_SIZE);

  return result;
}

/** Der Abschluss: zwei Nullblöcke. */
export function tarEnd(): Uint8Array {
  return new Uint8Array(BLOCK_SIZE * 2);
}

/** Baut ein vollständiges Archiv im Speicher. */
export function createTar(entries: readonly TarEntry[], now: Date = new Date()): Uint8Array {
  const blocks = [...entries.map((entry) => tarEntry(entry, now)), tarEnd()];
  const total = blocks.reduce((sum, block) => sum + block.length, 0);

  const archive = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    archive.set(block, offset);
    offset += block.length;
  }

  return archive;
}
