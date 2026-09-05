/**
 * Der Renderdienst gegen denselben Vertrag wie der Renderer im Prozess
 * (M17, B3 — NFA-BETR-15).
 *
 * **Der Sinn ist der Vergleich.** Ein Dienst, der „so ähnlich" antwortet, wäre
 * genau der, an dem ein Beleg anders aussieht als in der Vorschau — und das
 * fiele erst am fertigen PDF auf, beim Empfänger. Deshalb wird hier dasselbe
 * HTML zweimal gesetzt und beides verglichen.
 *
 * Der Dienst läuft dafür wirklich: ein eigener Node-Prozess auf einem eigenen
 * Port, gestartet wie im Betrieb. Eine Attrappe prüfte, dass wir HTTP sprechen;
 * ein Prozess prüft, dass ein PDF herauskommt.
 */
import { spawn, type ChildProcess } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PAGE_GEOMETRY,
  type PdfRenderer,
  type PdfRenderOptions,
} from '@/domain/rendering/contracts';

const PORT = 3901;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const TOKEN = 'ein-hinreichend-langes-geheimnis';

const OPTIONS: PdfRenderOptions = { geometry: DEFAULT_PAGE_GEOMETRY, timeoutMs: 15_000 };
const HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>Probe</title></head>' +
  '<body><h1>Rechnung</h1><p>Ein Absatz.</p></body></html>';

let service: ChildProcess | undefined;

async function waitForService(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (service?.exitCode !== null && service?.exitCode !== undefined) {
      throw new Error(`Renderdienst endete vorzeitig mit Code ${String(service.exitCode)}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/health`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Noch nicht bereit.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Renderdienst war nicht erreichbar');
}

beforeAll(async () => {
  service = spawn('npx', ['tsx', 'scripts/renderer-server.ts'], {
    env: { ...process.env, RENDERER_PORT: String(PORT), RENDERER_TOKEN: TOKEN },
    stdio: 'pipe',
  });

  await waitForService();
}, 120_000);

afterAll(async () => {
  service?.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (service?.exitCode === null) {
    service.kill('SIGKILL');
  }
});

/**
 * Lädt den HTTP-Adapter **frisch** mit gesetzter Umgebung.
 *
 * `getEnv()` hält sein Ergebnis fest; ein Import, der vorher lief, kennt die
 * Adresse des Dienstes nicht mehr. `vi.resetModules()` statt einer
 * Rücksetzfunktion im Anwendungscode — dieselbe Bauart wie in `mailer.test.ts`
 * seit M14: Eine Klappe, die nur Tests benutzen, steht sonst für immer im
 * Quelltext.
 */
async function withRendererEnv<T>(
  values: Record<string, string>,
  run: (renderer: PdfRenderer) => Promise<T>,
): Promise<T> {
  const previous = { ...process.env };
  Object.assign(process.env, values);

  vi.resetModules();

  try {
    const { httpPdfRenderer } = await import('@/infrastructure/rendering/http-renderer');
    return await run(httpPdfRenderer);
  } finally {
    process.env = previous;
    vi.resetModules();
  }
}

describe('NFA-BETR-15 Der Renderdienst', () => {
  it('liefert ein PDF wie der Renderer im Prozess', async () => {
    const { playwrightPdfRenderer } = await import('@/infrastructure/rendering/playwright-renderer');
    const lokal = await playwrightPdfRenderer.render(HTML, OPTIONS);

    const entfernt = await withRendererEnv(
      { RENDERER_URL: BASE_URL, RENDERER_TOKEN: TOKEN },
      async (renderer) => renderer.render(HTML, OPTIONS),
    );

    expect(lokal.ok).toBe(true);
    expect(entfernt.ok).toBe(true);
    if (!lokal.ok || !entfernt.ok) return;

    expect(new TextDecoder().decode(entfernt.pdf.subarray(0, 5))).toBe('%PDF-');

    /*
     * **Verglichen wird die Größenordnung, nicht Byte für Byte.** Ein PDF
     * trägt einen Erzeugungszeitpunkt und eine Kennung; zwei Läufe sind nie
     * bytegleich. Gleiche Seitenzahl und annähernd gleiche Größe zeigen, dass
     * derselbe Satz herauskam — ein anderer Satz wiche um ein Vielfaches ab.
     */
    const abweichung = Math.abs(entfernt.pdf.length - lokal.pdf.length) / lokal.pdf.length;
    expect(abweichung).toBeLessThan(0.05);
  }, 120_000);

  it('weist eine Anfrage ohne Nachweis ab', async () => {
    // Der Dienst nimmt HTML entgegen und setzt es. Ohne Nachweis wäre er ein
    // Werkzeug zum Erzeugen beliebiger Dokumente für jeden, der ihn erreicht.
    const response = await fetch(`${BASE_URL}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html: HTML, options: OPTIONS }),
    });

    expect(response.status).toBe(401);
  }, 30_000);

  it('weist einen falschen Nachweis ab', async () => {
    const response = await fetch(`${BASE_URL}/health`, {
      headers: { authorization: 'Bearer das-ist-nicht-das-geheimnis' },
    });

    expect(response.status).toBe(401);
  }, 30_000);

  it('meldet einen nicht erreichbaren Dienst als Fehlschlag, nicht als Ausnahme', async () => {
    /*
     * Der Aufrufer soll seine Handlung zu Ende bringen: Wer festschreibt, hat
     * festgeschrieben — das PDF entsteht dann beim nächsten Abruf (FA-PDF-13).
     */
    const result = await withRendererEnv(
      { RENDERER_URL: 'http://127.0.0.1:1', RENDERER_TOKEN: TOKEN },
      async (renderer) => renderer.render(HTML, { ...OPTIONS, timeoutMs: 2_000 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('RENDER_FAILED');
  }, 60_000);
});
