/**
 * Sicherung als Betriebsauftrag (NFA-BETR-03, -04).
 *
 * Für die Zeitsteuerung des Servers gedacht — `cron`, ein systemd-Timer oder
 * ein Sidecar. **Die Anwendung plant nichts von selbst:** Ein eingebauter
 * Zeitgeber liefe im Container mit, ohne dass jemand ihn sieht, und ließe sich
 * weder verschieben noch anhalten noch überwachen. Der Betrieb entscheidet,
 * wann gesichert wird; die Anwendung liefert die Sicherung.
 *
 * Aufruf:
 *
 * ```
 * docker compose exec app npm run backup
 * ```
 *
 * Legt eine Datei in `BACKUP_DIR` ab (Vorgabe: `./backups`) und räumt
 * Sicherungen fort, die älter sind als `BACKUP_KEEP_DAYS` (Vorgabe: 30). Ohne
 * dieses Aufräumen läuft das Volume irgendwann voll, und zwar an dem Tag, an
 * dem man es am wenigsten braucht.
 */
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createBackupArchive } from '@/infrastructure/backup/backup-archive';
import { logger } from '@/infrastructure/logging/logger';
import { disconnectDatabase } from '@/infrastructure/repositories/client';

const DEFAULT_DIRECTORY = './backups';
const DEFAULT_KEEP_DAYS = 30;

function backupDirectory(): string {
  return path.resolve(process.env.BACKUP_DIR ?? DEFAULT_DIRECTORY);
}

function keepDays(): number {
  const raw = Number(process.env.BACKUP_KEEP_DAYS ?? DEFAULT_KEEP_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_KEEP_DAYS;
}

/** Entfernt Sicherungen, die älter sind als die Aufbewahrungsfrist. */
async function pruneOldBackups(directory: string, now: Date): Promise<number> {
  const cutoff = now.getTime() - keepDays() * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const entry of await readdir(directory)) {
    // Nur eigene Erzeugnisse: Was sonst im Verzeichnis liegt, gehört jemand
    // anderem.
    if (!entry.startsWith('faktura-') || !entry.endsWith('.tar.gz')) {
      continue;
    }

    const absolute = path.join(directory, entry);
    const info = await stat(absolute);
    if (info.mtimeMs < cutoff) {
      await rm(absolute, { force: true });
      removed += 1;
    }
  }

  return removed;
}

async function main(): Promise<void> {
  const now = new Date();
  const directory = backupDirectory();

  await mkdir(directory, { recursive: true });

  const backup = await createBackupArchive(now);
  const target = path.join(directory, backup.fileName);
  await writeFile(target, backup.bytes);

  const removed = await pruneOldBackups(directory, now);

  logger.info('backup.job_completed', {
    file: backup.fileName,
    directory,
    bytes: backup.bytes.length,
    fileCount: backup.fileCount,
    removedOldBackups: removed,
    keepDays: keepDays(),
  });
}

try {
  await main();
} catch (error) {
  logger.error('backup.job_failed', { error });
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
