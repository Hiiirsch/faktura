/**
 * Passkeys im echten Browser (M9, B4, FA-PASS-03, -06).
 *
 * **Warum diese Ebene zusätzlich nötig ist.** `passkeys.test.ts` prüft, was der
 * Server aus einer Antwort macht — mit einem nachgebauten Authenticator, der
 * auch die Fälle herstellt, die ein echtes Gerät nie erzeugt. Was er nicht
 * prüfen kann, ist die andere Hälfte: ob der **Browser** die Zeremonie überhaupt
 * anstößt, ob die Optionen aus dem Server für ihn Sinn ergeben und ob das
 * Zusammenspiel aus Seite, Route und Cookie trägt.
 *
 * Chromium bringt dafür einen **virtuellen Authenticator** mit, ansprechbar über
 * das Debug-Protokoll. Er verhält sich wie ein eingebauter Sicherheitsschlüssel:
 * eigene Schlüsselpaare, eigener Zähler, automatische Nutzerverifikation.
 *
 * Beide Ebenen prüfen Verschiedenes, und keine ersetzt die andere.
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

/**
 * Rüstet die Seite mit einem virtuellen Authenticator aus.
 *
 * `hasUserVerification` und `isUserVerified` sind Pflicht: Die Anwendung verlangt
 * `userVerification: 'required'`, weil die Gerätesperre der zweite Faktor ist.
 * Ein virtueller Authenticator ohne sie würde abgewiesen — zu Recht.
 */
async function attachAuthenticator(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('WebAuthn.enable');
  await session.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** Meldet sich auf dem gewohnten Weg an — mit Passwort. */
async function signInWithPassword(page: Page): Promise<void> {
  await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', TEST_USER_EMAIL);
  await page.fill('#password', TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 20_000 });
}

describe('FA-PASS-03 / FA-PASS-06 Die Zeremonie im Browser', () => {
  it('legt einen Passkey an und meldet damit ohne Passwort an', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await attachAuthenticator(page);
      await signInWithPassword(page);

      // ── Anlegen ──────────────────────────────────────────────────────────
      await page.goto(`${TEST_BASE_URL}/settings/security`, { waitUntil: 'networkidle' });

      await page.fill('input[aria-describedby="passkey-label-hint"]', 'Prüfgerät');
      await page.click('button:has-text("Passkey anlegen")');

      // Die Seite lädt nach erfolgreicher Registrierung neu.
      await page.waitForSelector('text=Prüfgerät', { timeout: 20_000 });

      // ── Abmelden ─────────────────────────────────────────────────────────
      await page.click('button:has-text("Abmelden")');
      await page.waitForURL(`${TEST_BASE_URL}/login`, { timeout: 20_000 });

      // ── Anmelden, ohne etwas einzutippen ────────────────────────────────
      await page.click('button:has-text("Mit Passkey anmelden")');
      await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 20_000 });

      // Angemeldet: Die Übersicht ist da, und zwar ohne Passwort und ohne Code.
      expect(page.url()).toBe(`${TEST_BASE_URL}/`);
      expect(await page.locator('text=Übersicht').first().isVisible()).toBe(true);
    } finally {
      await context.close();
    }
  }, 120_000);

  /**
   * Ohne Authenticator bleibt der gewohnte Weg.
   *
   * Der Knopf ist da — die Adresse ist ein sicherer Kontext —, aber es gibt
   * nichts, womit sich anmelden ließe. Die Seite muss das aushalten, ohne
   * hängenzubleiben oder etwas zu behaupten.
   */
  it('bleibt die Anmeldeseite ohne Passkey benutzbar', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'networkidle' });

      // Der Passkey-Knopf steht neben dem Formular, nicht an seiner Stelle.
      expect(
        await page.locator('button:has-text("Mit Passkey anmelden")').isVisible(),
      ).toBe(true);
      expect(await page.locator('#email').isVisible()).toBe(true);
      expect(await page.locator('#password').isVisible()).toBe(true);

      // Und der gewohnte Weg trägt weiterhin.
      await signInWithPassword(page);
      expect(page.url()).toBe(`${TEST_BASE_URL}/`);
    } finally {
      await context.close();
    }
  }, 120_000);
});
