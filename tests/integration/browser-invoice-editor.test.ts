/**
 * Der Rechnungseditor im echten Browser (M12 — FA-RECH-12, FA-UI-10, FA-UI-17).
 *
 * **Anlass war eine Meldung des Auftraggebers:** „Der Klick auf Festschreiben
 * geht nicht." Die Ursache stand am Ende in der Konsole und sonst nirgends:
 *
 *     An invalid form control with name='lines[0][name]' is not focusable.
 *
 * Ein modaler Dialog macht alles hinter sich `inert`. Ist im Formular ein
 * Pflichtfeld leer, will der Browser es beim Absenden anspringen, kann es
 * nicht — und bricht **wortlos** ab. Keine Meldung, keine Bewegung, ein toter
 * Knopf. Nur ein Browser kann das zeigen: Server, Typsystem und
 * Anwendungstests sehen einen Vorgang, der nie beginnt.
 *
 * **Zur Reihenfolge.** Das Festschreiben speichert zuerst den Formularstand —
 * sonst schriebe man etwas anderes fest als das Sichtbare. Ein Fall, der einen
 * unvollständigen Stand absendet, hinterlässt also einen unvollständigen
 * Entwurf. Deshalb arbeitet jeder Fall nach dem ersten auf einer **Kopie**,
 * die er sich selbst anlegt.
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

/** Öffnet den Entwurf aus dem Ausgangsbestand. */
async function openSeededDraft(page: Page): Promise<void> {
  await page.goto(`${TEST_BASE_URL}/invoices?status=DRAFT`, { waitUntil: 'networkidle' });
  await page.click('table a[href^="/invoices/"]');
  await page.waitForSelector('canvas[aria-label]', { timeout: 30_000 });
}

/**
 * Legt eine **Kopie** eines beliebigen Belegs an und öffnet sie.
 *
 * Das Duplizieren erzeugt einen vollständigen Entwurf mit Positionen — der
 * saubere Ausgangspunkt für Fälle, die den Bestand verändern.
 */
async function openFreshDraft(page: Page): Promise<void> {
  await page.goto(`${TEST_BASE_URL}/invoices`, { waitUntil: 'networkidle' });
  await page.click('table a[href^="/invoices/"]');
  await page.waitForSelector('canvas[aria-label]', { timeout: 30_000 });

  await page.click('button:has-text("Duplizieren")');
  await page.waitForTimeout(2_000);
  await page.waitForSelector('input[name="lines[0][name]"]', { timeout: 30_000 });
}

describe('FA-RECH-12 Festschreiben aus dem Editor', () => {
  it('öffnet die Rückfrage und schreibt fest', async () => {
    // Zuerst und auf dem unberührten Entwurf: Er ist vollständig.
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openSeededDraft(page);

      await page.locator('button:has-text("Festschreiben")').first().click();
      await page.waitForTimeout(500);

      const offen = await page.evaluate(() =>
        [...document.querySelectorAll('dialog')].some(
          (element) => element.open && (element.textContent ?? '').includes('festschreiben'),
        ),
      );
      expect(offen).toBe(true);

      await page.locator('dialog[open] button:has-text("Festschreiben")').click();
      await page.waitForURL(/festgeschrieben=1/, { timeout: 30_000 });
    } finally {
      await context.close();
    }
  }, 180_000);

  it('nennt das fehlende Feld, statt wortlos nichts zu tun', async () => {
    /*
     * Der gemeldete Fehler. Vorher: Dialog auf, „Festschreiben" gedrückt,
     * nichts geschieht. Jetzt wird **vor** dem Öffnen geprüft — solange das
     * Formular noch bedienbar ist — und der Browser springt das leere Feld an.
     */
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openFreshDraft(page);

      await page.fill('input[name="lines[0][name]"]', '');
      await page.locator('button:has-text("Festschreiben")').first().click();
      await page.waitForTimeout(1_000);

      // Keine Rückfrage — es gäbe nichts zu bestätigen.
      const offen = await page.evaluate(() =>
        [...document.querySelectorAll('dialog')].some((element) => element.open),
      );
      expect(offen).toBe(false);

      // Stattdessen steht der Zeiger im leeren Pflichtfeld.
      const angesprungen = await page.evaluate(
        () => document.activeElement?.getAttribute('name') ?? '',
      );
      expect(angesprungen).toBe('lines[0][name]');
    } finally {
      await context.close();
    }
  }, 180_000);

  it('setzt die Vorschau ohne Seitenfehler, auch bei schnellem Zoomen', async () => {
    /*
     * Zwei Zeichnungen auf derselben Leinwand weist pdf.js ab, und das trifft
     * im Alltag zu: Wer zweimal schnell auf „Größer" drückt, löst die zweite
     * aus, während die erste läuft. Der Fehler landete als unbehandelter
     * Seitenfehler in der Konsole — gefunden bei der Suche nach dem toten Knopf.
     */
    const context = await browser.newContext();
    const page = await context.newPage();
    const seitenfehler: string[] = [];
    page.on('pageerror', (error) => seitenfehler.push(error.message));

    try {
      await login(page);
      await openSeededDraft(page);

      for (let klick = 0; klick < 4; klick += 1) {
        await page.click('button[aria-label="Größer"]');
      }
      await page.waitForTimeout(2_000);

      expect(seitenfehler).toEqual([]);
    } finally {
      await context.close();
    }
  }, 180_000);

  it('bringt eine Ablehnung des Servers ins Blickfeld', async () => {
    /*
     * Zuletzt, weil dieser Fall einen unvollständigen Stand speichert.
     *
     * Eine Rechnung ohne Position besteht die Prüfung des Browsers — es gibt
     * kein ungültiges Feld, es gibt gar keins — und scheitert am Server. Die
     * Meldung steht oben im Formular, der Knopf unten: Ohne den Sprung dorthin
     * sähe auch das aus wie „der Knopf tut nichts".
     */
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openFreshDraft(page);

      await page.locator('button[aria-label="Entfernen"], button:has-text("Entfernen")').first().click();
      await page.waitForTimeout(300);

      await page.locator('button:has-text("Festschreiben")').first().click();
      await page.waitForTimeout(500);
      await page.locator('dialog[open] button:has-text("Festschreiben")').click();

      const meldung = page.locator('[data-alert="error"]').first();
      await meldung.waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(1_500);

      const sichtbar = await meldung.evaluate((element) => {
        const kasten = element.getBoundingClientRect();
        return kasten.top >= 0 && kasten.bottom <= window.innerHeight;
      });

      expect(sichtbar).toBe(true);
    } finally {
      await context.close();
    }
  }, 180_000);
});
