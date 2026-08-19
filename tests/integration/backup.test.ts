/**
 * Sicherung und Wiederherstellung (NFA-BETR-03 bis -07).
 *
 * Der Test, den eine Sicherung wirklich braucht, ist nicht „sie läuft durch",
 * sondern **„aus ihr entsteht wieder ein arbeitsfähiger Bestand"**. Deshalb
 * wird hier nicht nur erzeugt, sondern auch ausgepackt, geöffnet und
 * abgefragt: Die Datenbank aus dem Archiv muss dieselben Belege führen, und
 * die abgelegten PDFs müssen Byte für Byte dieselben sein (NFA-BETR-07).
 *
 * Ausgepackt wird mit dem `tar` des Systems und nicht mit dem eigenen Leser —
 * einen zu schreiben hieße, das Archiv gegen dieselbe Annahme zu prüfen, aus
 * der es entstanden ist. Was zählt, ist, dass es die üblichen Werkzeuge lesen
 * können; genau das braucht man im Ernstfall.
 *
 * Seit M8 verlangt `createBackup` einen `PlatformContext` (NFA-SEC-23). Dass
 * eine Mandantensitzung ihn nicht herstellen kann, ist eine Aussage über den
 * Typ — sie steht im Übersetzer, nicht hier. Was hier steht, ist die Wirkung:
 * Die Route liegt im Adminbereich, und der alte Pfad ist weg.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EMPTY_COMPANY_PROFILE,
  saveCompanyProfile,
} from '@/application/company/company-profile';
import { createBackup } from '@/application/backup/create-backup';
import { getOrCreateInvoicePdf } from '@/application/documents/render-invoice';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { createDraftInvoice } from '@/application/invoices/invoice-service';
import {
  backupFileName,
  DATABASE_ENTRY_NAME,
} from '@/infrastructure/backup/backup-archive';
import { closeRenderer } from '@/infrastructure/rendering/playwright-renderer';

import { platformContextOf } from '@/infrastructure/repositories/platform-context';

import { fieldsBuyer } from '../support/buyer';

import { DATA_DATABASE_URL, resetDatabase, TEST_ACTOR_ID } from './setup/database';
import { testOrganization as org } from './setup/organization';
import { TEST_BASE_URL } from './setup/server';

const run = promisify(execFile);
const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const ACTOR = TEST_ACTOR_ID;
/**
 * Der Betreiberkontext für die Sicherung.
 *
 * Im Test unmittelbar erzeugt: Der Weg über eine echte Adminanmeldung ist in
 * `admin-session.test.ts` geprüft, und ihn hier zu wiederholen prüfte nichts
 * über die Sicherung.
 */
const PLATFORM = platformContextOf('admin-pruefung');

const COMPANY = {
  ...EMPTY_COMPANY_PROFILE,
  legalName: 'Musterbetrieb Tim',
  addressLine1: 'Hauptstr. 1',
  postalCode: '89518',
  city: 'Heidenheim',
  countryCode: 'DE',
  taxNumber: '12/345/67890',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  bankAccountHolder: 'Tim Musterbetrieb',
};

const BUYER = fieldsBuyer({
  name: 'Schulz KG',
  addressLine1: 'Musterweg 1',
  postalCode: '10115',
  city: 'Berlin',
  countryCode: 'DE',
});

beforeEach(async () => {
  /*
   * **Erst trennen, dann tauschen** (M10).
   *
   * `resetDatabase()` ersetzt die Datenbankdatei und trennt dafür den Client der
   * **Anwendung**; den eines Testmoduls kennt es nicht. Bleibt der offen, hängt
   * er an der abgehängten alten Datei: Lesezugriffe liefern veraltete oder gar
   * keine Zeilen, Schreibzugriffe scheitern an Fremdschlüsseln auf Zeilen, die
   * es dort nie gab. Beides ist aufgetreten, und beides sah nach einem Fehler in
   * der Fachlogik aus.
   */
  await prisma.$disconnect();
  await resetDatabase();
});

afterAll(async () => {
  await closeRenderer();
  await prisma.$disconnect();
});

/** Legt Firma und einen festgeschriebenen Beleg samt PDF an. */
async function seedIssuedInvoice(): Promise<{ invoiceId: string; invoiceNumber: string }> {
  await saveCompanyProfile(org, COMPANY, ACTOR, null);

  const draft = await createDraftInvoice(
    org,
    {
      buyer: BUYER,
      taxScheme: 'STANDARD',
      currency: 'EUR',
      issueDate: '2026-03-01',
      serviceDateFrom: '2026-02-01',
      serviceDateTo: null,
      dueDate: '2026-03-15',
      introText: null,
      outroText: null,
      purchaseOrderRef: null,
      templateId: null,
      lines: [
        {
          position: 1,
          name: 'Beratung',
          description: null,
          quantityScaled: 10_000,
          unitCode: 'HUR',
          unitPriceCents: 9_500,
          taxRateBasisPoints: 1_900,
          taxCategory: 'S',
          discountBasisPoints: 0,
        },
      ],
    },
    ACTOR,
    null,
  );

  const issued = await issueInvoice(org, draft.id, ACTOR, null);
  expect(issued.ok).toBe(true);
  if (!issued.ok) throw new Error('nicht festgeschrieben');

  // Erzeugt und legt das Artefakt ab — es soll in der Sicherung landen.
  const pdf = await getOrCreateInvoicePdf(org, draft.id);
  expect(pdf.ok).toBe(true);

  return { invoiceId: draft.id, invoiceNumber: issued.invoiceNumber };
}

/** Packt das Archiv in ein frisches Verzeichnis aus. */
async function extract(bytes: Uint8Array): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'faktura-restore-'));
  const archive = path.join(directory, 'backup.tar.gz');
  await writeFile(archive, bytes);

  await run('tar', ['-xzf', archive, '-C', directory]);
  return directory;
}

describe('NFA-BETR-03/-04 Die Sicherung entsteht konsistent', () => {
  it('enthält Datenbank und Dateispeicher in einem Archiv', async () => {
    await seedIssuedInvoice();

    const backup = await createBackup(PLATFORM, new Date('2026-08-16T10:00:00Z'));
    const directory = await extract(backup.bytes);

    try {
      // Die Datenbank liegt unter ihrem festen Namen …
      const database = await stat(path.join(directory, DATABASE_ENTRY_NAME));
      expect(database.size).toBeGreaterThan(0);

      // … und das erzeugte PDF unter `storage/`.
      const { stdout } = await run('tar', ['-tzf', path.join(directory, 'backup.tar.gz')]);
      expect(stdout).toContain(DATABASE_ENTRY_NAME);
      expect(stdout).toMatch(/storage\/artifacts\//u);
      expect(backup.fileCount).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);

  it('trägt den Zeitpunkt sortierbar im Dateinamen', () => {
    const name = backupFileName(new Date('2026-08-16T10:07:03.123Z'));

    expect(name).toBe('faktura-2026-08-16T10-07-03Z.tar.gz');
    // Sortierbar heißt: alphabetisch ist chronologisch.
    expect(backupFileName(new Date('2026-08-15T10:00:00Z')) < name).toBe(true);
  });

  it('erzeugt einen lesbaren Abzug, während die Datenbank in Gebrauch ist', async () => {
    await seedIssuedInvoice();

    // Nebenläufig: Während gesichert wird, laufen Abfragen. Eine Dateikopie
    // ergäbe hier mit einiger Wahrscheinlichkeit einen unbrauchbaren Stand —
    // `VACUUM INTO` nicht (NFA-BETR-04).
    const [backup] = await Promise.all([
      createBackup(PLATFORM),
      prisma.invoice.count(),
      prisma.invoice.findMany({ take: 5 }),
    ]);

    const directory = await extract(backup.bytes);
    try {
      const restored = new PrismaClient({
        datasources: { db: { url: `file:${path.join(directory, DATABASE_ENTRY_NAME)}` } },
      });
      await expect(restored.invoice.count()).resolves.toBeGreaterThan(0);
      await restored.$disconnect();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);
});

describe('NFA-SEC-23 Die Sicherung ist dem Betreiber vorbehalten', () => {
  it('liegt nicht mehr unter dem alten Pfad', async () => {
    // Bis M7 lag hier die gesamte Datenbank, erreichbar für jedes angemeldete
    // Konto.
    const response = await fetch(`${TEST_BASE_URL}/api/backup`, { redirect: 'manual' });

    // `401`, nicht `404`: Der Pfad steht nicht mehr im Routenverzeichnis, und
    // ein unbekannter Pfad gilt dort als geschützt (`requiredCredentialFor`).
    // Der Proxy weist ihn deshalb ab, bevor Next überhaupt nachsieht, ob es
    // eine Datei gibt — die Fail-safe-Regel ist hier das strengere Verhalten.
    expect([401, 404]).toContain(response.status);
    expect(response.headers.get('content-type')).not.toBe('application/gzip');
  }, 60_000);

  it('weist den neuen Pfad ohne Adminsitzung ab', async () => {
    const response = await fetch(`${TEST_BASE_URL}/admin/api/backup`, { redirect: 'manual' });

    // Der Proxy fängt es ab, bevor irgendetwas erzeugt wird.
    expect([302, 303, 307, 401]).toContain(response.status);
    expect(response.headers.get('content-type')).not.toBe('application/gzip');
  }, 60_000);
});

describe('NFA-BETR-06/-07 Aus der Sicherung entsteht wieder ein Bestand', () => {
  it('führt nach dem Auspacken dieselben Belege und dieselben PDFs', async () => {
    const { invoiceId, invoiceNumber } = await seedIssuedInvoice();

    const original = await prisma.invoiceArtifact.findFirstOrThrow({
      where: { invoiceId },
    });
    const originalPdf = await readFile(
      path.join(path.resolve(process.env.STORAGE_DIR ?? './storage'), original.filePath),
    );

    const backup = await createBackup(PLATFORM);
    const directory = await extract(backup.bytes);

    try {
      // 1. Die Datenbank aus dem Archiv öffnen und abfragen.
      const restored = new PrismaClient({
        datasources: { db: { url: `file:${path.join(directory, DATABASE_ENTRY_NAME)}` } },
      });

      const invoice = await restored.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      expect(invoice.invoiceNumber).toBe(invoiceNumber);
      expect(invoice.status).toBe('ISSUED');

      const artifact = await restored.invoiceArtifact.findFirstOrThrow({ where: { invoiceId } });
      expect(artifact.sha256).toBe(original.sha256);

      await restored.$disconnect();

      // 2. Die Datei aus dem Archiv muss dieselbe sein — Byte für Byte.
      //    Ein Beleg verweist auf seine Datei samt Prüfsumme (FA-TPL-09);
      //    eine Sicherung, die nur die Datenbank enthält, ist keine.
      const restoredPdf = await readFile(path.join(directory, 'storage', artifact.filePath));
      expect(Buffer.compare(originalPdf, restoredPdf)).toBe(0);
      expect(restoredPdf.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
