/**
 * Konsistenter Abzug der Datenbank (NFA-BETR-04).
 *
 * **Seit M17 über `pg_dump`, nicht mehr über `VACUUM INTO`.** Damit entfällt
 * zugleich die dokumentierte Ausnahme von NFA-ARCH-10: Es gibt hier kein
 * Roh-SQL mehr und keinen Pfad, der in ein SQL-Literal wandert. Der Architekturtest `no-raw-sql.test.ts` braucht für
 * diese Datei keine Erlaubnis mehr. (Der frühere Aufruf wird hier bewusst
 * nicht beim Namen genannt: Der Wächter sucht nach genau diesem Namen und
 * fände ihn sonst in einem Kommentar wieder.)
 *
 * **Warum `pg_dump` und nicht ein Kopieren des Datenverzeichnisses.** Genau wie
 * unter SQLite gilt: Eine Kopie mitten in einer Transaktion ergibt etwas, das
 * aussieht wie eine Datenbank und beim Öffnen scheitert. `pg_dump` liest in
 * einer eigenen Transaktion mit konsistentem Schnappschuss, während nebenher
 * weitergearbeitet wird.
 *
 * **Das Format ist `custom` (`-Fc`), nicht reines SQL.** Es ist komprimiert,
 * und `pg_restore` kann daraus einzelne Tabellen zurückholen — bei einer
 * Wiederherstellung nach einem Versehen ist das der Unterschied zwischen
 * „alles zurück" und „diese eine Tabelle zurück".
 *
 * **Zugangsdaten wandern nicht über die Kommandozeile.** `PGPASSWORD` in der
 * Umgebung des Kindprozesses statt im Aufruf: Argumente stehen in der
 * Prozessliste und wären für jeden auf dem System sichtbar.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getEnv } from '@/infrastructure/config/env';

const run = promisify(execFile);

/** Wie lange ein Abzug höchstens dauern darf, bevor er abgebrochen wird. */
const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Der größte Abzug, den wir im Speicher halten.
 *
 * Er wandert von hier in das tar-Archiv der Sicherung, liegt also ohnehin
 * vollständig im Arbeitsspeicher. Die Grenze ist da, damit ein unerwartet
 * großer Bestand als benannter Fehler auffällt und nicht als
 * Speicherüberlauf.
 */
const MAX_BYTES = 512 * 1024 * 1024;

/**
 * Erzeugt einen konsistenten Abzug und gibt ihn als Bytes zurück.
 *
 * Das Verzeichnis wird nicht mehr gebraucht — `pg_dump` schreibt auf die
 * Standardausgabe, es entsteht keine Zwischendatei. Der Parameter bleibt in
 * der Signatur, weil der Aufrufer (`createBackup`) ihn führt und ein
 * geänderter Vertrag hier nichts verbessert.
 */
export async function createDatabaseSnapshot(_directory: string): Promise<Uint8Array> {
  const url = new URL(getEnv().DATABASE_URL);

  const { stdout } = await run(
    'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--host=${url.hostname}`,
      `--port=${url.port === '' ? '5432' : url.port}`,
      `--username=${decodeURIComponent(url.username)}`,
      `--dbname=${url.pathname.replace(/^\//u, '')}`,
    ],
    {
      encoding: 'buffer',
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BYTES,
      env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
    },
  );

  return new Uint8Array(stdout);
}
