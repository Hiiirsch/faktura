/**
 * Unveränderbarkeit auf Persistenzebene (FA-NUM-09, NFA-COMP-02, Spec §6).
 *
 * Spec §6 verlangt die Durchsetzung auf **zwei** Ebenen: Guard im Use Case und
 * Prüfung in der Persistenzschicht. Diese Datei liefert die zweite Ebene für
 * das Protokoll; für Belege übernehmen sie Datenbank-Trigger (siehe die
 * Migration `invoice_immutability`).
 *
 * Warum Trigger und nicht ebenfalls eine Prisma-Erweiterung: Um zu entscheiden,
 * ob ein Beleg festgeschrieben ist, müsste die Erweiterung seinen Status lesen.
 * Innerhalb einer Transaktion liefe diese Zusatzabfrage über eine zweite
 * Verbindung — die SQLite nicht hergibt, weil dort genau eine Verbindung offen
 * ist. Das Ergebnis wäre ein Deadlock. Ein Trigger läuft in derselben
 * Transaktion, ohne zusätzliche Abfrage, und greift zudem auch dann, wenn
 * jemand ganz ohne Prisma schreibt.
 *
 * Für das Protokoll genügt die Erweiterung: Dort ist keine Abfrage nötig — es
 * gibt schlicht keinen erlaubten Fall.
 */
import type { PrismaClient } from '@prisma/client';

export class ImmutableRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImmutableRecordError';
  }
}

const AUDIT_CHANGE_MESSAGE =
  'Das Audit-Log ist unveränderlich: Einträge lassen sich nicht ändern (NFA-COMP-02).';
const AUDIT_DELETE_MESSAGE =
  'Das Audit-Log ist unveränderlich: Einträge lassen sich nicht löschen (NFA-COMP-02).';

/**
 * Hängt den Schutz des Protokolls an einen Prisma-Client.
 *
 * Die Erweiterung liefert einen neuen Client; ausschließlich dieser wird
 * exportiert. Der Aufruf schlägt bereits fehl, bevor er die Datenbank
 * erreicht — mit einer Meldung, die den Grund nennt, statt mit einem
 * Datenbankfehler.
 */
export function withImmutabilityGuards(client: PrismaClient): PrismaClient {
  const extended = client.$extends({
    name: 'audit-log-immutability',
    query: {
      auditLog: {
        update() {
          throw new ImmutableRecordError(AUDIT_CHANGE_MESSAGE);
        },
        updateMany() {
          throw new ImmutableRecordError(AUDIT_CHANGE_MESSAGE);
        },
        upsert() {
          throw new ImmutableRecordError(AUDIT_CHANGE_MESSAGE);
        },
        delete() {
          throw new ImmutableRecordError(AUDIT_DELETE_MESSAGE);
        },
        deleteMany() {
          throw new ImmutableRecordError(AUDIT_DELETE_MESSAGE);
        },
      },
    },
  });

  return extended as unknown as PrismaClient;
}
