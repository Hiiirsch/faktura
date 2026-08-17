import { NextResponse } from 'next/server';

import { authorizeRequest } from '@/application/auth/authorize';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import { exportOrganizationData } from '@/application/export/export-data';

export const dynamic = 'force-dynamic';

/**
 * Datenexport herunterladen (NFA-COMP-03).
 *
 * Wie die Sicherung ein `GET` und keine Server Action: Was zurückkommt, ist
 * eine Datei. Anders als die Sicherung läuft er **mit** Mandantenkontext —
 * exportiert wird, was diesem Mandanten gehört, nicht die Datenbankdatei.
 *
 * Die Sitzungsprüfung steht als erste Anweisung (Spec §11.2).
 */
export async function GET(): Promise<NextResponse> {
  const session = await requireSessionOrThrow();

  // Der Export gibt **alle** Daten des Mandanten heraus und ist deshalb ein
  // eigenes Recht, kein Nebenprodukt des Lesens (NFA-COMP-03).
  const authorized = authorizeRequest(session, 'export.run');
  if (authorized === null) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const data = await exportOrganizationData(authorized, session.userId);

  return new NextResponse(data.json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${data.fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
