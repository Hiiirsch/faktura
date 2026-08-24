/**
 * Die Belegvorschau im echten Browser (FA-PDF-01, -02; FA-UI-02; NFA-SEC-17).
 *
 * Dieser Test existiert, weil drei Fehler nacheinander an allem anderen
 * vorbeigekommen sind. Sie zeigten sich weder im Typsystem noch in den
 * Kopfzeilen einer `fetch`-Antwort, sondern erst, wenn ein Browser die Seite
 * zusammensetzt.
 *
 * Der letzte davon: Die Content Security Policy der **einbettenden** Seite
 * ließ `frame-src` auf `default-src 'none'` zurückfallen. Die Vorschau
 * lieferte einwandfreies HTML mit einwandfreien Kopfzeilen — der Browser lud
 * den Rahmen trotzdem nicht, und man sah eine weiße Fläche. Kein Test, der
 * Antworten prüft, hätte das gefunden; nur einer, der einbettet.
 *
 * Seit M5.6 steht in der Vorschau das PDF selbst, seit M12 setzt die Anwendung
 * es mit eigenen Mitteln (`PdfViewer`). Die Zusage hat sich damit verschoben,
 * nicht erledigt: Früher musste der eingebaute Betrachter des Browsers unter
 * unserer Richtlinie starten, heute muss es der Worker von pdf.js. Beides kann
 * nur ein Browser beantworten.
 *
 * Angemeldet wird über das echte Formular. Der Grund ist nicht Gründlichkeit,
 * sondern Notwendigkeit: Der Server arbeitet auf einer anderen Datenbankdatei
 * als der Testprozess (siehe `setup/server.ts`). Eine hier angelegte Sitzung
 * sähe er nicht. Der Ausgangsbestand steht deshalb in `setup/seed-user.ts`.
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

type OpenedInvoice = {
  readonly page: Page;
  readonly consoleErrors: readonly string[];
  readonly close: () => Promise<void>;
};

/** Meldet sich über das Formular an und öffnet den ersten Beleg. */
async function openFirstInvoice(): Promise<OpenedInvoice> {
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', TEST_USER_EMAIL);
  await page.fill('#password', TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 15_000 });

  await page.goto(`${TEST_BASE_URL}/invoices`, { waitUntil: 'networkidle' });

  // Die Nummernspalte verlinkt den Beleg; der Ausgangsbestand enthält genau
  // einen festgeschriebenen. Die Adresse wird ausgelesen und angesteuert statt
  // angeklickt: Ein Klick hängt daran, dass nichts darüberliegt — das prüft
  // dieser Test nicht, und ein verdeckter Verweis wäre eine irreführende
  // Fehlermeldung.
  const href = await page.locator('table a[href^="/invoices/"]').first().getAttribute('href');
  expect(href, 'Die Liste muss den Beleg verlinken').not.toBeNull();

  await page.goto(`${TEST_BASE_URL}${href ?? ''}`, { waitUntil: 'networkidle' });

  return {
    page,
    consoleErrors,
    close: async () => {
      await context.close();
    },
  };
}

/**
 * Die Adresse, die die Vorschau zeigt.
 *
 * **Seit M12 steht sie nicht mehr in einem `<iframe src>`**: Die Anwendung
 * setzt das PDF selbst und nennt die Datei über `data-document`. Der Rest
 * dieses Tests bleibt, wie er war — die Frage ist dieselbe geblieben: Kommt
 * das PDF wirklich an, oder sieht man nur eine weiße Fläche?
 */
async function previewSource(page: Page): Promise<string> {
  const source = await page.locator('[data-document]').first().getAttribute('data-document');
  return source ?? '';
}

describe('Belegvorschau im Browser', () => {
  it('lädt das PDF in den Rahmen', async () => {
    const { page, close } = await openFirstInvoice();

    const source = await previewSource(page);
    expect(source, 'Die Belegseite muss einen Vorschaurahmen tragen').not.toBe('');
    expect(source).toContain('/pdf');
    expect(source).toContain('inline=1');

    const response = await page.request.get(new URL(source, TEST_BASE_URL).toString());

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(response.headers()['content-disposition']).toContain('inline');

    const body = await response.body();
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');

    await close();
  }, 90_000);

  it('meldet keinen Verstoß gegen die Content Security Policy', async () => {
    const { consoleErrors, close } = await openFirstInvoice();

    const violations = consoleErrors.filter((message) => /Content Security Policy/i.test(message));

    expect(violations).toEqual([]);
    await close();
  }, 90_000);

  it('setzt auf der Vorschau das PDF-Profil', async () => {
    const { page, close } = await openFirstInvoice();

    const source = await previewSource(page);
    const response = await page.request.get(new URL(source, TEST_BASE_URL).toString());
    const policy = response.headers()['content-security-policy'] ?? '';

    expect(response.headers()['x-frame-options']).toBe('SAMEORIGIN');
    expect(policy).toContain("frame-ancestors 'self'");
    /*
     * **Kein** `sandbox`. Der Grund hat sich mit M12 geändert und besteht
     * fort: Die Vorschau bettet nicht mehr ein, aber dieselbe Adresse wird
     * weiterhin direkt geöffnet und heruntergeladen — unter `sandbox` startet
     * der Betrachter des Browsers dann nicht.
     */
    expect(policy).not.toContain('sandbox');

    await close();
  }, 90_000);

  it('lädt den Beleg als PDF herunter', async () => {
    const { page, close } = await openFirstInvoice();

    const url = `${page.url().replace('/invoices/', '/api/invoices/')}/pdf`;
    const response = await page.request.get(url);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    // Ohne `?inline=1` bleibt es ein Download.
    expect(response.headers()['content-disposition']).toContain('attachment');
    expect(response.headers()['content-disposition']).toContain('.pdf"');

    const body = await response.body();
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');

    await close();
  }, 90_000);
});
