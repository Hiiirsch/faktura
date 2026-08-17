import { NextResponse } from 'next/server';

import { requireAdminSessionOrThrow } from '@/application/admin/require-admin-session';
import { createBackup } from '@/application/backup/create-backup';

export const dynamic = 'force-dynamic';

/**
 * Sicherung herunterladen — ausschließlich für den Betreiber (NFA-BETR-05,
 * NFA-SEC-23).
 *
 * **Der Umzug ist der Punkt dieses Blocks.** Bis M7 lag diese Route unter
 * `/api/backup` und war jedem angemeldeten Konto zugänglich; sie liefert die
 * **gesamte** Datenbankdatei, also alle Mandanten. Bei einem Unternehmen war
 * das eine Betreiberfunktion am falschen Ort, ab dem zweiten ein Datenleck.
 *
 * Zwei Sicherungen greifen jetzt hintereinander: Der Proxy verlangt für
 * `/admin/**` das Admincookie, und `requireAdminSessionOrThrow()` prüft es als
 * erste Anweisung (Spec §11.2). Die dritte liegt im Typ —
 * `createBackup(platform)` nimmt einen `PlatformContext`, den eine
 * Mandantensitzung nicht herstellen kann.
 *
 * Als `GET` und nicht als Server Action: Was zurückkommt, ist eine Datei, und
 * der Browser soll sie mit seinen eigenen Mitteln entgegennehmen.
 */
export async function GET(): Promise<NextResponse> {
  const session = await requireAdminSessionOrThrow();
  const backup = await createBackup(session.platform);

  return new NextResponse(Buffer.from(backup.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${backup.fileName}"`,
      'Content-Length': String(backup.bytes.length),
      // Eine Sicherung ist ein Zeitpunkt, kein Dokument: Sie darf in keinem
      // Zwischenspeicher liegen bleiben.
      'Cache-Control': 'no-store',
    },
  });
}
