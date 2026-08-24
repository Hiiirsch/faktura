/**
 * Ablage hochgeladener Dateien (NFA-SEC-16, Spec §11.2).
 *
 * Dateien liegen außerhalb des öffentlich ausgelieferten Verzeichnisses und
 * tragen erzeugte Namen. Der vom Benutzer gelieferte Dateiname wird
 * ausschließlich als Anzeigename gespeichert, nie als Pfad verwendet — sonst
 * ließe sich über `../` aus dem Verzeichnis ausbrechen.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ImageType } from '@/domain/assets/image-upload';
import { extensionForImageType } from '@/domain/assets/image-upload';
import { getEnv } from '@/infrastructure/config/env';

export type StoredFile = {
  /** Pfad relativ zum Speicherverzeichnis — nie ein absoluter Pfad. */
  readonly storagePath: string;
  readonly sha256: string;
  readonly byteSize: number;
};

function storageRoot(): string {
  return path.resolve(getEnv().STORAGE_DIR);
}

function assetDirectory(): string {
  return path.join(storageRoot(), 'assets');
}

/**
 * Schreibt Bytes unter einem erzeugten Namen ab.
 *
 * Erzeugter Name statt des gelieferten: schließt Pfadmanipulation und
 * Kollisionen gleichermaßen aus.
 */
async function store(bytes: Uint8Array, extension: string): Promise<StoredFile> {
  const directory = assetDirectory();
  await mkdir(directory, { recursive: true });

  const fileName = `${randomUUID()}.${extension}`;
  const absolutePath = path.join(directory, fileName);

  await writeFile(absolutePath, bytes);

  return {
    storagePath: path.join('assets', fileName),
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

/**
 * Liest eine abgelegte Datei. Der Pfad wird gegen das Speicherverzeichnis
 * geprüft: Ein manipulierter Eintrag in der Datenbank soll nicht dazu führen,
 * dass beliebige Dateien des Servers ausgeliefert werden.
 */
export async function readStoredFile(storagePath: string): Promise<Buffer> {
  const root = assetDirectory();
  const absolutePath = path.resolve(storageRoot(), storagePath);
  const relative = path.relative(root, absolutePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Pfad liegt außerhalb des Speicherverzeichnisses');
  }

  return readFile(absolutePath);
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  const absolutePath = path.resolve(storageRoot(), storagePath);
  const relative = path.relative(assetDirectory(), absolutePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return;
  }

  try {
    await unlink(absolutePath);
  } catch {
    // Eine bereits entfernte Datei ist kein Fehler.
  }
}
