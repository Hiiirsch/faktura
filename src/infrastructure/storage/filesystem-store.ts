/**
 * Der Dateispeicher auf dem lokalen Dateisystem (M17, B2).
 *
 * Die Vorgabe, und für eine Einzelplatzinstallation die richtige: Eine Datei
 * neben der Datenbank, mit `tar` zu sichern und ohne weiteren Dienst.
 *
 * **Geschrieben wird über eine Zwischendatei und `rename`** (FA-PDF-11, seit
 * M5). `rename` ist innerhalb eines Dateisystems unteilbar: Ein Leser sieht
 * entweder die alte Datei oder die neue, nie eine halbe. Ein abgebrochener Lauf
 * hinterlässt höchstens eine `.part`-Datei, die niemand liest.
 *
 * **Kein Pfad verlässt das Speicherverzeichnis.** `resolveInside()` prüft das
 * für jeden Schlüssel. Die Schlüssel stammen zwar aus der Datenbank und nicht
 * aus einer Anfrage — aber eine Zusage, die auf „kommt schon nicht vor" beruht,
 * ist keine, und ein manipulierter Eintrag soll nicht dazu führen, dass
 * beliebige Dateien des Servers ausgeliefert oder gelöscht werden.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getEnv } from '@/infrastructure/config/env';

import type { FileStore } from './file-store';

function storageRoot(): string {
  return path.resolve(getEnv().STORAGE_DIR);
}

/**
 * Übersetzt einen Schlüssel in einen absoluten Pfad — oder wirft.
 *
 * Der Schlüssel trägt Schrägstriche, unabhängig vom Betriebssystem; `path.join`
 * macht daraus die richtigen Trennzeichen.
 */
function resolveInside(key: string): string {
  const root = storageRoot();
  const absolutePath = path.resolve(root, ...key.split('/'));
  const relative = path.relative(root, absolutePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Pfad liegt außerhalb des Speicherverzeichnisses');
  }

  return absolutePath;
}

export const filesystemStore: FileStore = {
  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = resolveInside(key);
    const directory = path.dirname(target);
    await mkdir(directory, { recursive: true });

    const temporary = path.join(directory, `.${randomUUID()}.part`);
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  },

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(resolveInside(key)));
  },

  async remove(key: string): Promise<void> {
    await rm(resolveInside(key), { force: true });
  },

  async removePrefix(prefix: string): Promise<void> {
    // Ein Präfix ist hier ein Verzeichnis: Die Schlüssel dieser Anwendung
    // enden nie mitten in einem Namen.
    await rm(resolveInside(prefix), { recursive: true, force: true });
  },
};
