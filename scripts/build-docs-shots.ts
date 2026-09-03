/**
 * Erzeugt die Bildschirmfotos des Handbuchs (M16.1, FA-DOC-05).
 *
 * **Aufgenommen, nicht abgelegt.** Ein von Hand geschossener Screenshot ist ein
 * Bild, das niemand nachstellen kann: Wer ihn erneuern will, braucht denselben
 * Datenbestand, dieselbe Fenstergröße und dieselbe Stelle im Ablauf. Nach der
 * zweiten Änderung erneuert ihn niemand mehr, und das Handbuch zeigt einen
 * Bildschirm, den es nicht mehr gibt.
 *
 * Dieses Skript fährt die gebaute Anwendung auf einer **eigenen Datenbank** mit
 * den Beispieldaten aus `scripts/seed.ts` hoch, meldet sich an und nimmt die
 * Bilder auf. Erneuern heißt danach: `npm run docs:shots`.
 *
 * **Eigene Datenbank, nicht die laufende.** Auf Bildern aus einem echten
 * Bestand stünden Namen und Beträge echter Kunden — in einer Dokumentation, die
 * ohne Anmeldung erreichbar ist. Der Bestand hier ist erfunden.
 *
 * **Helles Schema, feste Fenstergröße.** Ein Bild kennt nur ein Schema; das
 * helle ist das, in dem gedruckt und weitergegeben wird. Die Größe ist fest,
 * damit zwei Läufe vergleichbare Bilder liefern.
 *
 * Voraussetzung ist ein Produktionsbuild (`npm run build`) — dieselbe
 * Bedingung wie bei den Integrationstests, und aus demselben Grund: Gezeigt
 * werden soll, was ausgeliefert wird.
 */
import { spawn, type ChildProcess, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Page } from 'playwright';

import { fullyAuthorized } from '@/application/auth/authorize';
import { EMPTY_COMPANY_PROFILE, saveCompanyProfile } from '@/application/company/company-profile';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { createUser } from '@/infrastructure/repositories/auth-repository';
import { disconnectDatabase } from '@/infrastructure/repositories/client';
import {
  DEFAULT_ORGANIZATION_ID,
  organizationContextOf,
} from '@/infrastructure/repositories/organization-context';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

const PORT = 3988;
const BASE_URL = `http://localhost:${String(PORT)}`;

const DB_FILE = path.join(projectRoot, 'data', 'docs-shots.db');
const DATABASE_URL = 'file:../data/docs-shots.db';
const STORAGE_DIR = path.join(projectRoot, 'data', 'docs-shots-storage');

/** Wohin die Bilder gehen — von Next unverändert ausgeliefert. */
const TARGET_DIR = path.join(projectRoot, 'public', 'hilfe');

/** Zugangsdaten des Beispielkontos; sie entstehen unten mit der Datenbank. */
const EMAIL = 'beispiel@example.org';
const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';

/**
 * Fenstergröße der Aufnahmen.
 *
 * Breit genug für die zweispaltige Belegansicht, hoch genug, dass ein
 * Bildausschnitt nicht mitten in einer Tabellenzeile endet.
 */
const VIEWPORT = { width: 1440, height: 900 } as const;

const serverEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(PORT),
  HOSTNAME: 'localhost',
  DATABASE_URL,
  APP_URL: BASE_URL,
  APP_TIMEZONE: 'Europe/Berlin',
  APP_NAME: 'Faktura',
  STORAGE_DIR,
  // Kein Versand aus einem Aufnahmelauf — dieselbe Vorsorge wie in der
  // Testkonfiguration, aus demselben Anlass.
  SMTP_URL: '',
  MAIL_FROM: '',
} as const;

/**
 * Umgebung für den Seed-Lauf — **ohne** `NODE_ENV=production`.
 *
 * `scripts/seed.ts` weigert sich gegen eine Produktionsdatenbank, und das zu
 * Recht: Testdaten in einer echten Buchhaltung zögen über den Nummernkreis
 * unumkehrbare Folgen nach sich. Diese Datenbank entsteht drei Zeilen weiter
 * oben und wird am Ende gelöscht — sie ist keine. Der **Server** startet
 * weiterhin als Produktionsbau, denn gezeigt werden soll, was ausgeliefert
 * wird.
 */
const seedEnv = { ...serverEnv, NODE_ENV: 'development' } as const;

/** Was aufgenommen wird: Adresse, Dateiname und was das Bild zeigen soll. */
const SHOTS = [
  { file: 'uebersicht', path: '/', label: 'Übersicht mit Kennzahlen' },
  { file: 'rechnungen', path: '/invoices', label: 'Rechnungsliste' },
  { file: 'kunden', path: '/customers', label: 'Kundenliste' },
  { file: 'firmendaten', path: '/settings/company', label: 'Firmendaten' },
  { file: 'sicherheit', path: '/settings/security', label: 'Sicherheit' },
] as const;

function removeFile(base: string): void {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = `${base}${suffix}`;
    if (existsSync(file)) {
      rmSync(file);
    }
  }
}

async function waitForServer(server: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Server beendete sich vorzeitig mit Code ${String(server.exitCode)}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Noch nicht bereit.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Server war nicht rechtzeitig erreichbar');
}

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

async function main(): Promise<void> {
  if (!existsSync(path.join(projectRoot, '.next', 'BUILD_ID'))) {
    throw new Error('Es liegt kein Produktionsbuild vor. Zuerst `npm run build` ausführen.');
  }

  removeFile(DB_FILE);
  rmSync(STORAGE_DIR, { recursive: true, force: true });
  mkdirSync(TARGET_DIR, { recursive: true });

  process.stdout.write('Datenbank anlegen …\n');
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL },
    stdio: 'pipe',
  });

  process.stdout.write('Konto und Beispieldaten anlegen …\n');

  /*
   * Das Konto entsteht hier und nicht über `npm run user:create`: Jenes fragt
   * das Passwort **interaktiv** ab — richtig für ein Kommando, mit dem jemand
   * ein echtes Konto anlegt, und unbrauchbar für einen Lauf ohne Menschen.
   *
   * Die Rolle „Inhaber" legt die Migration je Organisation an; ohne sie hätte
   * das Konto nur die Grundrechte, und auf den Bildern fehlten die Aktionen,
   * die ein echtes Konto sieht.
   */
  process.env['DATABASE_URL'] = DATABASE_URL;
  process.env['STORAGE_DIR'] = STORAGE_DIR;
  await createUser({
    email: EMAIL,
    name: 'Tim Beispiel',
    passwordHash: await hashPassword(PASSWORD),
    organizationId: DEFAULT_ORGANIZATION_ID,
    roleId: `role_owner_${DEFAULT_ORGANIZATION_ID}`,
  });

  execFileSync('npx', ['tsx', 'scripts/seed.ts'], {
    cwd: projectRoot,
    env: { ...seedEnv },
    stdio: 'pipe',
  });

  /*
   * **Ein neutraler Betrieb auf den Bildern.**
   *
   * `scripts/seed.ts` legt „Musterbetrieb Tim Hirsch" an — für den eigenen
   * Entwicklungsstand richtig, für eine mitgelieferte Dokumentation nicht: Die
   * Bilder gehen an jede Installation, und dort hat der Name des Entwicklers
   * nichts zu suchen. Überschrieben wird deshalb nach dem Seed und vor der
   * Aufnahme; Kunden und Belege bleiben, wie sie sind.
   */
  const context = fullyAuthorized(organizationContextOf(DEFAULT_ORGANIZATION_ID));
  await saveCompanyProfile(
    context,
    {
      ...EMPTY_COMPANY_PROFILE,
      legalName: 'Muster & Partner GmbH',
      addressLine1: 'Hauptstraße 12',
      postalCode: '89518',
      city: 'Heidenheim an der Brenz',
      countryCode: 'DE',
      email: 'post@muster-partner.example',
      phone: '07321 123456',
      taxNumber: '63/123/45678',
      vatId: 'DE123456789',
      bankAccountHolder: 'Muster & Partner GmbH',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      bankName: 'Commerzbank',
      managingDirector: 'Alex Muster',
    },
    'docs-shots',
    null,
  );
  await disconnectDatabase();

  process.stdout.write('Server starten …\n');
  const server = spawn(
    'npx',
    ['next', 'start', '--port', String(PORT), '--hostname', 'localhost'],
    { cwd: projectRoot, env: serverEnv, stdio: 'pipe' },
  );

  try {
    await waitForServer(server);

    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        locale: 'de-DE',
        // Ein Bild kennt nur ein Schema.
        colorScheme: 'light',
      });
      const page = await context.newPage();

      await login(page);

      for (const shot of SHOTS) {
        await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: 'networkidle' });
        await page.screenshot({ path: path.join(TARGET_DIR, `${shot.file}.png`) });
        process.stdout.write(`  ${shot.file}.png — ${shot.label}\n`);
      }

      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    server.kill('SIGTERM');
    removeFile(DB_FILE);
    rmSync(STORAGE_DIR, { recursive: true, force: true });
  }

  process.stdout.write(`${String(SHOTS.length)} Bilder in public/hilfe/ geschrieben.\n`);
}

await main();
