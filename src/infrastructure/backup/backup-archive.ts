/**
 * Die Sicherung als ein Archiv (NFA-BETR-03, -04, -05, -07).
 *
 * Ein `.tar.gz` mit zwei Teilen:
 *
 * ```
 * faktura.db          konsistenter Abzug der Datenbank (VACUUM INTO)
 * storage/…           Dateien: Belegarchive, Logos, hochgeladene Bilder
 * ```
 *
 * **Beides gehört zusammen.** Eine Datenbank ohne die abgelegten PDFs ist
 * keine wiederherstellbare Sicherung: Ein festgeschriebener Beleg verweist auf
 * seine Datei mitsamt Hash (FA-TPL-09), und ohne sie fehlte genau das
 * Dokument, dessen Unveränderlichkeit die ganze Bauart begründet
 * (NFA-BETR-07).
 *
 * **Reihenfolge mit Absicht:** erst der Datenbankabzug, dann die Dateien. Eine
 * Datei, die zwischen beiden Schritten hinzukommt, landet im Archiv, ohne dass
 * die Datenbank sie kennt — das ist eine verwaiste Datei und schadet nicht.
 * Umgekehrt wäre es ein Verweis ins Leere.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { getEnv } from '@/infrastructure/config/env';
import { createDatabaseSnapshot } from '@/infrastructure/db/backup';
import { logger } from '@/infrastructure/logging/logger';

import { createTar, type TarEntry } from './tar';

/** Der Name der Datenbank im Archiv. */
export const DATABASE_ENTRY_NAME = 'faktura.db';
/** Präfix aller Dateien im Archiv. */
export const STORAGE_ENTRY_PREFIX = 'storage/';

export type Backup = {
  readonly fileName: string;
  readonly bytes: Uint8Array;
  /** Wie viele Dateien neben der Datenbank enthalten sind. */
  readonly fileCount: number;
};

/**
 * Alle Dateien unterhalb von `root`, mit ihrem Pfad relativ dazu.
 *
 * Rekursiv und ohne Symlinks zu folgen: Ein Verweis nach außen holte Dateien
 * ins Archiv, die nicht zur Anwendung gehören.
 */
async function collectFiles(root: string, prefix = ''): Promise<readonly TarEntry[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    // Kein Dateispeicher angelegt — eine frische Installation hat noch keinen.
    return [];
  }

  const files: TarEntry[] = [];

  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    const relative = `${prefix}${entry.name}`;

    if (entry.isSymbolicLink()) {
      logger.warn('backup.symlink_skipped', { path: relative });
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolute, `${relative}/`)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const info = await stat(absolute);
    files.push({
      name: `${STORAGE_ENTRY_PREFIX}${relative}`,
      content: new Uint8Array(await readFile(absolute)),
      mtime: info.mtime,
    });
  }

  return files;
}

/** Der Dateiname trägt den Zeitpunkt — sortierbar und ohne Doppeldeutigkeit. */
export function backupFileName(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/gu, '-').replace(/-\d{3}Z$/u, 'Z');
  return `faktura-${stamp}.tar.gz`;
}

/**
 * Erzeugt die Sicherung im Speicher.
 *
 * Für den Bestand eines Einzelunternehmens ist das angemessen: Die Datenbank
 * liegt im Bereich weniger Megabyte, die Belegarchive ebenso. Ein Strom wäre
 * die sauberere Bauart, brächte aber eine Nebenläufigkeit zwischen
 * Datenbankabzug und Dateien mit, die hier nichts gewinnt.
 */
export async function createBackupArchive(now: Date = new Date()): Promise<Backup> {
  const storageRoot = path.resolve(getEnv().STORAGE_DIR);
  const snapshotDirectory = path.dirname(storageRoot);

  const database = await createDatabaseSnapshot(snapshotDirectory);
  const files = await collectFiles(storageRoot);

  const archive = createTar(
    [{ name: DATABASE_ENTRY_NAME, content: database, mtime: now }, ...files],
    now,
  );
  const bytes = new Uint8Array(gzipSync(archive));

  logger.info('backup.created', {
    fileCount: files.length,
    databaseBytes: database.length,
    archiveBytes: bytes.length,
  });

  return { fileName: backupFileName(now), bytes, fileCount: files.length };
}
