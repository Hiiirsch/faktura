import { NextResponse } from 'next/server';

import { checkSystemStatus } from '@/application/system/check-system-status';

export const dynamic = 'force-dynamic';

/**
 * Healthcheck für Container und Reverse Proxy (Spec §12).
 *
 * Bewusst ohne Anmeldung erreichbar — Docker und Caddy können sich nicht
 * authentifizieren. Die Antwort enthält deshalb ausschließlich die Aussage
 * betriebsbereit ja/nein, keine Versionsnummern, Pfade oder Fehlertexte
 * (NFA-SEC-18). Der Eintrag in src/routes.ts hält diese Ausnahme fest.
 */
export async function GET(): Promise<NextResponse> {
  const status = await checkSystemStatus();

  return NextResponse.json(
    { status: status.healthy ? 'ok' : 'error' },
    {
      status: status.healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
