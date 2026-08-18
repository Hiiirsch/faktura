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
import { DEFAULT_ORGANIZATION_ID } from '@/infrastructure/repositories/organization-context';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));

export const TEMPLATE_DB_FILE = path.join(projectRoot, 'data', 'integration-template.db');
export const DATA_DB_FILE = path.join(projectRoot, 'data', 'integration-data.db');
export const DATA_DATABASE_URL = 'file:../data/integration-data.db';

/**
 * Das Konto, in dessen Namen die Fachlogik-Tests handeln (M8, B6).
 *
 * Bis B6 übergaben die Tests eine erfundene Zeichenkette als Akteur — `'test'`,
 * `'pruef-akteur'` —, und das ging gut, weil `AuditLog.actorId` keinen
 * Fremdschlüssel trägt. `Invoice.createdById` trägt einen: Ein Beleg nennt einen
 * Urheber, den es gibt, oder keinen.
 *
 * Damit wurde aus einer bequemen Unschärfe ein Fehler — und das ist der Gewinn:
 * Die Tests behaupteten einen Akteur, den niemand hätte finden können.
 *
 * Das Konto trägt **keine Rolle**. Es soll in keiner Rechteprüfung mitzählen —
 * insbesondere nicht in der Aussperrsicherung, die aktive Konten mit
 * `organization.administer` zählt.
 */
export const TEST_ACTOR_ID = 'user_pruefakteur';
const TEST_ACTOR_EMAIL = 'pruef-akteur@example.org';

/**
 * Ein Hash, mit dem sich niemand anmeldet.
 *
 * Kein echtes Argon2id: Das Konto meldet sich nie an, und ein Hash je
 * Zurücksetzung kostete bei rund 300 Läufen mehr Zeit als die ganze Suite.
 */
const UNUSABLE_HASH = '$argon2id$v=19$m=65536,t=3,p=1$nichtverwendbar$nichtverwendbar';

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

  // Der Akteur der Fachlogik-Tests. Er steht nicht in der Vorlage, weil die aus
  // den Migrationen entsteht und ein Testkonto dort nichts zu suchen hat.
  await getPrismaClient().user.create({
    data: {
      id: TEST_ACTOR_ID,
      email: TEST_ACTOR_EMAIL,
      passwordHash: UNUSABLE_HASH,
      organizationId: DEFAULT_ORGANIZATION_ID,
    },
  });
}
