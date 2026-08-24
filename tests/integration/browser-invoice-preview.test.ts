/**
 * Die Belegvorschau erneuert sich nach dem Speichern (M12 — FA-PDF-02).
 *
 * **Warum nur ein Browser das prüfen kann.** Ein `<iframe>` mit derselben
 * Adresse lädt nicht neu, gleich wie oft React das umgebende Bauteil rendert.
 * Im TypeScript sieht der Fall genauso aus wie der gelungene; erst der Browser
 * sagt, ob der Rahmen einen neuen Abruf gemacht hat.
 *
 * Gemessen wird deshalb an den Anfragen selbst: Wie oft ist die PDF-Route
 * geholt worden? Das ist die Frage — nicht, welches Attribut im DOM steht.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './setup/server';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser.close();
});

async function login(page: Page): Promise<void> {
  await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', TEST_USER_EMAIL);
  await page.fill('#password', TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 15_000 });
}

/** Die Kennung des offenen Entwurfs aus dem Bestand des Testservers. */
async function openDraft(page: Page): Promise<void> {
  await page.goto(`${TEST_BASE_URL}/invoices?status=DRAFT`, { waitUntil: 'networkidle' });
  await page.click('table a[href^="/invoices/"]');
  await page.waitForSelector('canvas[aria-label]', { timeout: 30_000 });
}

describe('FA-PDF-02 Die Vorschau gehört der Anwendung', () => {
  it('setzt den Beleg selbst — mit eigener Leiste, ohne fremden Betrachter', async () => {
    /*
     * Der eigentliche Nachweis steckt in zwei Zeilen: Es gibt eine Leinwand
     * mit Inhalt, und es gibt **keinen** eingebetteten Betrachter mehr. Dass
     * der Worker von pdf.js unter unserer Richtlinie überhaupt startet, kann
     * nur ein Browser beantworten — im TypeScript sieht der blockierte Fall
     * genauso aus wie der gelungene.
     */
    const context = await browser.newContext();
    const page = await context.newPage();

    const richtlinienverstoesse: string[] = [];
    page.on('console', (nachricht) => {
      const text = nachricht.text();
      if (/Content Security Policy|Refused to/i.test(text)) {
        richtlinienverstoesse.push(text);
      }
    });

    try {
      await login(page);
      await openDraft(page);

      // Kein fremder Betrachter mehr.
      expect(await page.locator('iframe[src*="/pdf"]').count()).toBe(0);

      // Die Leiste ist unsere, auf Deutsch, aus `de.ts`.
      await page.waitForSelector('text=Seite 1 von', { timeout: 30_000 });
      expect(await page.locator('button[aria-label="Nächste Seite"]').count()).toBe(1);
      expect(await page.locator('button[aria-label="Größer"]').count()).toBe(1);

      // Und die Leinwand trägt wirklich ein Bild, keine leere Fläche.
      const gezeichnet = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (canvas === null || canvas.width === 0) {
          return false;
        }
        const context2d = canvas.getContext('2d');
        if (context2d === null) {
          return false;
        }
        const daten = context2d.getImageData(0, 0, canvas.width, Math.min(canvas.height, 200)).data;
        // Irgendein Bildpunkt muss von reinem Weiß abweichen.
        for (let index = 0; index < daten.length; index += 4) {
          if ((daten[index] ?? 255) < 250) {
            return true;
          }
        }
        return false;
      });

      expect(gezeichnet).toBe(true);
      expect(richtlinienverstoesse).toEqual([]);
    } finally {
      await context.close();
    }
  }, 180_000);

  it('holt das PDF nach dem Speichern erneut', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Jede Anfrage an die PDF-Route zählen — das ist der eigentliche Nachweis.
    let abrufe = 0;
    page.on('request', (request) => {
      if (/\/api\/invoices\/[^/]+\/pdf/.test(request.url())) {
        abrufe += 1;
      }
    });

    try {
      await login(page);
      await openDraft(page);

      // Der erste Abruf gehört zum Seitenaufbau.
      await page.waitForTimeout(1_500);
      const nachDemLaden = abrufe;
      expect(nachDemLaden).toBeGreaterThan(0);

      // Eine Änderung, die im Beleg sichtbar wird, und speichern.
      const notiz = page.locator('textarea[name="introText"]');
      await notiz.fill(`Vorschau-Prüfung ${String(Date.now())}`);

      /*
       * Der Knopf wird über seine Beschriftung gewählt, nicht über
       * `button[type="submit"]`: Der erste absendende Knopf der Seite ist
       * „Abmelden" in der Seitenleiste. Diese Falle hat in diesem Projekt schon
       * einmal einen Testlauf gekostet.
       */
      await page.click('button:has-text("Als Entwurf speichern")');

      // Die Bestätigung sagt, dass gespeichert wurde …
      await page.waitForSelector('[role="status"]', { timeout: 30_000 });
      expect(page.url()).toContain('/invoices/');

      // … und danach muss der Rahmen erneut geholt haben. **Ohne** reload().
      const frist = Date.now() + 10_000;
      while (abrufe <= nachDemLaden && Date.now() < frist) {
        await page.waitForTimeout(200);
      }

      expect(abrufe).toBeGreaterThan(nachDemLaden);
    } finally {
      await context.close();
    }
  }, 180_000);
});
