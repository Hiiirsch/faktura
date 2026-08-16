/**
 * Der zweistufige Anmeldeweg im echten Browser (M6.2 — NFA-SEC-05, -07).
 *
 * Die Fachlogik ist in `two-step-login.test.ts` geprüft. Hier geht es um das,
 * was erst zwischen Browser, Cookie und Umleitungskette entsteht:
 *
 * - Der Nachweis liegt in einem Cookie mit `path=/login`. Wird er dort falsch
 *   gesetzt, sendet der Browser ihn beim Absenden des Codeformulars **nicht**
 *   mit — und die Anmeldung bricht mit „abgelaufen" ab, obwohl serverseitig
 *   alles stimmt. Im Typsystem sieht das identisch aus.
 * - Ein Konto ohne zweiten Faktor darf die zweite Seite gar nicht zu sehen
 *   bekommen.
 * - Die zweite Seite darf ohne Nachweis nichts zeigen.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  TEST_BASE_URL,
  TEST_TOTP_EMAIL,
  TEST_TOTP_SECRET,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from './setup/server';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser.close();
});

/** Ein gültiger Code für das Testkonto, zur echten Uhrzeit. */
function currentCode(): string {
  return new TOTP({
    issuer: 'Faktura',
    label: 'verify',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(TEST_TOTP_SECRET),
  }).generate();
}

async function open(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

async function submitPassword(page: Page, email: string): Promise<void> {
  await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#password', TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
}

describe('Konto ohne zweiten Faktor', () => {
  it('ist nach dem Passwort angemeldet und sieht die zweite Seite nie', async () => {
    const { page, close } = await open();

    await submitPassword(page, TEST_USER_EMAIL);
    await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 15_000 });

    expect(page.url()).toBe(`${TEST_BASE_URL}/`);
    await close();
  }, 90_000);
});

describe('Konto mit zweitem Faktor', () => {
  it('führt nach dem Passwort auf die Codeseite, ohne anzumelden', async () => {
    const { page, close } = await open();

    await submitPassword(page, TEST_TOTP_EMAIL);
    await page.waitForURL(/\/login\/code/, { timeout: 15_000 });

    // Auf der Seite steht genau ein Feld — kein Passwort, keine Adresse.
    expect(await page.locator('#code').count()).toBe(1);
    expect(await page.locator('#password').count()).toBe(0);

    // Und es gibt noch keine Sitzung: Die geschützte Seite bleibt zu.
    const response = await page.request.get(`${TEST_BASE_URL}/invoices`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect([302, 303, 307]).toContain(response.status());
    expect(response.headers()['location']).toContain('/login');

    await close();
  }, 90_000);

  it('meldet mit dem richtigen Code an', async () => {
    const { page, close } = await open();

    await submitPassword(page, TEST_TOTP_EMAIL);
    await page.waitForURL(/\/login\/code/, { timeout: 15_000 });

    await page.fill('#code', currentCode());
    await page.click('button[type="submit"]');
    await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 15_000 });

    expect(page.url()).toBe(`${TEST_BASE_URL}/`);
    await close();
  }, 90_000);

  it('bleibt bei falschem Code auf der Codeseite und meldet es', async () => {
    const { page, close } = await open();

    await submitPassword(page, TEST_TOTP_EMAIL);
    await page.waitForURL(/\/login\/code/, { timeout: 15_000 });

    await page.fill('#code', '000000');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login\/code\?error=invalid/, { timeout: 15_000 });

    // `p[role=alert]`, nicht `getByRole('alert')`: Next stellt einen eigenen
    // Ansager für Routenwechsel mit derselben Rolle daneben.
    expect(await page.locator('p[role="alert"]').textContent()).toContain('Bestätigungscode');
    await close();
  }, 90_000);

  it('verwirft den Nachweis auf Wunsch und beginnt von vorn', async () => {
    const { page, close } = await open();

    await submitPassword(page, TEST_TOTP_EMAIL);
    await page.waitForURL(/\/login\/code/, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Mit einem anderen Konto anmelden' }).click();
    await page.waitForURL(/\/login$/, { timeout: 15_000 });

    // Der Nachweis ist weg: Der Rückweg auf die Codeseite führt an den Anfang.
    await page.goto(`${TEST_BASE_URL}/login/code`, { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/login');
    expect(page.url()).not.toContain('/code');

    await close();
  }, 90_000);
});

describe('Die Codeseite ohne Nachweis', () => {
  it('zeigt nichts und leitet an den Anfang zurück', async () => {
    const { page, close } = await open();

    const response = await page.request.get(`${TEST_BASE_URL}/login/code`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    expect([302, 303, 307]).toContain(response.status());
    expect(response.headers()['location']).toContain('/login');
    // Kein Codefeld im Rumpf — die Seite wird gar nicht erst gesetzt.
    expect(await response.text()).not.toContain('id="code"');

    await close();
  }, 90_000);
});
