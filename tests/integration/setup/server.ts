/**
 * Startet die gebaute Anwendung für die Integrationstests.
 *
 * NFA-SEC-01 verlangt einen Test, der jede Route ohne gültige Sitzung
 * durchläuft. Das lässt sich nur gegen einen echten Server prüfen: Middleware,
 * Weiterleitungen, Statuscodes und Cookie-Attribute entstehen erst im
 * Zusammenspiel von Next.js und der Anwendung.
 *
 * Der Test läuft gegen eine eigene Datenbankdatei und einen eigenen Port, damit
 * er weder den Entwicklungsstand noch einen laufenden Server berührt.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));

export const TEST_PORT = 3987;
export const TEST_BASE_URL = `http://127.0.0.1:${String(TEST_PORT)}`;
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

export const TEST_USER_PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';

const TEST_DB_FILE = path.join(projectRoot, 'data', 'integration-test.db');
export const TEST_DATABASE_URL = 'file:../data/integration-test.db';

/**
 * Zweite Datenbank für die Prüfungen der Fachlogik.
 *
 * Getrennt von der des Servers: Diese Datei wird vor jedem Test aus einer
 * Vorlage neu angelegt, was den laufenden Server stören würde.
 */
const TEMPLATE_DB_FILE = path.join(projectRoot, 'data', 'integration-template.db');
const DATA_DB_FILE = path.join(projectRoot, 'data', 'integration-data.db');
const TEMPLATE_DATABASE_URL = 'file:../data/integration-template.db';

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
  HOSTNAME: '127.0.0.1',
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

function removeDatabases(): void {
  for (const base of [TEST_DB_FILE, TEMPLATE_DB_FILE, DATA_DB_FILE]) {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const file = `${base}${suffix}`;
      if (existsSync(file)) {
        rmSync(file);
      }
    }
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

  removeDatabases();
  removeStorage();

  for (const url of [TEST_DATABASE_URL, TEMPLATE_DATABASE_URL]) {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  }

  // Startzustand für die Fachlogik-Prüfungen.
  copyFileSync(TEMPLATE_DB_FILE, DATA_DB_FILE);

  execFileSync('npx', ['tsx', 'tests/integration/setup/seed-user.ts'], {
    cwd: projectRoot,
    env: { ...serverEnv },
    stdio: 'pipe',
  });

  server = spawn('npx', ['next', 'start', '--port', String(TEST_PORT), '--hostname', '127.0.0.1'], {
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
  removeDatabases();
  removeStorage();
}
