/**
 * Sicherung auslösen (NFA-BETR-05).
 *
 * Der Anwendungsfall ist dünn, und das ist richtig: Das Zusammensetzen des
 * Archivs ist Infrastrukturarbeit (Dateisystem, SQLite, gzip), und die
 * Anwendungsschicht hat daran nichts zu entscheiden. Was sie beiträgt, ist der
 * Eintrag ins Protokoll — eine Sicherung ist ein Vorgang, den man später
 * nachweisen können muss.
 *
 * **Ohne Organisationskontext, und das ist eine Aussage.** Eine Sicherung
 * umfasst die Datenbankdatei als Ganzes, also alle Mandanten. Sie ist eine
 * Handlung des Betreibers, nicht eines Mandanten. Würde sie je mandantenweise
 * angeboten, wäre das ein anderer Vorgang — ein Export (NFA-COMP-03), kein
 * Backup.
 */
import { type Backup, createBackupArchive } from '@/infrastructure/backup/backup-archive';
import { logger } from '@/infrastructure/logging/logger';

export type { Backup };

export async function createBackup(actorId: string, now: Date = new Date()): Promise<Backup> {
  const started = Date.now();
  const backup = await createBackupArchive(now);

  logger.info('backup.requested', {
    actorId,
    fileName: backup.fileName,
    durationMs: Date.now() - started,
  });

  return backup;
}
