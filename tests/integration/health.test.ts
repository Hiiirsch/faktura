/**
 * Healthcheck (NFA-BETR-08, NFA-SEC-18).
 *
 * Zwei Zusagen, die auseinanderfallen können:
 *
 * - Er prüft **beide** Bestandteile. Ein Dienst, dessen Chromium nicht
 *   startet, nimmt Rechnungen entgegen und liefert keine einzige aus; ohne die
 *   zweite Prüfung meldete er sich dabei als betriebsbereit. Geprüft wird durch
 *   Starten, nicht durch das Vorhandensein einer Datei — genau der Fall, dass
 *   die Sandbox im Container scheitert, liegt sonst außerhalb der Sicht.
 * - Er verrät nichts. Die Antwort trägt „ok" oder „error" und sonst nichts:
 *   keine Versionsnummer, keinen Pfad, keinen Fehlertext (NFA-SEC-18).
 */
import { describe, expect, it } from 'vitest';

import { checkSystemStatus } from '@/application/system/check-system-status';
import { closeRenderer } from '@/infrastructure/rendering/playwright-renderer';

import { TEST_BASE_URL } from './setup/server';

describe('NFA-BETR-08 Healthcheck', () => {
  it('prüft Datenbank und Renderer', async () => {
    const status = await checkSystemStatus();

    expect(status.components.database).toBe('UP');
    expect(status.components.renderer).toBe('UP');
    expect(status.healthy).toBe(true);

    // Der Browser bleibt für die übrigen Tests offen; hier wird er
    // ausdrücklich abgebaut, damit dieser Test keinen Prozess hinterlässt.
    await closeRenderer();
  }, 120_000);

  it('meldet den Zustand ohne Anmeldung — Container können sich nicht anmelden', async () => {
    const response = await fetch(`${TEST_BASE_URL}/api/health`, { redirect: 'manual' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  }, 120_000);

  it('gibt in der Antwort nichts über den Aufbau preis (NFA-SEC-18)', async () => {
    const response = await fetch(`${TEST_BASE_URL}/api/health`);
    const body = await response.text();

    // Weder Komponentennamen noch Pfade noch Versionen.
    for (const leak of ['database', 'renderer', 'chromium', 'prisma', '/app', 'Error']) {
      expect(body.toLowerCase()).not.toContain(leak.toLowerCase());
    }

    expect(response.headers.get('cache-control')).toBe('no-store');
  }, 120_000);
});
