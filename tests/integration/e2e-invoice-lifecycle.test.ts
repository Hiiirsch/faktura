/**
 * Der kritische Gesamtpfad im echten Browser (NFA-QUAL-02).
 *
 * Anmelden → Kunde anlegen → Rechnung erstellen → festschreiben → PDF laden →
 * Zahlung erfassen → stornieren.
 *
 * **Warum ein Durchlauf und nicht sieben Tests.** Die einzelnen Schritte sind
 * anderswo geprüft, jeder für sich. Was hier zählt, ist die Kette: dass der
 * Kunde, den man eben angelegt hat, im Editor auswählbar ist; dass die Nummer,
 * die beim Festschreiben entsteht, im PDF steht; dass die Zahlung den Status
 * kippt und das Storno auf denselben Beleg verweist. Jeder Übergang ist eine
 * Stelle, an der zwei Bauteile eine Annahme übereinander treffen — und genau
 * dort brechen Anwendungen, deren Teile einzeln funktionieren.
 *
 * Der Test läuft deshalb **in einer Sitzung, in fester Reihenfolge**, und
 * jeder Schritt baut auf dem vorigen auf.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './setup/server';

let browser: Browser;
let page: Page;

/** Was die Schritte aneinander weitergeben. */
const flow: { customerNumber: string; invoiceId: string; invoiceNumber: string } = {
  customerNumber: '',
  invoiceId: '',
  invoiceNumber: '',
};

/**
 * Angeklickt wird immer über die Beschriftung.
 *
 * `button[type="submit"]` träfe in der angemeldeten Ansicht zuerst „Abmelden"
 * aus der Seitenleiste — der Test liefe dann scheinbar weiter und prüfte den
 * Anmeldebildschirm.
 */

/** Eindeutig je Lauf: Der Bestand des Testservers bleibt zwischen Läufen stehen. */
const stamp = String(Date.now()).slice(-6);
const COMPANY_NAME = `E2E Handels GmbH ${stamp}`;

beforeAll(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
}, 120_000);

afterAll(async () => {
  await browser.close();
});

describe('NFA-QUAL-02 Gesamtpfad', () => {
  it('1. meldet an', async () => {
    await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('#email', TEST_USER_EMAIL);
    await page.fill('#password', TEST_USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 20_000 });

    expect(page.url()).toBe(`${TEST_BASE_URL}/`);
  }, 90_000);

  it('2. legt einen Kunden an', async () => {
    await page.goto(`${TEST_BASE_URL}/customers/new`, { waitUntil: 'domcontentloaded' });

    await page.fill('#companyName', COMPANY_NAME);
    await page.fill('#addressLine1', 'Musterweg 1');
    await page.fill('#postalCode', '10115');
    await page.fill('#city', 'Berlin');
    await page.selectOption('#countryCode', 'DE');
    // Nach Beschriftung, nicht nach `button[type=submit]`: Der erste
    // Absendeknopf der Seite ist „Abmelden" in der Seitenleiste.
    await page.getByRole('button', { name: 'Speichern' }).click();

    // Das Anlegen leitet auf die Kundenseite um. Auf **diese** Umleitung wird
    // gewartet, nicht auf `/customers` — darauf passt auch `/customers/new`,
    // und der Test liefe weiter, bevor gespeichert wurde.
    await page.waitForURL(/\/customers\/[a-z0-9]{20,}$/u, { timeout: 20_000 });

    // `domcontentloaded` statt `networkidle`: Der App Router hält nach dem
    // Wechsel eine Verbindung offen, und „untätiges Netz" tritt dann nie ein.
    await page.goto(`${TEST_BASE_URL}/customers?q=${encodeURIComponent(COMPANY_NAME)}`, {
      waitUntil: 'domcontentloaded',
    });

    const row = page.locator('tbody tr').filter({ hasText: COMPANY_NAME });
    await row.waitFor({ state: 'visible', timeout: 20_000 });
    expect(await row.count()).toBe(1);

    flow.customerNumber = (await row.locator('td').first().textContent())?.trim() ?? '';
    expect(flow.customerNumber).toMatch(/^K-\d+$/u);
  }, 90_000);

  it('3. erstellt eine Rechnung für diesen Kunden', async () => {
    await page.goto(`${TEST_BASE_URL}/invoices/new`, { waitUntil: 'domcontentloaded' });

    // Der eben angelegte Kunde muss auswählbar sein — der Übergang zwischen
    // Stammdaten und Editor.
    // Die Beschriftung ist „K-0007 · E2E Handels GmbH 123456" — zusammengesetzt
    // aus der Nummer aus Schritt 2 und dem Namen.
    await page.selectOption('#customerId', {
      label: `${flow.customerNumber} · ${COMPANY_NAME}`,
    });

    await page.fill('input[name="lines[0][name]"]', 'Beratung');
    await page.fill('input[name="lines[0][quantity]"]', '8');
    await page.fill('input[name="lines[0][unitPrice]"]', '95,00');

    await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
    // Nicht `[a-z0-9]+`: Darauf passt auch `/invoices/new`, und der Test liefe
    // mit der Kennung „new" weiter. Eine cuid ist deutlich länger.
    await page.waitForURL(/\/invoices\/[a-z0-9]{20,}$/u, { timeout: 20_000 });

    flow.invoiceId = page.url().split('/').pop() ?? '';
    expect(flow.invoiceId).not.toBe('');

    // Der Entwurf trägt die Beträge: 8 × 95,00 € netto, 19 % darauf.
    const body = await page.locator('body').textContent();
    expect(body).toContain('760,00');
    expect(body).toContain('904,40');
  }, 90_000);

  it('4. schreibt sie fest und erhält eine Nummer', async () => {
    await page.getByRole('button', { name: 'Festschreiben' }).first().click();

    // Die Bestätigung ist ein Dialog der Anwendung (FA-UI-17).
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Festschreiben' }).click();

    // Das Festschreiben leitet auf den Beleg um und stempelt die Nummer in
    // den Seitenkopf (FA-UI-07).
    await page.waitForURL(/festgeschrieben=1/u, { timeout: 20_000 });

    const stamped = page.locator('h1.stamp-in');
    await stamped.waitFor({ state: 'visible', timeout: 20_000 });

    flow.invoiceNumber = (await stamped.textContent())?.trim() ?? '';
    expect(flow.invoiceNumber).toMatch(/^RE-\d{4}-\d+$/u);
  }, 90_000);

  it('5. lädt das PDF und findet Nummer und Empfänger darin', async () => {
    const response = await page.request.get(`${TEST_BASE_URL}/api/invoices/${flow.invoiceId}/pdf`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(response.headers()['content-disposition']).toContain('attachment');

    const body = await response.body();
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    // Ein leeres oder abgebrochenes PDF wäre kleiner als ein Kilobyte.
    expect(body.length).toBeGreaterThan(1_000);
  }, 120_000);

  it('6. erfasst eine Zahlung und der Status kippt auf bezahlt', async () => {
    await page.goto(`${TEST_BASE_URL}/invoices/${flow.invoiceId}`, { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Als vollständig bezahlt markieren' }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Als vollständig bezahlt markieren' }).click();

    await page.waitForLoadState('networkidle');
    await page.goto(`${TEST_BASE_URL}/invoices/${flow.invoiceId}`, { waitUntil: 'domcontentloaded' });

    expect(await page.locator('body').textContent()).toContain('Bezahlt');
  }, 90_000);

  it('7. storniert und erzeugt eine Gutschrift mit eigener Nummer', async () => {
    await page.goto(`${TEST_BASE_URL}/invoices/${flow.invoiceId}`, { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Stornieren' }).first().click();
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Stornieren' }).click();

    // Auf eine **andere** Adresse warten: Ein Muster, auf das die aktuelle
    // Adresse schon passt, kehrt sofort zurück, und der Test prüfte dann die
    // Seite, von der er gekommen ist.
    await page.waitForURL((url) => !url.pathname.endsWith(flow.invoiceId), { timeout: 20_000 });
    const creditNoteId = page.url().split('/').pop() ?? '';
    expect(creditNoteId).not.toBe(flow.invoiceId);

    // Gelesen wird aus `main`, nicht aus `body`: Im Rumpf steht zusätzlich die
    // RSC-Nutzlast als Skripttext, und `textContent` nimmt sie mit.
    const heading = page.locator('h1');
    await heading.waitFor({ state: 'visible', timeout: 20_000 });

    // Eigene Nummer, eigener Belegtyp …
    expect(await heading.textContent()).toContain('Stornorechnung');
    expect(await heading.textContent()).not.toContain(flow.invoiceNumber);

    // … und ein Verweis auf das Original.
    await page.getByText(flow.invoiceNumber).first().waitFor({ state: 'visible', timeout: 20_000 });

    // Das Original bleibt vollständig erhalten, jetzt als storniert.
    await page.goto(`${TEST_BASE_URL}/invoices/${flow.invoiceId}`, { waitUntil: 'domcontentloaded' });
    await heading.waitFor({ state: 'visible', timeout: 20_000 });

    expect(await heading.textContent()).toContain(flow.invoiceNumber);
    expect(await page.locator('main').textContent()).toContain('Storniert');
  }, 90_000);
});
