import { NextResponse } from 'next/server';

import { getAsset, readAssetContent } from '@/application/assets/asset-service';
import { getOptionalSession } from '@/application/auth/require-session';

export const dynamic = 'force-dynamic';

/**
 * Ausliefern hochgeladener Dateien (NFA-SEC-16, Spec §11.2).
 *
 * Nur mit gültiger Sitzung. Die Dateien liegen außerhalb des öffentlich
 * ausgelieferten Verzeichnisses; dies ist der einzige Weg zu ihnen.
 *
 * Die Antwort trägt eine eigene, maximal enge Content Security Policy. Eine
 * hochgeladene SVG-Datei ist Markup und könnte grundsätzlich Skript enthalten
 * — unter dieser Richtlinie und mit `sandbox` wird nichts davon ausgeführt,
 * auch wenn die Datei direkt aufgerufen wird.
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
  const asset = await getAsset(id);
  if (asset === null) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let content: Buffer;
  try {
    content = await readAssetContent(asset);
  } catch (error) {
    console.error('[assets] Datei nicht lesbar:', error);
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(content), {
    status: 200,
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.byteSize),
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      // Der Anzeigename wird nur hier verwendet, nie als Pfad.
      'Content-Disposition': `inline; filename="${encodeURIComponent(asset.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
