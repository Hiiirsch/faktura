import { NextResponse } from 'next/server';

import { getOptionalSession } from '@/application/auth/require-session';
import { renderInvoiceHtml } from '@/application/documents/render-invoice';
import { messages } from '@/i18n/de';

export const dynamic = 'force-dynamic';

/**
 * HTML-Vorschau des Belegs (FA-PDF-02, -03; FA-TPL-04).
 *
 * Dasselbe Dokument, dieselbe Vorlage, dieselbe eingebettete Schrift wie beim
 * PDF — nur ohne den Umweg über Chromium. Die Vorschau zeigt damit nicht etwas
 * Ähnliches, sondern denselben Satz.
 *
 * Ausgeliefert in einen `<iframe sandbox>`. Die Antwort trägt zusätzlich eine
 * eigene, maximal enge Content Security Policy: Eine Vorlage ist fremder
 * Inhalt, und in der Vorschau läuft sie — anders als beim Rendern — im Browser
 * des Benutzers.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (session === null) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await renderInvoiceHtml(session.organization, id);

  if (!result.ok) {
    if (result.error.kind === 'NOT_FOUND') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Ein Vorlagenfehler ist kein Serverfehler, sondern eine Auskunft an den,
    // der die Vorlage gerade bearbeitet: Ursache und Ort statt Absturz
    // (FA-TPL-07, FA-UI-10).
    if (result.error.kind === 'TEMPLATE_FAILED') {
      return new NextResponse(errorPage(result.error.error.message, result.error.error.line), {
        status: 200,
        headers: previewHeaders(),
      });
    }

    console.error('[preview] Vorschau fehlgeschlagen:', result.error);
    return new NextResponse(errorPage(messages.templates.previewFailed, null), {
      status: 200,
      headers: previewHeaders(),
    });
  }

  return new NextResponse(result.value, { status: 200, headers: previewHeaders() });
}

function previewHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': [
      "default-src 'none'",
      // Die Vorlage bringt ihr CSS inline mit; Schrift und Logo kommen als
      // data:-URI. Skripte sind auch hier ausgeschlossen (NFA-SEC-13).
      "style-src 'unsafe-inline'",
      "img-src data:",
      "font-src data:",
      "form-action 'none'",
      "frame-ancestors 'self'",
    ].join('; '),
  };
}

/** Fehlerdarstellung im Vorschaurahmen, ohne Entschuldigungsformel. */
function errorPage(message: string, line: number | null): string {
  const escaped = message.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character,
  );
  const position = line === null ? '' : `<p>Zeile ${String(line)}</p>`;

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><style>
body { margin: 0; padding: 24px; font-family: sans-serif; font-size: 14px; color: #1c1f1c; background: #f7efdd; }
h1 { margin: 0 0 8px; font-size: 15px; }
pre { margin: 0; white-space: pre-wrap; font-family: ui-monospace, monospace; }
</style></head>
<body><h1>${messages.templates.previewErrorHeading}</h1><pre>${escaped}</pre>${position}</body></html>`;
}
