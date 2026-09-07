/**
 * Welcher Dateispeicher benutzt wird (M17, B2).
 *
 * **Ohne Konfiguration bleibt es beim Dateisystem** — dieselbe Bauart wie beim
 * Mailversand seit M14: „nicht eingerichtet" ist ein Zustand, keine Ausnahme.
 * Eine Einzelplatzinstallation merkt von der Möglichkeit nichts, und ihre
 * Sicherung bleibt ein `tar` über ein Verzeichnis.
 *
 * Entschieden wird **einmal** und nicht bei jedem Aufruf: Ein Wechsel zur
 * Laufzeit gäbe es nicht, wohl aber die Frage, ob eine Datei vielleicht im
 * jeweils anderen Speicher liegt.
 */
import type { FileStore } from './file-store';
import { filesystemStore } from './filesystem-store';
import { isObjectStoreConfigured, s3Store } from './s3-store';

let store: FileStore | undefined;

export function fileStore(): FileStore {
  store ??= isObjectStoreConfigured() ? s3Store : filesystemStore;
  return store;
}

/** Setzt die Wahl zurück — ausschließlich für Tests, die beide Adapter prüfen. */
export function resetFileStore(): void {
  store = undefined;
}
