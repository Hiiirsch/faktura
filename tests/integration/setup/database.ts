/**
 * Frische Datenbank je Test.
 *
 * Aufräumen durch Löschen scheidet aus: Festgeschriebene Belege und
 * Protokolleinträge lassen sich nicht löschen — genau das ist die Zusage aus
 * FA-NUM-09 und NFA-COMP-02, durchgesetzt von Datenbank-Triggern. Ein Test, der
 * sie umginge, würde die Zusage aushöhlen.
 *
 * Stattdessen wird eine einmal migrierte Vorlage kopiert. Das kostet wenige
 * Millisekunden und liefert für jeden Test einen unberührten Stand.
 */
import { copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPrismaClient } from '@/infrastructure/db/prisma';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));

export const TEMPLATE_DB_FILE = path.join(projectRoot, 'data', 'integration-template.db');
export const DATA_DB_FILE = path.join(projectRoot, 'data', 'integration-data.db');
export const DATA_DATABASE_URL = 'file:../data/integration-data.db';

/**
 * Setzt die Arbeitsdatenbank auf den Stand der Vorlage zurück.
 *
 * Die offene Verbindung wird zuvor geschlossen: Eine Datei unter einer
 * geöffneten SQLite-Verbindung auszutauschen führt sonst zu Lesefehlern.
 */
export async function resetDatabase(): Promise<void> {
  await getPrismaClient().$disconnect();

  for (const suffix of ['-journal', '-wal', '-shm']) {
    await rm(`${DATA_DB_FILE}${suffix}`, { force: true });
  }

  await copyFile(TEMPLATE_DB_FILE, DATA_DB_FILE);
}
