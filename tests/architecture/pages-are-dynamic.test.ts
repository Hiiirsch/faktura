/**
 * Jede Seite wird bei jedem Aufruf gesetzt (M8, B0).
 *
 * **Warum das eine Mandantenfrage ist.** Der App Router setzt Seiten
 * voreingestellt einmal und liefert sie danach aus einem Zwischenspeicher.
 * `revalidatePath('/customers')` wirkt dabei auf einen **Pfad**, nicht auf
 * einen Mandanten — die Kundenliste hat für Unternehmen A und B dieselbe
 * Adresse. Würde eine Seite zwischengespeichert, bekäme B die Liste von A:
 * ohne Fehlermeldung, ohne Logeintrag, ohne fehlschlagenden Test.
 *
 * Heute tragen alle Seiten `dynamic = 'force-dynamic'`. Das ist bisher
 * Gewohnheit, keine Regel — jede neue Seite entstünde ohne. Ab zwei
 * Unternehmen ist die Gewohnheit zu wenig.
 *
 * Die Prüfung gilt auch für Routen (`route.ts`): Eine zwischengespeicherte
 * Antwort von `/api/invoices/[id]/pdf` wäre derselbe Fehler mit demselben
 * Ausgang.
 */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

async function collectRouteFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(path.join(projectRoot, directory), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRouteFiles(relative)));
    } else if (entry.name === 'page.tsx' || entry.name === 'route.ts') {
      files.push(relative);
    }
  }

  return files;
}

describe('Keine zwischengespeicherte Seite eines fremden Mandanten', () => {
  it('erklärt jede Seite und jede Route als dynamisch', async () => {
    const files = await collectRouteFiles('src/app');
    expect(files.length).toBeGreaterThan(10);

    const offenders = files.filter((file) => {
      const source = readFileSync(path.join(projectRoot, file), 'utf8');
      return !/export const dynamic = 'force-dynamic'/u.test(source);
    });

    expect(offenders).toEqual([]);
  });

  /**
   * Und niemand hebt es an anderer Stelle wieder auf.
   *
   * `revalidate` mit einer Zahl oder `dynamic = 'force-static'` schlügen die
   * Regel oben, ohne sie zu verletzen — die Zeile stünde ja da.
   */
  it('setzt keine Aufbewahrungsdauer und keine statische Erzeugung', async () => {
    const offenders: string[] = [];

    for (const file of await collectRouteFiles('src/app')) {
      const source = readFileSync(path.join(projectRoot, file), 'utf8');

      if (/export const revalidate\s*=\s*\d/u.test(source)) {
        offenders.push(`${file}: revalidate`);
      }
      if (/force-static|'auto'/u.test(source)) {
        offenders.push(`${file}: dynamic`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
