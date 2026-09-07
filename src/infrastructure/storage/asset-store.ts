/**
 * Ablage hochgeladener Dateien (NFA-SEC-16, Spec §11.2).
 *
 * Dateien liegen außerhalb des öffentlich ausgelieferten Verzeichnisses und
 * tragen erzeugte Namen. Der vom Benutzer gelieferte Dateiname wird
 * ausschließlich als Anzeigename gespeichert, nie als Schlüssel verwendet —
 * sonst ließe sich über `../` aus dem Verzeichnis ausbrechen.
 *
 * **Seit M17 über `FileStore`.** Ob die Bytes auf dem Dateisystem oder in einem
 * Objektspeicher landen, entscheidet `fileStore()`; die Prüfung, dass ein
 * Schlüssel sein Verzeichnis nicht verlässt, liegt beim Dateisystem-Adapter —
 * dort, wo es überhaupt ein Verzeichnis gibt, aus dem man ausbrechen könnte.
 */
import { createHash, randomUUID } from 'node:crypto';

import type { ImageType } from '@/domain/assets/image-upload';
import { extensionForImageType } from '@/domain/assets/image-upload';

import { fileStore } from './store';

export type StoredFile = {
  /** Schlüssel im Dateispeicher — nie ein absoluter Pfad. */
  readonly storagePath: string;
  readonly sha256: string;
  readonly byteSize: number;
};

/**
 * Schreibt Bytes unter einem erzeugten Namen ab.
 *
 * Erzeugter Name statt des gelieferten: schließt Pfadmanipulation und
 * Kollisionen gleichermaßen aus.
 */
async function store(bytes: Uint8Array, extension: string): Promise<StoredFile> {
  const key = `assets/${randomUUID()}.${extension}`;
  await fileStore().put(key, bytes);

  return {
    storagePath: key,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteSize: bytes.length,
  };
}

export async function storeImage(bytes: Uint8Array, type: ImageType): Promise<StoredFile> {
  return store(bytes, extensionForImageType(type));
}

/** Dieselbe Ablage für das Briefpapier (M12, FA-TPL-11). */
export async function storePdf(bytes: Uint8Array): Promise<StoredFile> {
  return store(bytes, 'pdf');
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return Buffer.from(await fileStore().get(storagePath));
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  // Eine bereits entfernte Datei ist kein Fehler — das sagt schon der Vertrag
  // des Speichers.
  await fileStore().remove(storagePath);
}
