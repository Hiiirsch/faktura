import { NextResponse } from 'next/server';

import { authorizeRequest } from '@/application/auth/authorize';
import { getOptionalSession } from '@/application/auth/require-session';
import { storeReminderPdf } from '@/application/reminders/render-reminder';
import { logger } from '@/infrastructure/logging/logger';

export const dynamic = 'force-dynamic';

/**
 * Download einer Mahnung als PDF (M15, FA-MAHN-06).
 *
 * Sie entsteht **einmal** und liegt danach als Artefakt mit SHA-256 vor —
 * dieselbe Zusage wie beim festgeschriebenen Beleg: Jeder weitere Abruf liefert
 * dieselbe Datei. Einen Entwurfsfall gibt es hier nicht; eine Mahnung entsteht
 * fertig.
 *
 * Gelesen wird mit `invoice.read` und nicht mit `invoice.remind`: Wer Belege
 * sehen darf, darf auch sehen, was gemahnt wurde. Das Ausstellen ist die
 * geschützte Handlung, nicht das Nachlesen.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (session === null) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const authorized = authorizeRequest(session, 'invoice.read');
  if (authorized === null) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const result = await storeReminderPdf(authorized, id);

  if (!result.ok) {
    if (result.error.kind === 'NOT_FOUND') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    logger.error('reminder.render_failed', { reason: result.error });
    return NextResponse.json({ error: result.error.kind }, { status: 500 });
  }

  const disposition =
    new URL(request.url).searchParams.get('inline') === '1' ? 'inline;' : 'attachment;';

  return new NextResponse(new Uint8Array(result.value.pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition} filename="${result.value.fileName}"`,
      'Content-Length': String(result.value.pdf.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
