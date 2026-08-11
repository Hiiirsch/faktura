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

describe('Belegvorschau im Browser', () => {
  it('lädt den Rahmen und zeigt den Beleg darin', async () => {
    const { page, close } = await openFirstInvoice();

    const frame = page.frames().find((candidate) => candidate.url().includes('/preview'));
    expect(frame, 'Der Vorschaurahmen muss geladen sein').toBeDefined();

    const text = frame === undefined ? '' : (await frame.locator('body').innerText()).trim();

    expect(text).toContain('Musterbetrieb Tim');
    expect(text).toContain('Schulz KG');
    expect(text).toContain('Beratung');

    await close();
  }, 90_000);

  it('meldet keinen Verstoß gegen die Content Security Policy', async () => {
    const { consoleErrors, close } = await openFirstInvoice();

    const violations = consoleErrors.filter((message) => /Content Security Policy/i.test(message));

    expect(violations).toEqual([]);
    await close();
  }, 90_000);

  it('setzt auf der Vorschau das Dokumentprofil', async () => {
    const { page, close } = await openFirstInvoice();

    const frame = page.frames().find((candidate) => candidate.url().includes('/preview'));
    expect(frame).toBeDefined();

    if (frame !== undefined) {
      const response = await page.request.get(frame.url());

      expect(response.status()).toBe(200);
      expect(response.headers()['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
      expect(response.headers()['content-security-policy']).toContain('sandbox');
    }

    await close();
  }, 90_000);

  it('lädt den Beleg als PDF herunter', async () => {
    const { page, close } = await openFirstInvoice();

    const url = `${page.url().replace('/invoices/', '/api/invoices/')}/pdf`;
    const response = await page.request.get(url);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(response.headers()['content-disposition']).toContain('.pdf"');

    const body = await response.body();
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');

    await close();
  }, 90_000);
});
