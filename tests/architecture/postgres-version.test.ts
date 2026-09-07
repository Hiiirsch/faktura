/**
 * Der Abzug muss zur Datenbank passen (M17, NFA-BETR-03/-04).
 *
 * **`pg_dump` weigert sich gegen eine neuere Datenbank** — nicht mit einem
 * Teilergebnis, sondern mit „aborting because of server version mismatch". Die
 * Sicherung fällt damit vollständig aus, und zwar erst dann, wenn jemand sie
 * braucht.
 *
 * Genau das stand im Anwendungsimage: `docker-compose.yml` startet PostgreSQL
 * 17.6, das Sammelpaket `postgresql-client` von Debian bookworm liefert
 * Fassung 15. Aufgefallen ist es im CI, weil der Wiederherstellungstest den
 * Abzug wirklich zieht — nicht durch Lesen des Dockerfiles.
 *
 * Die Zahl steht danach an drei Stellen: im Compose-Dienst, im Image und im
 * Arbeitsablauf des CI. Drei Fassungen derselben Zahl sind zwei zu viel, es sei
 * denn, ein Test hält sie zusammen — dieselbe Bauart wie `version.test.ts`.
 *
 * **Geprüft wird die Richtung, nicht die Gleichheit.** Ein neuerer Client
 * sichert eine ältere Datenbank ohne Weiteres; nur andersherum geht es nicht.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

async function read(relative: string): Promise<string> {
  return readFile(path.join(projectRoot, relative), 'utf8');
}

/** Die Hauptversion aus einem `postgres:<version>`-Image. */
function serverMajor(source: string): number {
  const treffer = /image:\s*postgres:(\d+)\./u.exec(source);
  expect(treffer, 'Kein postgres-Image gefunden').not.toBeNull();
  return Number(treffer?.[1]);
}

/** Die Hauptversion aus einem `postgresql-client-<n>`-Paket. */
function clientMajor(source: string): number {
  const treffer = /postgresql-client-(\d+)/u.exec(source);
  expect(treffer, 'Kein postgresql-client-Paket gefunden').not.toBeNull();
  return Number(treffer?.[1]);
}

describe('NFA-BETR-03 Der Abzug passt zur Datenbank', () => {
  it('liefert im Image einen Client, der mindestens so neu ist wie der Dienst', async () => {
    const server = serverMajor(await read('docker-compose.yml'));
    const client = clientMajor(await read('Dockerfile'));

    expect(client).toBeGreaterThanOrEqual(server);
  });

  it('prüft im CI gegen dieselbe Serverfassung, die ausgeliefert wird', async () => {
    /*
     * Sonst liefe der Wiederherstellungstest gegen eine Datenbank, die niemand
     * betreibt — und die Zusage gälte für den Lauf, nicht für die Anlage.
     */
    const workflow = await read('.github/workflows/ci.yml');

    expect(serverMajor(workflow)).toBe(serverMajor(await read('docker-compose.yml')));
  });

  it('gibt dem CI-Läufer denselben Client wie dem Image', async () => {
    const workflow = await read('.github/workflows/ci.yml');

    expect(clientMajor(workflow)).toBe(clientMajor(await read('Dockerfile')));
  });
});
