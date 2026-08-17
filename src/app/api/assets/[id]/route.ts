import { NextResponse } from 'next/server';

import { getAsset, readAssetContent } from '@/application/assets/asset-service';
import { authorizeRequest } from '@/application/auth/authorize';
import { getOptionalSession } from '@/application/auth/require-session';
import { logger } from '@/infrastructure/logging/logger';

export const dynamic = 'force-dynamic';

/**
 * Ausliefern hochgeladener Dateien (NFA-SEC-16, Spec §11.2).
 *
 * Nur mit gültiger Sitzung. Die Dateien liegen außerhalb des öffentlich
 * ausgelieferten Verzeichnisses; dies ist der einzige Weg zu ihnen.
 *
 * Die Antwort trägt eine maximal enge Content Security Policy mit `sandbox`:
 * Eine hochgeladene SVG-Datei ist Markup und könnte grundsätzlich Skript
 * enthalten; darunter wird nichts davon ausgeführt, auch beim direkten Aufruf.
 *
 * Gesetzt wird sie **nicht hier**, sondern vom Proxy anhand des Eintrags
 * `securityProfile: 'document'` in `src/routes.ts`. Der Proxy überschreibt die
 * Kopfzeilen der Antwort; eine hier gesetzte Richtlinie käme nie an.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (session === null) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Ein Bild dieser Organisation — dasselbe Recht wie das Lesen der Firmendaten,
  // zu denen es gehört. Das ist ein Grundrecht: Jedes Konto sieht das Logo im
  // Kopf der Anwendung.
  const authorized = authorizeRequest(session, 'companyProfile.read');
  if (authorized === null) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const asset = await getAsset(authorized, id);
  if (asset === null) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let content: Buffer;
  try {
    content = await readAssetContent(asset);
  } catch (error) {
    logger.error('asset.read_failed', { error });
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(content), {
    status: 200,
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.byteSize),
      'X-Content-Type-Options': 'nosniff',
      // Der Anzeigename wird nur hier verwendet, nie als Pfad.
      'Content-Disposition': `inline; filename="${encodeURIComponent(asset.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
