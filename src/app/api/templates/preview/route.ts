import { NextResponse } from 'next/server';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { getOptionalSession } from '@/application/auth/require-session';
import { renderWithSources } from '@/application/documents/render-invoice';
import { DEFAULT_PAGE_GEOMETRY, type PageGeometry } from '@/domain/rendering/contracts';
import { MAX_TEMPLATE_BYTES } from '@/domain/rendering/template-upload';
import { messages } from '@/i18n/de';

export const dynamic = 'force-dynamic';

/**
 * Vorschau einer noch nicht gespeicherten Vorlage (FA-TPL-04).
 *
 * Als `POST` mit Formularinhalt und `target` auf den Rahmen: Ein `<iframe>`
 * kann keine Anfrage mit Rumpf stellen, ein Formular schon — und zwar auch
 * ohne JavaScript. Mit JavaScript schickt der Editor dasselbe Formular nach
 * einer Eingabepause selbst ab.
 *
 * Schreibende Route im Sinne der Herkunftsprüfung: Sie nimmt Formulardaten
 * entgegen und setzt fremden Inhalt. `assertRequestIntegrity` prüft deshalb
 * Herkunft und CSRF-Token wie bei jeder Server Action.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (session === null) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const formData = await request.formData();

  try {
    await assertRequestIntegrity(formData);
  } catch {
    return NextResponse.json({ error: 'rejected' }, { status: 403 });
  }

  const invoiceId = readText(formData, 'invoiceId');
  const htmlSource = readText(formData, 'htmlSource');
  const cssSource = readText(formData, 'cssSource');

  if (invoiceId.length === 0) {
    return htmlResponse(errorPage(messages.templates.previewNoInvoice, null));
  }
  if (htmlSource.length + cssSource.length > MAX_TEMPLATE_BYTES) {
    return htmlResponse(errorPage(messages.templates.uploadTooLarge, null));
  }

  const result = await renderWithSources(
    session.organization,
    invoiceId,
    htmlSource,
    cssSource,
    readGeometry(formData),
  );

  if (!result.ok) {
    if (result.error.kind === 'TEMPLATE_FAILED') {
      return htmlResponse(errorPage(result.error.error.message, result.error.error.line));
    }
    if (result.error.kind === 'NOT_FOUND') {
      return htmlResponse(errorPage(messages.templates.previewNoInvoice, null));
    }

    console.error('[preview] Vorlagenvorschau fehlgeschlagen:', result.error);
    return htmlResponse(errorPage(messages.templates.previewFailed, null));
  }

  return htmlResponse(result.value);
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** Ränder aus dem Formular; unlesbare Werte fallen auf DIN 5008 zurück. */
function readGeometry(formData: FormData): PageGeometry {
  const millimetres = (key: string, fallback: number): number => {
    const parsed = Number.parseInt(readText(formData, key), 10);
    return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 50 ? parsed : fallback;
  };

  return {
    format: 'A4',
    marginTopMm: millimetres('marginTopMm', DEFAULT_PAGE_GEOMETRY.marginTopMm),
    marginRightMm: millimetres('marginRightMm', DEFAULT_PAGE_GEOMETRY.marginRightMm),
    marginBottomMm: millimetres('marginBottomMm', DEFAULT_PAGE_GEOMETRY.marginBottomMm),
    marginLeftMm: millimetres('marginLeftMm', DEFAULT_PAGE_GEOMETRY.marginLeftMm),
  };
}

function htmlResponse(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function errorPage(message: string, line: number | null): string {
  const escaped = message.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
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
