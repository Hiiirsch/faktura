import { NextResponse } from 'next/server';

import { getAsset, readAssetContent } from '@/application/assets/asset-service';
import { authorizeRequest } from '@/application/auth/authorize';
import { getOptionalSession } from '@/application/auth/require-session';
import { getCompanyProfile } from '@/application/company/company-profile';
import { logger } from '@/infrastructure/logging/logger';

export const dynamic = 'force-dynamic';

/**
 * Das hinterlegte Briefpapier ansehen (M12, FA-TPL-11).
 *
 * **Ohne Kennung im Pfad.** Es gibt je Unternehmen genau eines, und welches es
 * ist, steht in den Firmendaten — eine Kennung im Pfad wäre ein zweiter Weg zu
 * derselben Datei und eine Gelegenheit, den falschen zu erwischen.
 *
 * Das Sicherheitsprofil `pdf` steht in `src/routes.ts`: ohne `sandbox`, sonst
 * startet der eingebaute Betrachter nicht, und mit `frame-ancestors 'self'`,
 * sonst greift `X-Frame-Options: DENY` und die Vorschau bliebe leer.
 */
export async function GET(): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (session === null) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  /*
   * `companyProfile.update` und nicht nur `read`: Die Vorschau steht auf der
   * Bearbeitungsseite, und die hängt seit M8 an beiden Rechten. Das Briefpapier
   * ist ohnehin auf jedem Beleg zu sehen — geschützt wird hier nicht das
   * Aussehen, sondern die Verwaltungsseite, zu der die Vorschau gehört.
   */
  const authorized = authorizeRequest(session, 'companyProfile.read', 'companyProfile.update');
  if (authorized === null) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const profile = await getCompanyProfile(authorized);
  if (profile?.letterheadAssetId == null) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const asset = await getAsset(authorized, profile.letterheadAssetId);
  if (asset === null) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let content: Buffer;
  try {
    content = await readAssetContent(asset);
  } catch (error) {
    logger.error('asset.read_failed', { error, assetId: asset.id });
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(content), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(asset.byteSize),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${encodeURIComponent(asset.fileName)}"`,
      /*
       * **Nicht zwischenspeichern.**
       *
       * Diese Adresse ist fest, ihr Inhalt nicht: Wer sein Briefpapier
       * austauscht, bekommt unter demselben Pfad eine andere Datei. Mit
       * `max-age=60` zeigte der Browser danach bis zu eine Minute lang den
       * alten Bogen — für den Benutzer sah es aus, als hätte das Löschen nicht
       * gewirkt.
       *
       * Beim Logo tritt das nicht auf, weil seine Kennung im Pfad steht
       * (`assetPath(id)`): Ein neues Bild ist eine neue Adresse. Hier ist der
       * Pfad absichtlich ohne Kennung — es gibt je Unternehmen genau ein
       * Briefpapier —, und dann muss die Zwischenspeicherung weg. Für **eine**
       * kleine Datei auf einer Verwaltungsseite ist das kein Verlust.
       */
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    },
  });
}
