/**
 * Frische Datenbank je Test (M17).
 *
 * **Aufräumen durch `DELETE` scheidet aus** — und zwar aus demselben Grund wie
 * unter SQLite: Festgeschriebene Belege und Protokolleinträge lassen sich nicht
 * löschen. Das ist die Zusage aus FA-NUM-09 und NFA-COMP-02, durchgesetzt von
 * Triggern. Ein Test, der sie umginge, höhlte sie aus.
 *
 * **Stattdessen `TRUNCATE`.** PostgreSQL feuert dabei **keine**
 * `BEFORE DELETE`-Trigger; das ist kein Schlupfloch, sondern die Bauart des
 * Befehls. Für die Anwendung ändert sich nichts: Sie kennt kein Roh-SQL
 * (NFA-ARCH-10) und kann `TRUNCATE` gar nicht absetzen. Die Löschsperren
 * bleiben also für jeden Weg in Kraft, den die Anwendung überhaupt gehen kann.
 *
 * Bis M16 wurde eine migrierte Vorlagendatei kopiert. Mit einer Datenbank statt
 * einer Datei gibt es nichts mehr zu kopieren — `TRUNCATE` über alle Tabellen
 * ist schneller als das Kopieren es war.
 */
import { ALL_PERMISSION_KEYS } from '@/domain/policy/can';
import { getPrismaClient } from '@/infrastructure/db/prisma';
import { DEFAULT_ORGANIZATION_ID } from '@/infrastructure/repositories/organization-context';

/**
 * Die Datenbank der Fachlogik-Prüfungen.
 *
 * Getrennt von der des Testservers: Sie wird vor **jedem** Test geleert, was
 * dem laufenden Server den Boden unter den Füßen wegzöge.
 */
export const DATA_DATABASE_URL =
  process.env['TEST_DATA_DATABASE_URL'] ??
  'postgresql://faktura:entwicklung@localhost:55432/faktura_test_data?schema=public';

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
 * Die Liste der Tabellen, einmal ermittelt.
 *
 * Aus `information_schema` statt aus einer gepflegten Aufzählung: Eine neue
 * Tabelle wäre sonst die, die zwischen zwei Tests stehen bleibt — und der
 * Fehler zeigte sich als rätselhafter Zustand im übernächsten Test, nicht als
 * vergessener Eintrag.
 */
let truncateStatement: string | undefined;

async function buildTruncateStatement(): Promise<string> {
  const rows = await getPrismaClient().$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );

  if (rows.length === 0) {
    throw new Error('Keine Tabellen gefunden — läuft `prisma migrate deploy` gegen diese Datenbank?');
  }

  const names = rows.map((row) => `"${row.tablename}"`).join(', ');
  return `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`;
}

/** Leert die Arbeitsdatenbank und legt den Prüf-Akteur neu an. */
export async function resetDatabase(): Promise<void> {
  const client = getPrismaClient();

  truncateStatement ??= await buildTruncateStatement();
  await client.$executeRawUnsafe(truncateStatement);

  /*
   * Der Ausgangszustand einer **frisch aufgesetzten Anlage**: eine
   * Organisation und die Rolle „Inhaber" mit allen Berechtigungen. Genau das
   * legt `00000000000002_default_organization` an.
   *
   * Unter SQLite kam beides aus der kopierten Vorlagendatei. Mit `TRUNCATE`
   * ist es weg und muss hier entstehen — und das ist ehrlicher: Der
   * Ausgangszustand der Tests steht damit an **einer** lesbaren Stelle statt
   * verteilt über zwei Migrationen von vor einem Jahr.
   *
   * Die Berechtigungen kommen aus `ALL_PERMISSION_KEYS` und nicht aus einer
   * abgeschriebenen Liste: Wer einen Schlüssel ergänzt, hat ihn hier sofort.
   */
  await client.organization.create({
    data: { id: DEFAULT_ORGANIZATION_ID, name: 'Meine Organisation' },
  });

  await client.role.create({
    data: {
      id: `role_owner_${DEFAULT_ORGANIZATION_ID}`,
      organizationId: DEFAULT_ORGANIZATION_ID,
      name: 'Inhaber',
      description: 'Beim Aufsetzen angelegt — alle Berechtigungen.',
      permissions: {
        create: ALL_PERMISSION_KEYS.map((permissionKey) => ({
          organizationId: DEFAULT_ORGANIZATION_ID,
          permissionKey,
        })),
      },
    },
  });

  await client.user.create({
    data: {
      id: TEST_ACTOR_ID,
      email: TEST_ACTOR_EMAIL,
      passwordHash: UNUSABLE_HASH,
      organizationId: DEFAULT_ORGANIZATION_ID,
    },
  });
}
