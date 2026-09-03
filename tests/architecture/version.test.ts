/**
 * Die Version steht an drei Stellen — und darf nicht auseinanderlaufen
 * (M16.3, FA-DOC-07).
 *
 * `package.json` trägt sie, weil npm sie dort erwartet. `APP_VERSION` trägt sie,
 * weil die Anwendung sie anzeigen soll und weder die `package.json` ins Bündel
 * ziehen noch zur Laufzeit eine Datei lesen darf. Das Handbuch trägt sie, weil
 * ein Änderungsprotokoll ohne Nummern keines ist.
 *
 * **Drei Fassungen derselben Zahl sind zwei zu viel — es sei denn, ein Test
 * hält sie zusammen.** Ohne ihn wäre die wahrscheinlichste Zukunft: Die
 * `package.json` steigt beim Veröffentlichen, das Handbuch bleibt stehen, und
 * die Neuerungen behaupten einen Stand, den niemand hat.
 *
 * Dieselbe Bauart wie `privacy-notice.test.ts` (Fristen gegen Konstanten) und
 * `docs-index.test.ts` (Index gegen Quellen).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { APP_VERSION } from '@/domain/version';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

async function readJson(relative: string): Promise<{ version?: unknown }> {
  const source = await readFile(path.join(projectRoot, relative), 'utf8');
  return JSON.parse(source) as { version?: unknown };
}

async function changelog(): Promise<string> {
  return readFile(path.join(projectRoot, 'src/content/hilfe/neuerungen.mdx'), 'utf8');
}

describe('FA-DOC-07 Die Versionsnummer', () => {
  it('ist in `package.json` dieselbe wie in der Domäne', async () => {
    const { version } = await readJson('package.json');

    expect(version).toBe(APP_VERSION);
  });

  it('folgt dem Schema aus drei Zahlen', () => {
    // Kein Vorabkennzeichen, kein Aufbaustand: Was hier steht, soll jemand
    // vorlesen können.
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
  });

  it('ist der jüngste Eintrag im Handbuch', async () => {
    /*
     * Der **erste** Versionseintrag, nicht irgendeiner: Das Handbuch führt sie
     * absteigend, und der oberste beschreibt den laufenden Stand. Stünde die
     * aktuelle Nummer weiter unten, wäre die Reihenfolge falsch — und ein
     * Änderungsprotokoll in falscher Reihenfolge ist schlimmer als keines.
     */
    const versionen = [...(await changelog()).matchAll(/^### (\d+\.\d+\.\d+) /gmu)].map(
      (treffer) => treffer[1],
    );

    expect(versionen.length).toBeGreaterThanOrEqual(2);
    expect(versionen[0]).toBe(APP_VERSION);
  });

  it('führt die Einträge absteigend, den neuesten zuerst', async () => {
    const versionen = [...(await changelog()).matchAll(/^### (\d+\.\d+\.\d+) /gmu)].map(
      (treffer) => (treffer[1] ?? '').split('.').map(Number),
    );

    for (let index = 1; index < versionen.length; index += 1) {
      const vorher = versionen[index - 1] ?? [];
      const jetzt = versionen[index] ?? [];

      expect(
        compare(vorher, jetzt),
        `Eintrag ${String(index + 1)} ist nicht älter als der davor`,
      ).toBeGreaterThan(0);
    }
  });

  it('nennt die laufende Version im Text, statt sie abzuschreiben', async () => {
    // Der Satz „Diese Anlage läuft mit Faktura …" setzt die Konstante ein.
    // Stünde dort eine getippte Zahl, wäre sie die erste, die veraltet.
    expect(await changelog()).toContain('{APP_VERSION}');
  });
});

/** Vergleicht zwei Versionen: positiv, wenn `a` neuer ist als `b`. */
function compare(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const links = a[index] ?? 0;
    const rechts = b[index] ?? 0;
    if (links !== rechts) {
      return links - rechts;
    }
  }
  return 0;
}
