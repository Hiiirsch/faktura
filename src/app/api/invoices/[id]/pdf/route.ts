import { NextResponse } from 'next/server';

import { getOptionalSession } from '@/application/auth/require-session';
import { renderInvoiceForDownload } from '@/application/documents/render-invoice';

export const dynamic = 'force-dynamic';

/**
 * Download des Belegs als PDF (FA-PDF-01, FA-PDF-03).
 *
 * Ein **festgeschriebener** Beleg wird einmal gesetzt und abgelegt; jeder
 * weitere Abruf liefert dieselbe Datei mit demselben Hash (FA-NUM-10,
 * FA-TPL-09). Ein **Entwurf** wird bei jedem Abruf neu gesetzt und nicht
 * abgelegt — er hat keine Nummer, ist jederzeit änderbar, und ein archiviertes
 * PDF davon wäre irreführend. Die Vorlage kennzeichnet ihn sichtbar.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (session === null) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await renderInvoiceForDownload(session.organization, id);

  // `?inline=1` bettet dieselbe Datei ein, statt sie herunterzuladen
  // (FA-PDF-02). Der Download bleibt die Voreinstellung: Wer die Adresse
  // aufruft, will den Beleg haben, nicht ansehen.
  const disposition = new URL(request.url).searchParams.get('inline') === '1'
    ? 'inline;'
    : 'attachment;';

  if (!result.ok) {
    if (result.error.kind === 'NOT_FOUND') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    // Die Ursache gehört ins Serverlog, nicht in die Antwort (NFA-SEC-18).
    console.error('[pdf] Erzeugung fehlgeschlagen:', result.error);
    return NextResponse.json({ error: result.error.kind }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(result.value.pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // Der Dateiname stammt aus dem konfigurierten Muster und ist bereits
      // gefiltert (FA-PDF-09); die Anführungszeichen kann er nicht verlassen.
      'Content-Disposition': `${disposition} filename="${result.value.fileName}"`,
      'Content-Length': String(result.value.pdf.length),
      // Ein Entwurf ändert sich mit jeder Bearbeitung.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
