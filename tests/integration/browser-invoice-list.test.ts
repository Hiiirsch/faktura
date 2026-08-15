/**
 * Zeilenaktionen und Mehrfachauswahl im echten Browser (FA-UI-17 bis -20).
 *
 * Warum im Browser und nicht gegen die Server Actions: Was hier zu beweisen
 * ist, steht gar nicht im TypeScript.
 *
 * - Die Zeilenaktionen liegen **in** dem Formular, das auch die Kästchen der
 *   Mehrfachauswahl trägt — verschachtelte Formulare erlaubt HTML nicht.
 *   Welche Zeile gemeint ist, sagt `name`/`value` des absendenden Knopfes,
 *   welche Handlung sein `formAction`. Ob der Browser das so überträgt, ist
 *   eine Frage an den Browser.
 * - Die Auswahlleiste erscheint über `:has(:checked)` in CSS. Eine Regel, die
 *   nicht greift, sieht im Quelltext genauso aus wie eine, die greift.
 * - Die Bestätigung ist ein natives `<dialog>`. Ob `showModal()` den Klick
 *   abfängt, statt das Formular sofort abzusenden, entscheidet sich zur
 *   Laufzeit.
 *
 * Geprüft wird mit den nackten Playwright-Abfragen und `expect` aus Vitest;
 * die Locator-Matcher gehören zu `@playwright/test`, das hier nicht läuft.
 *
 * Angemeldet wird über das echte Formular — der Server arbeitet auf einer
 * anderen Datenbankdatei als der Testprozess (siehe `setup/server.ts`).
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

/** Meldet sich an und öffnet die Rechnungsliste. */
async function openList(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', TEST_USER_EMAIL);
  await page.fill('#password', TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 15_000 });

  await page.goto(`${TEST_BASE_URL}/invoices`, { waitUntil: 'networkidle' });

  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

/** Das Einblenden dauert `--duration-dialog`; mit Reserve für die Messung. */
const REVEAL_MS = 400;

/** Die Deckkraft der Aktionsspalte einer Zeile — 0 heißt „eingeklappt". */
async function actionOpacity(page: Page): Promise<string> {
  return page
    .locator('tbody tr')
    .first()
    .locator('td:last-child > span')
    .evaluate((element) => getComputedStyle(element).opacity);
}

/**
 * Die erste Zeile, die eine bestimmte Aktion anbietet.
 *
 * Nicht „die erste Zeile": Die Browsertests teilen sich einen Bestand und
 * setzen ihn nicht zurück. Wer eine Rechnung bezahlt, nimmt sie dem nächsten
 * Fall weg — gesucht wird deshalb nach der Handlung, nicht nach der Position.
 */
function rowOffering(page: Page, action: string) {
  return page
    .locator('tbody tr')
    .filter({ has: page.getByRole('button', { name: action }) })
    .first();
}

describe('FA-UI-19 Zeilenaktionen', () => {
  it('trägt die Aktionen in der Zeile und beschriftet sie für Hilfstechnik', async () => {
    const { page, close } = await openList();
    const row = page.locator('tbody tr').first();

    // Ein Symbol ist für einen Screenreader kein Wort — jede Aktion trägt
    // deshalb eine Beschriftung, über die sie auffindbar ist.
    expect(await row.getByRole('link', { name: 'PDF herunterladen' }).count()).toBe(1);
    expect(await row.getByRole('button', { name: 'Duplizieren' }).count()).toBe(1);

    await close();
  }, 90_000);

  it('klappt die Aktionen bei Hover und bei Tastaturfokus auf', async () => {
    const { page, close } = await openList();
    const row = page.locator('tbody tr').first();

    // Im Ruhezustand steht die Zeile für sich.
    expect(await actionOpacity(page)).toBe('0');

    await row.hover();
    // Abgewartet, nicht sofort gemessen: Das Einblenden ist ein Übergang von
    // 160 ms (§2.4). Ohne die Pause misst man den Wert mitten im Flug.
    await page.waitForTimeout(REVEAL_MS);
    expect(await actionOpacity(page)).toBe('1');

    // `group-focus-within` ist der Teil, den man beim Bauen vergisst — ohne
    // ihn sind die Aktionen für alle unerreichbar, die nicht mit der Maus
    // arbeiten (NFA-UI-03).
    await page.mouse.move(0, 0);
    await row.getByRole('button', { name: 'Duplizieren' }).focus();
    await page.waitForTimeout(REVEAL_MS);
    expect(await actionOpacity(page)).toBe('1');

    await close();
  }, 90_000);

  it('markiert einen Beleg als bezahlt und meldet es', async () => {
    const { page, close } = await openList();
    const row = rowOffering(page, 'Als bezahlt markieren');
    expect(await row.count(), 'Der Ausgangsbestand muss einen offenen Beleg haben').toBe(1);

    await row.hover();
    await row.getByRole('button', { name: 'Als bezahlt markieren' }).click();

    // Umleitung mit Schlüssel in der Adresse — daraus entsteht die Meldung
    // (FA-UI-18).
    await page.waitForURL(/erledigt=paid/, { timeout: 20_000 });

    const toast = page.getByRole('status');
    await toast.waitFor({ state: 'visible', timeout: 10_000 });
    expect(await toast.textContent()).toContain('bezahlt');

    // Und irgendein Beleg trägt jetzt den neuen Zustand.
    expect(await page.locator('tbody').textContent()).toContain('Bezahlt');

    await close();
  }, 90_000);
});

describe('FA-UI-17 Bestätigung als Dialog', () => {
  it('fragt vor dem Stornieren im Dialog statt im Browserfenster', async () => {
    const { page, close } = await openList();

    // Ein `window.confirm` bliebe ohne diesen Zähler unbemerkt: Playwright
    // weist es stillschweigend ab, und die Aktion liefe einfach nicht.
    let nativeConfirms = 0;
    page.on('dialog', (dialog) => {
      nativeConfirms += 1;
      void dialog.dismiss();
    });

    const row = rowOffering(page, 'Stornieren');
    expect(await row.count(), 'Ein offener Beleg lässt sich stornieren').toBe(1);

    await row.hover();
    await row.getByRole('button', { name: 'Stornieren' }).click();

    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // Der Dialog nennt die Folge, nicht die Frage (§8).
    expect(await dialog.textContent()).toContain('Stornorechnung');
    expect(nativeConfirms).toBe(0);

    // Escape schließt — das kommt vom Browser, nicht aus nachgebautem Code.
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });

    await close();
  }, 90_000);
});

describe('FA-UI-20 Mehrfachauswahl', () => {
  it('blendet die Auswahlleiste erst mit der ersten Auswahl ein', async () => {
    const { page, close } = await openList();

    const bulkDelete = page.getByRole('button', { name: 'Entwürfe löschen' });
    expect(await bulkDelete.isVisible()).toBe(false);

    await page.locator('input[name="invoiceIds"]').first().check();

    // Die Sichtbarkeit entsteht in CSS (`:has(:checked)`), nicht in React.
    await bulkDelete.waitFor({ state: 'visible', timeout: 10_000 });
    expect(await bulkDelete.isVisible()).toBe(true);

    await close();
  }, 90_000);

  it('nennt die Anzahl der gewählten Belege', async () => {
    const { page, close } = await openList();

    const boxes = page.locator('input[name="invoiceIds"]');
    const count = await boxes.count();
    expect(count).toBeGreaterThan(0);

    await boxes.first().check();
    await page.getByText('1 Rechnung gewählt').waitFor({ state: 'visible', timeout: 10_000 });

    if (count > 1) {
      await boxes.nth(1).check();
      await page.getByText('2 Rechnungen gewählt').waitFor({ state: 'visible', timeout: 10_000 });
    }

    await close();
  }, 90_000);
});
