/**
 * Konsistente Sicherung der SQLite-Datei (NFA-BETR-04).
 *
 * **Die dokumentierte Ausnahme von NFA-ARCH-10.** Die Regel lautet: kein
 * Roh-SQL im Anwendungscode. `VACUUM INTO` ist die einzige Stelle, an der sie
 * gebrochen wird, und sie wird es aus einem Grund, der sich nicht umgehen
 * lässt — Prisma kennt keine Entsprechung. Die Alternative wäre, die Datei im
 * laufenden Betrieb zu kopieren, und genau das verbietet NFA-BETR-04: Eine
 * Kopie mitten in einer Transaktion ergibt eine Datei, die aussieht wie eine
 * Datenbank und beim Öffnen scheitert. `VACUUM INTO` schreibt einen in sich
 * geschlossenen Stand, während nebenher weitergearbeitet wird.
 *
 * Bis M7 lief das ausschließlich im Betriebsskript, also außerhalb des
 * Anwendungscodes. Mit der Sicherung aus der Oberfläche (NFA-BETR-05) geht das
 * nicht mehr — der Dienst muss sie selbst erzeugen können. Zwei Zusagen halten
 * die Ausnahme klein:
 *
 * - Sie liegt in der **Infrastrukturschicht**, nicht in der Anwendungsschicht,
 *   und ist die einzige Datei mit `$executeRawUnsafe`. Ein Architekturtest
 *   hält das fest.
 * - Der Pfad stammt **nie** aus einer Anfrage. Er entsteht hier aus einem
 *   Zufallsnamen in einem Verzeichnis, das die Anwendung bestimmt; einziger
 *   Parameter ist das Zielverzeichnis aus der Konfiguration. Ohne diese
 *   Einschränkung wäre `VACUUM INTO` eine Einladung, beliebige Dateien zu
 *   überschreiben.
 */
import { randomBytes } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { getPrismaClient } from '@/infrastructure/db/prisma';

/**
 * Schreibt einen konsistenten Abzug in `directory` und gibt seinen Inhalt
 * zurück. Die Zwischendatei wird danach entfernt.
 *
 * `VACUUM INTO` verlangt, dass die Zieldatei **nicht** existiert — deshalb ein
 * Zufallsname statt eines festen. Zwei gleichzeitige Sicherungen kämen sich
 * sonst ins Gehege, und die zweite scheiterte mit einer Meldung, die niemand
 * mit dem Grund in Verbindung bringt.
 */
export async function createDatabaseSnapshot(directory: string): Promise<Uint8Array> {
  const target = path.join(directory, `snapshot-${randomBytes(8).toString('hex')}.db`);

  // Einfache Anführungszeichen im Pfad würden das Literal beenden. Der Pfad
  // kommt zwar aus der Konfiguration und nicht aus einer Anfrage, aber eine
  // Zusage, die auf „kommt schon nicht vor" beruht, ist keine.
  if (target.includes("'")) {
    throw new Error('Das Sicherungsverzeichnis darf kein Apostroph enthalten.');
  }

  await getPrismaClient().$executeRawUnsafe(`VACUUM INTO '${target}'`);

  try {
    return new Uint8Array(await readFile(target));
  } finally {
    await rm(target, { force: true });
  }
}
