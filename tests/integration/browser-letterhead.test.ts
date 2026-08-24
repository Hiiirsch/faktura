/**
 * Briefpapier hochladen und austauschen, im echten Browser (M12 — FA-TPL-11,
 * FA-UI-01, FA-UI-28).
 *
 * **Warum das nur hier zu prüfen ist.** Der Auftraggeber hat gemeldet, das
 * Löschen habe nicht gewirkt: Nach dem Austauschen erschien der alte Bogen, bis
 * er die Seite neu lud. In der Datenbank war alles richtig, und jeder Test
 * gegen die Anwendungsschicht sagte dasselbe. Der Fehler saß dazwischen — eine
 * Vorschau an fester Adresse mit `max-age=60`, also im Zwischenspeicher des
 * Browsers. Ein Fehler, den nur ein Browser sehen kann.
 *
 * Geprüft wird deshalb genau das, was der Benutzer erlebt: hochladen, ansehen,
 * austauschen, **ohne** neu zu laden wieder ansehen.
 */
import { PDFDocument, rgb } from 'pdf-lib';
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

/** Ein A4-Bogen mit erkennbarer Fläche; die Farbe unterscheidet zwei Bögen. */
async function bogen(shade: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  const width = 595.276;
  const height = 841.89;
  document
    .addPage([width, height])
    .drawRectangle({ x: 0, y: 0, width, height, color: rgb(shade, 0.9, shade) });

  return Buffer.from(await document.save());
}

async function openCompanySettings(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', TEST_USER_EMAIL);
  await page.fill('#password', TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 15_000 });

  await page.goto(`${TEST_BASE_URL}/settings/company`, { waitUntil: 'networkidle' });

  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

/** Lädt einen Bogen über das Formular hoch und wartet auf die Bestätigung. */
async function uploadLetterhead(page: Page, content: Buffer, name: string): Promise<void> {
  await page.setInputFiles('input[name="letterhead"]', {
    name,
    mimeType: 'application/pdf',
    buffer: content,
  });
  await page.click('form:has(input[name="letterhead"]) button[type="submit"]');
  await page.waitForSelector('[role="status"]', { timeout: 20_000 });
}

/**
 * Welches Dokument die Vorschau zeigt.
 *
 * Seit M12 setzt die Anwendung das PDF selbst; im DOM steht deshalb kein
 * `<iframe src>` mehr, sondern `data-document` an der Ansicht.
 */
function frameSource(page: Page): Promise<string | null> {
  return page.getAttribute('[data-document*="/api/company/letterhead"]', 'data-document');
}

/**
 * Wartet, bis die Vorschau eine andere Adresse trägt als die übergebene.
 *
 * Die Frist ist knapp gewählt und das ist Absicht: „irgendwann" wäre keine
 * Zusage. Die Seite wird nach der Aktion durch `revalidatePath` neu gesetzt;
 * dauerte das Sekunden, wäre es aus Sicht des Benutzers dasselbe wie „geht
 * nicht" — genau der Eindruck, mit dem dieser Test begonnen hat.
 */
async function waitForChangedFrame(page: Page, previous: string | null): Promise<string | null> {
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    const current = await frameSource(page);
    if (current !== previous) {
      return current;
    }
    await page.waitForTimeout(100);
  }

  return frameSource(page);
}

describe('FA-TPL-11 Briefpapier im Browser', () => {
  it('zeigt den neuen Bogen ohne Neuladen der Seite', async () => {
    const { page, close } = await openCompanySettings();

    try {
      await uploadLetterhead(page, await bogen(0.85), 'erster.pdf');

      const erste = await frameSource(page);
      expect(erste).not.toBeNull();

      /*
       * Der zweite Bogen wird ohne `page.reload()` hochgeladen — genau der
       * Ablauf, bei dem der alte stehen blieb.
       */
      await uploadLetterhead(page, await bogen(0.4), 'zweiter.pdf');

      const zweite = await waitForChangedFrame(page, erste);
      expect(zweite).not.toBeNull();

      // Die Kennung reist als Version mit: andere Datei, andere Adresse.
      expect(zweite).not.toBe(erste);
    } finally {
      await close();
    }
  }, 120_000);

  it('liefert die Vorschau ohne Zwischenspeicher aus', async () => {
    // `max-age=60` an fester Adresse war die Ursache; die Kopfzeile hält das fest.
    const { page, close } = await openCompanySettings();

    try {
      await uploadLetterhead(page, await bogen(0.85), 'erster.pdf');

      const source = await frameSource(page);
      expect(source).not.toBeNull();

      const response = await page.request.get(`${TEST_BASE_URL}${source ?? ''}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control'] ?? '').toContain('no-store');
      expect(response.headers()['content-type'] ?? '').toContain('application/pdf');
    } finally {
      await close();
    }
  }, 120_000);

  it('beschriftet die Dateiauswahl auf Deutsch und in der Gestaltung der Anwendung', async () => {
    /*
     * Der eingebaute Knopf von `<input type="file">` gehört dem Browser: eigene
     * Fläche, eigene Ecken, und je nach Systemsprache „Choose File". Das Feld
     * liegt deshalb unter `sr-only`, und eine Beschriftung führt es.
     */
    const { page, close } = await openCompanySettings();

    try {
      const label = page.locator('label:has(+ span), label[for]').filter({
        hasText: 'Datei auswählen',
      });
      expect(await label.first().isVisible()).toBe(true);

      /*
       * Das Feld bleibt im Baum — ein per `display: none` verstecktes
       * Formularfeld sendet nichts, und ein Screenreader fände es nicht. Es ist
       * `sr-only`: für das Auge weg, für die Bedienung da. Playwright nennt das
       * „sichtbar", denn die Fläche ist nicht leer — sie ist 1 px.
       */
      const input = page.locator('input[name="letterhead"]');
      expect(await input.count()).toBe(1);

      const box = await input.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? 99).toBeLessThanOrEqual(1);
      expect(box?.height ?? 99).toBeLessThanOrEqual(1);

      // Und die Beschriftung öffnet es wirklich: Sie zeigt den Dateinamen an.
      await page.setInputFiles('input[name="letterhead"]', {
        name: 'mein-bogen.pdf',
        mimeType: 'application/pdf',
        buffer: await bogen(0.7),
      });
      await page.waitForSelector('text=mein-bogen.pdf', { timeout: 10_000 });
    } finally {
      await close();
    }
  }, 120_000);
});
