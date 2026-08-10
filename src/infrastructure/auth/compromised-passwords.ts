/**
 * Liste bekannter kompromittierter Passwörter (NFA-SEC-04).
 *
 * Die Prüfung läuft ausschließlich lokal gegen eine mitgelieferte Datei. Eine
 * Abfrage an einen Dienst wie „Have I Been Pwned" schiede aus: Die Anwendung
 * überträgt keine Daten an Dritte und muss ohne ausgehende Internetverbindung
 * funktionieren (NFA-COMP-05).
 *
 * Quelle: SecLists, `Passwords/Common-Credentials/Pwdb_top-100000.txt` —
 * die 100.000 häufigsten Passwörter aus veröffentlichten Leaks.
 *
 * Die Liste wird beim ersten Bedarf geladen und im Speicher gehalten. Das
 * kostet einmalig gut zehn Megabyte und macht jede weitere Prüfung zu einem
 * Nachschlagen in einer Hashmenge.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LIST_PATH = path.join(process.cwd(), 'resources', 'compromised-passwords.txt');

let entries: ReadonlySet<string> | undefined;

function loadEntries(): ReadonlySet<string> {
  if (entries !== undefined) {
    return entries;
  }

  const contents = readFileSync(LIST_PATH, 'utf8');
  const loaded = new Set<string>();
  for (const line of contents.split('\n')) {
    const password = line.trim();
    if (password.length > 0) {
      loaded.add(password);
    }
  }

  entries = loaded;
  return loaded;
}

/**
 * Prüft ein Passwort gegen die Liste — exakt und zusätzlich in Kleinschreibung.
 * Der zweite Vergleich fängt Varianten wie „Passwort123" ab, deren Kleinform in
 * den Leaks steht: Großschreibung des ersten Buchstabens erhöht die Sicherheit
 * gegenüber einem Wörterbuchangriff praktisch nicht.
 */
export function isCompromisedPassword(candidate: string): boolean {
  const list = loadEntries();
  return list.has(candidate) || list.has(candidate.toLowerCase());
}

/** Anzahl der geladenen Einträge — für Diagnose und Tests. */
export function compromisedPasswordCount(): number {
  return loadEntries().size;
}
