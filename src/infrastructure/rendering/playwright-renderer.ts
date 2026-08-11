/**
 * PDF-Erzeugung mit Playwright/Chromium
 * (Spec §8.2, §8.4; NFA-SEC-12, -13, -14; FA-PDF-04 bis -07; NFA-ARCH-07).
 *
 * Drei Zusagen, die hier durchgesetzt werden:
 *
 * 1. **Kein Netzwerkzugriff** (NFA-SEC-12). Eine hochgeladene Vorlage ist
 *    fremder Inhalt. Ein `<img src="http://interner-dienst/…">` wäre sonst ein
 *    Weg, aus dem Netz des Servers zu lesen oder Daten abfließen zu lassen.
 *    Abgefangen wird über Request-Interception: erlaubt sind ausschließlich
 *    `data:`-URIs und das Dokument selbst.
 * 2. **Kein JavaScript** (NFA-SEC-13). Eine Vorlage soll setzen, nicht rechnen.
 * 3. **Zeitliche Begrenzung** (NFA-SEC-14). Eine Vorlage mit ungünstigem CSS
 *    kann Chromium beliebig lange beschäftigen; nach dem Timeout wird
 *    abgebrochen und die Seite geschlossen.
 *
 * Der Browser bleibt zwischen Aufrufen bestehen. Ein Kaltstart kostet mehrere
 * hundert Millisekunden — bei jedem Beleg erneut wäre das die Hälfte des
 * Zeitbudgets aus FA-PDF-10.
 */
import { type Browser, chromium, type Page } from 'playwright';

import { getEnv } from '@/infrastructure/config/env';
import type {
  PdfRenderer,
  PdfRenderOptions,
  PdfRenderResult,
} from '@/domain/rendering/contracts';

let browserPromise: Promise<Browser> | undefined;

async function getBrowser(): Promise<Browser> {
  const executablePath = getEnv().CHROMIUM_PATH;

  browserPromise ??= chromium.launch({
    // Ausdrücklich **ohne** `--no-sandbox`: Spec §11.3. Der Container stellt
    // stattdessen ein seccomp-Profil und User-Namespaces bereit.
    args: ['--disable-dev-shm-usage', '--font-render-hinting=none'],
    // Im Container das Chromium der Distribution, lokal das mitgelieferte.
    ...(executablePath === undefined ? {} : { executablePath }),
  });

  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = undefined;
    return getBrowser();
  }
  return browser;
}

/** Schließt den Browser — für den geordneten Abbau in Tests und beim Beenden. */
export async function closeRenderer(): Promise<void> {
  if (browserPromise === undefined) {
    return;
  }
  const browser = await browserPromise;
  browserPromise = undefined;
  await browser.close();
}

/**
 * Sperrt jeden ausgehenden Zugriff.
 *
 * `data:`-URIs bleiben erlaubt — darüber bindet die Standardvorlage ihre
 * Schrift und ein hochgeladenes Logo ein, ohne das Netz zu berühren.
 */
async function blockNetwork(page: Page, blocked: string[]): Promise<void> {
  await page.route('**/*', (route) => {
    const url = route.request().url();

    if (url.startsWith('data:') || url.startsWith('about:')) {
      void route.continue();
      return;
    }

    blocked.push(url);
    void route.abort('blockedbyclient');
  });
}

export const playwrightPdfRenderer: PdfRenderer = {
  async render(html: string, options: PdfRenderOptions): Promise<PdfRenderResult> {
    let page: Page | undefined;
    const blocked: string[] = [];

    try {
      const browser = await getBrowser();
      const context = await browser.newContext({
        // NFA-SEC-13: Kein Skript im Rendering-Kontext.
        javaScriptEnabled: false,
        offline: true,
      });

      page = await context.newPage();
      page.setDefaultTimeout(options.timeoutMs);
      await blockNetwork(page, blocked);

      // `setContent` statt einer URL: Das Dokument entsteht im Speicher, es
      // gibt keinen Pfad, über den jemand anderes darauf zugreifen könnte.
      await page.setContent(html, { waitUntil: 'load', timeout: options.timeoutMs });

      const { geometry } = options;
      const pdf = await page.pdf({
        format: geometry.format,
        printBackground: true,
        // Kopf- und Fußzeile über Playwright, nicht über CSS (Spec §8.2):
        // nur so wiederholen sie sich auf jeder Seite und kennen die
        // Seitenzahl (FA-PDF-06).
        displayHeaderFooter: true,
        headerTemplate: options.headerTemplate,
        footerTemplate: options.footerTemplate,
        margin: {
          top: `${String(geometry.marginTopMm)}mm`,
          right: `${String(geometry.marginRightMm)}mm`,
          bottom: `${String(geometry.marginBottomMm)}mm`,
          left: `${String(geometry.marginLeftMm)}mm`,
        },
      });

      await context.close();

      if (blocked.length > 0) {
        // Kein Fehler — der Beleg ist gültig, die Referenz wurde nur nicht
        // geladen. Für die Nachvollziehbarkeit gehört es ins Log.
        console.warn(
          `[renderer] ${String(blocked.length)} ausgehende Anfrage(n) blockiert: ` +
            blocked.slice(0, 5).join(', '),
        );
      }

      return { ok: true, pdf: new Uint8Array(pdf) };
    } catch (error) {
      if (page !== undefined) {
        await page.close().catch(() => undefined);
      }

      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      if (/timeout/i.test(message)) {
        return { ok: false, error: { kind: 'TIMEOUT', timeoutMs: options.timeoutMs } };
      }

      console.error('[renderer] PDF-Erzeugung fehlgeschlagen:', error);
      return { ok: false, error: { kind: 'RENDER_FAILED', message } };
    }
  },
};

/**
 * Gibt zurück, welche Adressen beim letzten Lauf blockiert wurden.
 *
 * Ausschließlich für den Nachweis zu NFA-SEC-12: Der Test lädt eine Vorlage mit
 * externer Bildreferenz und prüft, dass sie nicht abgerufen wurde.
 */
export async function renderAndReportBlocked(
  html: string,
  options: PdfRenderOptions,
): Promise<{ result: PdfRenderResult; blocked: readonly string[] }> {
  const blocked: string[] = [];
  let page: Page | undefined;

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    await blockNetwork(page, blocked);
    await page.setContent(html, { waitUntil: 'load', timeout: options.timeoutMs });

    const pdf = await page.pdf({ format: options.geometry.format });
    await context.close();

    return { result: { ok: true, pdf: new Uint8Array(pdf) }, blocked };
  } catch (error) {
    if (page !== undefined) {
      await page.close().catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return { result: { ok: false, error: { kind: 'RENDER_FAILED', message } }, blocked };
  }
}
