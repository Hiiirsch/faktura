import { NextResponse } from 'next/server';

import { requireSessionOrThrow } from '@/application/auth/require-session';
import { createBackup } from '@/application/backup/create-backup';


export const dynamic = 'force-dynamic';

/**
 * Sicherung herunterladen (NFA-BETR-05).
 *
 * Als `GET` und nicht als Server Action: Was hier zurückkommt, ist eine Datei,
 * und der Browser soll sie mit seinen eigenen Mitteln entgegennehmen —
 * Fortschritt, Abbruch, Speicherort. Eine Aktion, die Megabyte durch die
 * React-Antwort schiebt, kann davon nichts.
 *
 * Die Sitzungsprüfung steht als erste Anweisung (Spec §11.2). Ohne sie wäre
 * das die eine Adresse, an der die gesamte Datenbank ohne Anmeldung liegt.
 *
 * Die Sicherheits-Kopfzeilen setzt der Proxy anhand von
 * `securityProfile: 'document'` in `src/routes.ts` — wie bei den übrigen
 * Dateien.
 */
export async function GET(): Promise<NextResponse> {
  const session = await requireSessionOrThrow();
  const backup = await createBackup(session.userId);

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
