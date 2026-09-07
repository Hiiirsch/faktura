/**
 * Startet die gebaute Anwendung für die Integrationstests.
 *
 * NFA-SEC-01 verlangt einen Test, der jede Route ohne gültige Sitzung
 * durchläuft. Das lässt sich nur gegen einen echten Server prüfen: Middleware,
 * Weiterleitungen, Statuscodes und Cookie-Attribute entstehen erst im
 * Zusammenspiel von Next.js und der Anwendung.
 *
 * Der Test läuft gegen eigene Datenbanken und einen eigenen Port, damit er
 * weder den Entwicklungsstand noch einen laufenden Server berührt.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));

export const TEST_PORT = 3987;
/**
 * **`localhost`, nicht `127.0.0.1`** (seit M9).
 *
 * Eine IP-Adresse ist als WebAuthn-`rpID` unzulässig — der Browser bricht die
 * Zeremonie wortlos ab. `localhost` ist der einzige Name, der ohne HTTPS als
 * sicherer Kontext gilt, und damit der einzige, unter dem sich Passkeys in einem
 * Test prüfen lassen.
 */
export const TEST_BASE_URL = `http://localhost:${String(TEST_PORT)}`;
export const TEST_USER_EMAIL = 'pruefung@example.org';
/** Eigenes Konto für den Sperrtest, damit er die übrigen Prüfungen nicht stört. */
export const TEST_LOCKOUT_EMAIL = 'sperre@example.org';
/**
 * Konto mit zweitem Faktor — für den zweistufigen Anmeldeweg (M6.2).
 *
 * Das Geheimnis steht fest im Quelltext, damit der Browsertest daraus einen
 * gültigen Code erzeugen kann. Es gilt ausschließlich für die Testdatenbank.
 */
export const TEST_TOTP_EMAIL = 'zweifaktor@example.org';
export const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
/**
 * Konto mit genau einem Recht (`invoice.read`) — für `permissions.test.ts` (M8).
 *
 * Angelegt in `seed-user.ts`; hier steht nur die Adresse, damit der Test sie
 * nicht doppelt führt.
 */
export const TEST_RESTRICTED_EMAIL = 'nurlesen@example.org';

/**
 * Betreiberkonto für die Adminrouten (M8, B5).
 *
 * Der zweite Faktor ist für Betreiberkonten verpflichtend (FA-ADM-08), das
 * Geheimnis steht deshalb hier: Ein Test, der sich als Betreiber anmelden will,
 * braucht ein Einmalkennwort.
 */
export const TEST_ADMIN_EMAIL = 'betreiber@example.org';

/**
 * Ein Kundenname und eine Belegnummer aus dem Bestand (M8, B5).
 *
 * Sie stehen hier, damit ein Test **negativ** prüfen kann: Diese beiden
 * Zeichenketten dürfen im Adminbereich nirgends auftauchen. Der Nachweis, dass
 * die Verwaltung keine Geschäftsdaten sieht, ist andernfalls nur eine Aussage
 * über den Quelltext.
 */
export const TEST_CUSTOMER_NAME = 'Schulz KG';
export const TEST_INVOICE_NUMBER_PREFIX = 'RE-';
export const TEST_ADMIN_TOTP_SECRET = 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU';

export const TEST_USER_PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';

/**
 * Zwei Datenbanken auf **einem** PostgreSQL-Dienst (M17).
 *
 * Die des Servers bleibt über den ganzen Lauf stehen; die der Fachlogik wird
 * vor **jedem** Test geleert. Getrennt sein müssen sie deshalb, nicht weil sie
 * Verschiedenes enthielten.
 *
 * Die Adresse kommt aus der Umgebung, mit einer Vorgabe für den
 * Entwicklungsrechner. In der CI zeigt sie auf den Dienst des Läufers.
 */
const PG_BASE =
  process.env['TEST_POSTGRES_URL'] ?? 'postgresql://faktura:entwicklung@localhost:55432';

/** Verwaltungsverbindung — nur zum Anlegen und Verwerfen der beiden Datenbanken. */
const ADMIN_DATABASE_URL = `${PG_BASE}/postgres`;

const SERVER_DB = 'faktura_test_server';
const DATA_DB = 'faktura_test_data';

export const TEST_DATABASE_URL = `${PG_BASE}/${SERVER_DB}?schema=public`;
const DATA_DATABASE_URL = `${PG_BASE}/${DATA_DB}?schema=public`;

const TEST_STORAGE_DIR = path.join(projectRoot, 'data', 'integration-server-storage');

/**
 * Umgebung des Testservers.
 *
 * **Jede** Variable, die die Anwendung liest, wird hier ausdrücklich gesetzt.
 * `next start` lädt sonst die `.env` des Entwicklungsstands — und die zeigt auf
 * die Pfade im Container. Aufgefallen ist das erst, als der Server anfing,
 * Dateien abzulegen: Er versuchte, `/app/storage` anzulegen.
 */
const serverEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(TEST_PORT),
  HOSTNAME: 'localhost',
  DATABASE_URL: TEST_DATABASE_URL,
  APP_URL: TEST_BASE_URL,
  APP_TIMEZONE: 'Europe/Berlin',
  APP_NAME: 'Faktura',
  STORAGE_DIR: TEST_STORAGE_DIR,
} as const;

let server: ChildProcess | undefined;

function removeStorage(): void {
  rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
}

/**
 * Legt beide Testdatenbanken neu an.
 *
 * `WITH (FORCE)` trennt bestehende Verbindungen: Ein abgebrochener Lauf lässt
 * sonst eine offene Verbindung zurück, und der nächste Lauf scheitert an
 * „database is being accessed by other users" — ein Fehler, der aussieht wie
 * ein Fehler im Test und keiner ist.
 *
 * Die Verwaltungsverbindung wird sofort wieder geschlossen; sie hat mit dem
 * Lauf nichts zu tun.
 */
async function recreateDatabases(): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DATABASE_URL } } });

  try {
    for (const name of [SERVER_DB, DATA_DB]) {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }
}

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`Server beendete sich vorzeitig mit Code ${String(server.exitCode)}`);
    }
    try {
      const response = await fetch(`${TEST_BASE_URL}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Noch nicht bereit — weiter warten.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Server war nach ${String(timeoutMs)} ms nicht erreichbar`);
}

export async function setup(): Promise<void> {
  if (!existsSync(path.join(projectRoot, '.next', 'BUILD_ID'))) {
    throw new Error(
      'Es liegt kein Produktionsbuild vor. Zuerst `npm run build` ausführen — ' +
        'die Integrationstests prüfen das echte Laufzeitverhalten, nicht den Entwicklungsserver.',
    );
  }

  await recreateDatabases();
  removeStorage();

  for (const url of [TEST_DATABASE_URL, DATA_DATABASE_URL]) {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  }

  execFileSync('npx', ['tsx', 'tests/integration/setup/seed-user.ts'], {
    cwd: projectRoot,
    env: { ...serverEnv },
    stdio: 'pipe',
  });

  server = spawn('npx', ['next', 'start', '--port', String(TEST_PORT), '--hostname', 'localhost'], {
    cwd: projectRoot,
    env: serverEnv,
    // Die Ausgabe des Servers bleibt sichtbar. Ein Fehler in einem
    // Routenhandler erscheint sonst nur als 500 im Test, und die Ursache
    // steht in einem Log, das niemand liest.
    stdio: 'inherit',
  });

  await waitForServer();
}

export async function teardown(): Promise<void> {
  if (server !== undefined) {
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (server.exitCode === null) {
      server.kill('SIGKILL');
    }
  }
  /*
   * Die Datenbanken bleiben nach dem Lauf **stehen**.
   *
   * Unter SQLite wurden die Dateien weggeräumt; hier wäre das Verwerfen zweier
   * Datenbanken eine weitere Verbindung im Abbau, und ein Fehlschlag dabei
   * verdeckte das Ergebnis des Laufs. Der nächste Lauf legt sie ohnehin neu an
   * — und wer nach einem Fehlschlag nachsehen will, findet den Zustand vor.
   */
  removeStorage();
}
