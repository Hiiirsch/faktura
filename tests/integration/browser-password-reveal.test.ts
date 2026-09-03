/**
 * Das Passwort ansehen (M13.1 — FA-UI-10, NFA-UI-06).
 *
 * **Zwei Zusagen, und die zweite ist die unbequeme:**
 *
 * 1. Der Knopf schaltet das Feld wirklich um — `type` wechselt, der Wert
 *    bleibt.
 * 2. **Ohne JavaScript gibt es ihn nicht.** Die Anmeldung ist die eine Stelle,
 *    an der Bedienbarkeit ohne JavaScript zugesagt ist; ein Knopf, der dort
 *    steht und nichts tut, wäre schlechter als keiner. Das lässt sich nur mit
 *    einem Browser prüfen, dem man JavaScript abgeschaltet hat.
 */
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_BASE_URL } from './setup/server';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser.close();
});

describe('FA-UI-10 Passwort anzeigen', () => {
  it('schaltet das Feld um und wieder zurück', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.fill('#password', 'geheim');

      const feld = page.locator('#password');
      expect(await feld.getAttribute('type')).toBe('password');

      await page.click('button[aria-label="Passwort anzeigen"]');
      expect(await feld.getAttribute('type')).toBe('text');
      // Der Wert wandert nicht — umgeschaltet wird allein die Darstellung.
      expect(await feld.inputValue()).toBe('geheim');

      await page.click('button[aria-label="Passwort verbergen"]');
      expect(await feld.getAttribute('type')).toBe('password');
    } finally {
      await context.close();
    }
  }, 120_000);

  it('sagt einem Screenreader, ob das Passwort sichtbar ist', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

      const knopf = page.locator('button[aria-pressed]').first();
      expect(await knopf.getAttribute('aria-pressed')).toBe('false');

      await knopf.click();
      expect(await page.locator('button[aria-pressed]').first().getAttribute('aria-pressed')).toBe(
        'true',
      );
    } finally {
      await context.close();
    }
  }, 120_000);

  it('zeigt den Knopf ohne JavaScript gar nicht erst', async () => {
    /*
     * Der eigentliche Nachweis. Versteckt wird über eine Regel im `<noscript>`
     * des Layouts — kein Zustand, kein Effekt. Ob sie greift, weiß nur ein
     * Browser ohne JavaScript.
     */
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    try {
      await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

      // Das Feld ist da und bedienbar …
      expect(await page.locator('#password').count()).toBe(1);

      // … der Knopf steht zwar im Markup, ist aber nicht zu sehen.
      const knopf = page.locator('button[aria-pressed]').first();
      expect(await knopf.isVisible()).toBe(false);
    } finally {
      await context.close();
    }
  }, 120_000);
});
