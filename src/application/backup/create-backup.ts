/**
 * Sicherung auslösen (NFA-BETR-05).
 *
 * Der Anwendungsfall ist dünn, und das ist richtig: Das Zusammensetzen des
 * Archivs ist Infrastrukturarbeit (Dateisystem, SQLite, gzip), und die
 * Anwendungsschicht hat daran nichts zu entscheiden. Was sie beiträgt, ist der
 * Eintrag ins Protokoll — eine Sicherung ist ein Vorgang, den man später
 * nachweisen können muss.
 *
 * **Der erste Parameter ist der Betreiberkontext** (M8, NFA-SEC-23). Eine
 * Sicherung umfasst die Datenbankdatei als Ganzes, also alle Mandanten — sie
 * ist eine Handlung des Betreibers, nicht eines Mandanten.
 *
 * Bis M7 stand sie unter `/api/backup` und war damit **jedem angemeldeten
 * Konto** zugänglich. Bei einem Unternehmen war das eine Betreiberfunktion am
 * falschen Ort; ab dem zweiten wäre es ein Datenleck gewesen. Jetzt verlangt
 * sie einen `PlatformContext`, und den kann eine Mandantensitzung nicht
 * herstellen: Der Aufruf aus einer Server Action der Anwendung ist ein
 * Typfehler, nicht eine vergessene Prüfung.
 *
 * Mandantenweise gibt es einen anderen Vorgang — den Datenexport
 * (NFA-COMP-03), der beim Unternehmen bleibt.
 */
import type { PlatformContext } from '@/application/admin/admin-session-service';
import { type Backup, createBackupArchive } from '@/infrastructure/backup/backup-archive';
import { logger } from '@/infrastructure/logging/logger';

export type { Backup };

export async function createBackup(
  platform: PlatformContext,
  now: Date = new Date(),
): Promise<Backup> {
  const started = Date.now();
  const backup = await createBackupArchive(now);

  logger.info('backup.requested', {
    adminUserId: platform.adminUserId,
    fileName: backup.fileName,
    durationMs: Date.now() - started,
  });

  return backup;
}
