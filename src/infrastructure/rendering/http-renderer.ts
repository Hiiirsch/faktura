/**
 * Der Renderer als eigener Dienst (M17, B3 — NFA-BETR-15).
 *
 * **Warum es ihn gibt.** Chromium spannt seine Sandbox über Namensräume auf und
 * braucht dafür `SYS_ADMIN`. In einer Umgebung mit strengem Sicherheitsprofil
 * lässt sich diese Fähigkeit nicht hinzufügen — dort müsste die Anwendung
 * entweder mit `--no-sandbox` rendern (Spec §11.3 verbietet es) oder gar nicht.
 *
 * Der Ausweg ist eine Trennung: **ein** Dienst mit den vier Fähigkeiten, die
 * Chromium braucht, und beliebig viele Anwendungsinstanzen ohne jede
 * Sonderrechte. Das ist zugleich die sparsamere Aufteilung — ein Browser je
 * Instanz kostet Speicher, den nur wenige Belege je Minute rechtfertigen.
 *
 * **Derselbe Vertrag, andere Verbindung.** `PdfRenderer.render(html, options)`
 * bleibt unverändert; hier reist der Aufruf über HTTP statt über einen
 * Funktionsaufruf. Die Rendertests laufen deshalb gegen **beide** Adapter — ein
 * Dienst, der „so ähnlich" antwortet, wäre genau der, an dem ein Beleg anders
 * aussieht als in der Vorschau.
 *
 * **Ein gemeinsames Geheimnis, kein offener Endpunkt.** Der Dienst nimmt HTML
 * entgegen und setzt es; ohne Nachweis wäre er ein Werkzeug, mit dem sich aus
 * dem internen Netz beliebige Dokumente erzeugen lassen. Er gehört ohnehin nie
 * ins offene Netz, aber die Zusage soll nicht allein an der Netzwerktopologie
 * hängen.
 */
import type { PdfRenderOptions, PdfRenderResult, PdfRenderer } from '@/domain/rendering/contracts';
import { getEnv } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';

/** Ob ein Renderdienst eingerichtet ist — sonst wird im Prozess gesetzt. */
export function isRemoteRendererConfigured(): boolean {
  return getEnv().RENDERER_URL !== undefined;
}

function endpoint(pathname: string): string {
  const base = getEnv().RENDERER_URL;
  if (base === undefined) {
    throw new Error('Es ist kein Renderdienst eingerichtet.');
  }
  return `${base.replace(/\/$/u, '')}${pathname}`;
}

function authorizationHeaders(): Record<string, string> {
  const token = getEnv().RENDERER_TOKEN;
  return token === undefined ? {} : { authorization: `Bearer ${token}` };
}

export const httpPdfRenderer: PdfRenderer = {
  async render(html: string, options: PdfRenderOptions): Promise<PdfRenderResult> {
    /*
     * Die Zeitgrenze gilt **zweimal**: Der Dienst bricht das Setzen nach
     * `timeoutMs` ab, und der Aufrufer wartet nicht länger als das plus einen
     * Zuschlag für Verbindung und Übertragung. Ohne den zweiten hinge eine
     * Server Action an einem Dienst, der gar nicht mehr antwortet.
     */
    const signal = AbortSignal.timeout(options.timeoutMs + 10_000);

    try {
      const response = await fetch(endpoint('/render'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({ html, options }),
        signal,
      });

      if (response.status === 504) {
        return { ok: false, error: { kind: 'TIMEOUT', timeoutMs: options.timeoutMs } };
      }

      if (!response.ok) {
        const message = await response.text();
        return {
          ok: false,
          error: { kind: 'RENDER_FAILED', message: `Renderdienst antwortete mit ${String(response.status)}: ${message}` },
        };
      }

      return { ok: true, pdf: new Uint8Array(await response.arrayBuffer()) };
    } catch (error) {
      /*
       * Ein nicht erreichbarer Dienst ist ein Fehlschlag des Setzens, keine
       * Ausnahme des Aufrufers: Das Festschreiben gilt trotzdem, und das PDF
       * entsteht beim nächsten Abruf (FA-PDF-13).
       */
      logger.error('renderer.request_failed', { error });

      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return timedOut
        ? { ok: false, error: { kind: 'TIMEOUT', timeoutMs: options.timeoutMs } }
        : { ok: false, error: { kind: 'RENDER_FAILED', message: 'Der Renderdienst ist nicht erreichbar.' } };
    }
  },
};

/** Fragt den Dienst nach seinem Zustand — für den Healthcheck (NFA-BETR-08). */
export async function isRemoteRendererAvailable(): Promise<boolean> {
  try {
    const response = await fetch(endpoint('/health'), {
      headers: authorizationHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch (error) {
    logger.error('health.renderer_down', { error });
    return false;
  }
}
