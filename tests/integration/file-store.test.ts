/**
 * Beide Dateispeicher gegen **denselben** Vertrag (M17, B2 — NFA-BETR-14).
 *
 * Der Sinn dieses Tests ist, dass er zweimal läuft: einmal gegen das
 * Dateisystem, einmal gegen einen echten S3-kompatiblen Dienst. Ein Adapter,
 * der nur „so ähnlich" funktioniert, ist genau der, an dem später eine Instanz
 * eine Datei nicht findet.
 *
 * **Gegen einen echten Dienst, nicht gegen eine Attrappe.** Für den Mailversand
 * gilt seit M14 dieselbe Regel: Eine Attrappe prüft, dass wir eine Funktion
 * aufrufen; ein Dienst prüft, dass die Bytes ankommen. Bei S3 kommt hinzu, dass
 * die **Signatur** die eigentliche Fehlerquelle ist — und die kann eine
 * Attrappe gar nicht bewerten.
 *
 * Ohne erreichbaren Objektspeicher läuft nur die Dateisystem-Hälfte, und der
 * Lauf sagt das. Wer ihn vollständig will, startet einen:
 *
 *     docker run -d --name faktura-minio -p 59000:9000 \
 *       -e MINIO_ROOT_USER=faktura -e MINIO_ROOT_PASSWORD=entwicklung \
 *       minio/minio server /data
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FileStore } from '@/infrastructure/storage/file-store';

const S3_ENDPOINT = process.env['TEST_S3_ENDPOINT'] ?? 'http://localhost:59000';
const S3_BUCKET = 'faktura-test';
const S3_KEY_ID = process.env['TEST_S3_ACCESS_KEY_ID'] ?? 'faktura';
const S3_SECRET = process.env['TEST_S3_SECRET_ACCESS_KEY'] ?? 'entwicklung';

let temporaryDirectory: string;

/** Ob ein Objektspeicher antwortet — ohne ihn bleibt die zweite Hälfte aus. */
async function objectStoreReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${S3_ENDPOINT}/minio/health/live`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Lädt die Speichermodule **frisch** mit gesetzter Umgebung.
 *
 * `getEnv()` hält sein Ergebnis fest, und die Auswahl in `store.ts` ebenso; ein
 * Import am Dateikopf liefe, bevor die Werte stehen. Dieselbe Bauart wie in
 * `mailer.test.ts` seit M14.
 */
async function withEnvironment<T>(
  values: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = { ...process.env };

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const { resetFileStore } = await import('@/infrastructure/storage/store');
  resetFileStore();

  try {
    return await run();
  } finally {
    process.env = previous;
    resetFileStore();
  }
}

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'faktura-store-'));
});

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

/** Der Vertrag, geprüft an einem beliebigen Adapter. */
function contractOf(name: string, load: () => Promise<FileStore>): void {
  describe(`NFA-BETR-14 Der Dateispeicher: ${name}`, () => {
    it('legt Bytes ab und liefert sie unverändert zurück', async () => {
      const store = await load();
      const bytes = new Uint8Array([37, 80, 68, 70, 45, 1, 2, 3, 255, 0, 128]);

      await store.put('artifacts/beleg-eins/pdf.pdf', bytes);
      const gelesen = await store.get('artifacts/beleg-eins/pdf.pdf');

      // Byte für Byte — ein Beleg verweist auf seine Datei samt Prüfsumme.
      expect([...gelesen]).toEqual([...bytes]);
    }, 30_000);

    it('ersetzt vollständig, statt zu ergänzen', async () => {
      const store = await load();

      await store.put('artifacts/beleg-zwei/pdf.pdf', new Uint8Array([1, 2, 3, 4, 5, 6]));
      await store.put('artifacts/beleg-zwei/pdf.pdf', new Uint8Array([9]));

      expect([...(await store.get('artifacts/beleg-zwei/pdf.pdf'))]).toEqual([9]);
    }, 30_000);

    it('meldet einen unbekannten Schlüssel als Fehler', async () => {
      const store = await load();

      // Nicht `null`, sondern ein Fehler: Eine fehlende Belegdatei ist ein
      // Datenverlust und kein Alltagsfall (M12, `origin: 'substitute'`).
      await expect(store.get('artifacts/gibt-es-nicht/pdf.pdf')).rejects.toThrow();
    }, 30_000);

    it('nimmt das Löschen eines unbekannten Schlüssels hin', async () => {
      const store = await load();

      await expect(store.remove('artifacts/gibt-es-nicht/pdf.pdf')).resolves.toBeUndefined();
    }, 30_000);

    it('entfernt alles unter einem Präfix', async () => {
      const store = await load();

      await store.put('artifacts/beleg-drei/pdf.pdf', new Uint8Array([1]));
      await store.put('artifacts/beleg-drei/zugferd.pdf', new Uint8Array([2]));
      await store.put('artifacts/beleg-vier/pdf.pdf', new Uint8Array([3]));

      await store.removePrefix('artifacts/beleg-drei');

      await expect(store.get('artifacts/beleg-drei/pdf.pdf')).rejects.toThrow();
      await expect(store.get('artifacts/beleg-drei/zugferd.pdf')).rejects.toThrow();
      // Der Nachbar bleibt: Ein Präfix ist kein Namensanfang, sondern ein Ort.
      expect([...(await store.get('artifacts/beleg-vier/pdf.pdf'))]).toEqual([3]);
    }, 30_000);
  });
}

contractOf('Dateisystem', async () =>
  withEnvironment(
    {
      STORAGE_DIR: temporaryDirectory,
      S3_ENDPOINT: undefined,
      S3_BUCKET: undefined,
      S3_ACCESS_KEY_ID: undefined,
      S3_SECRET_ACCESS_KEY: undefined,
    },
    async () => {
      const { fileStore } = await import('@/infrastructure/storage/store');
      return fileStore();
    },
  ),
);

const reachable = await objectStoreReachable();

describe.skipIf(!reachable)('Die Auswahl greift wirklich', () => {
  it('legt bei eingerichtetem Objektspeicher nichts auf dem Dateisystem ab', async () => {
    /*
     * **Verhalten statt Objektidentität.** Der erste Anlauf verglich das
     * Ergebnis von `fileStore()` mit `s3Store` — und scheiterte, weil beide
     * über verschiedene Importpfade geladen waren (`@/…` und `./…`) und damit
     * verschiedene Modulinstanzen sind. Das war eine Aussage über den
     * Modullader, nicht über die Anwendung.
     *
     * Diese Prüfung sagt, worauf es ankommt: Ist ein Objektspeicher
     * eingerichtet, landet nichts mehr auf der Platte — und genau das braucht
     * eine zweite Instanz, die dieselbe Datei lesen soll.
     */
    const leeresVerzeichnis = await mkdtemp(path.join(tmpdir(), 'faktura-leer-'));

    try {
      await withEnvironment(
        {
          STORAGE_DIR: leeresVerzeichnis,
          S3_ENDPOINT,
          S3_BUCKET,
          S3_ACCESS_KEY_ID: S3_KEY_ID,
          S3_SECRET_ACCESS_KEY: S3_SECRET,
        },
        async () => {
          const { fileStore } = await import('@/infrastructure/storage/store');
          await fileStore().put('artifacts/auswahl/pdf.pdf', new Uint8Array([7, 7, 7]));
        },
      );

      expect(await readdir(leeresVerzeichnis)).toEqual([]);
    } finally {
      await rm(leeresVerzeichnis, { recursive: true, force: true });
    }
  }, 30_000);
});

if (reachable) {
  contractOf('Objektspeicher', async () =>
    withEnvironment(
      {
        S3_ENDPOINT,
        S3_BUCKET,
        S3_ACCESS_KEY_ID: S3_KEY_ID,
        S3_SECRET_ACCESS_KEY: S3_SECRET,
      },
      async () => {
        const { fileStore } = await import('@/infrastructure/storage/store');
        return fileStore();
      },
    ),
  );
}
