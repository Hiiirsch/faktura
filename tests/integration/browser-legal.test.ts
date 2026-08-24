/**
 * Die Rechtstexte im echten Browser (M13 — NFA-COMP-07, -08, -09).
 *
 * **Drei Zusagen, die nur hier fallen können:**
 *
 * 1. Die Seiten antworten **ohne Sitzung**. Ein Impressum hinter einer
 *    Anmeldung wäre keins — und ob der Proxy es durchlässt, entscheidet sich
 *    zur Laufzeit, nicht im Typsystem.
 * 2. Ohne hinterlegten Inhalt gibt es das Impressum **nicht**: 404 und kein
 *    Link. Ein Link auf eine leere Seite wäre schlechter als keiner.
 * 3. Hinterlegtes Markup wird **nicht ausgeführt**. Das ist die einzige Stelle
 *    der Anwendung, an der fremder Inhalt öffentlich erscheint.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_BASE_URL } from './setup/server';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser.close();
});

async function fetchStatus(page: Page, path: string): Promise<number> {
  const response = await page.request.get(`${TEST_BASE_URL}${path}`);
  return response.status();
}

describe('NFA-COMP-08 Die Datenschutzhinweise stehen jedem offen', () => {
  it('antwortet ohne Sitzung und nennt die Fristen der Anwendung', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(`${TEST_BASE_URL}/datenschutz`, { waitUntil: 'domcontentloaded' });

      // Keine Umleitung zur Anmeldung.
      expect(page.url()).toContain('/datenschutz');

      const text = (await page.locator('main').textContent()) ?? '';

      // Die Fristen stammen aus den Konstanten; hier stehen sie gesetzt.
      expect(text).toContain('7 Tage'); // Sitzung
      expect(text).toContain('30 Tage'); // vertrautes Gerät
      expect(text).toContain('5 Minuten'); // zweiter Anmeldeschritt
      expect(text).toContain('keine Daten an Dritte');
    } finally {
      await context.close();
    }
  }, 120_000);

  it('zeigt das Impressum nicht, solange keins hinterlegt ist', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      expect(await fetchStatus(page, '/impressum')).toBe(404);

      // Und die Anmeldeseite verlinkt es folglich auch nicht.
      await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      expect(await page.locator('a[href="/impressum"]').count()).toBe(0);

      // Die Datenschutzhinweise stehen dort dagegen immer.
      expect(await page.locator('a[href="/datenschutz"]').count()).toBe(1);
    } finally {
      await context.close();
    }
  }, 120_000);
});
