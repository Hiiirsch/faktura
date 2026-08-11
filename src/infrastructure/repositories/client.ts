/**
 * Der Datenbankzugang der Repository-Schicht.
 *
 * `getPrismaClient()` darf ausschließlich aus `src/infrastructure/repositories/**`
 * importiert werden — durchgesetzt durch die Lint-Regel in `eslint.config.mjs`
 * und belegt durch `tests/architecture/layering.test.ts`. Damit gibt es genau
 * einen Weg zu den Daten, und der führt über eine Funktion mit
 * Organisationskontext.
 *
 * Transaktionen werden über `runInTransaction` geöffnet. Der Rückruf erhält
 * **keinen** Prisma-Client, sondern einen undurchsichtigen Griff: Andernfalls
 * ließe sich innerhalb einer Transaktion an der Repository-Schicht vorbei und
 * damit ohne Mandantenfilter abfragen.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

import { getPrismaClient } from '@/infrastructure/db/prisma';

declare const transactionBrand: unique symbol;

/** Verweis auf eine laufende Transaktion. Nur Repository-Funktionen lesen ihn. */
export type TransactionHandle = { readonly [transactionBrand]: true };

/** Client oder Transaktionsausschnitt — beides trägt dieselben Delegates. */
export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

/** Löst den Griff auf. Nur innerhalb dieser Schicht aufrufbar. */
export function clientFor(handle: TransactionHandle | undefined): DatabaseClient {
  if (handle === undefined) {
    return getPrismaClient();
  }
  return handle as unknown as Prisma.TransactionClient;
}

/**
 * Öffnet eine Transaktion.
 *
 * Die großzügigen Zeitfenster stammen aus FA-NUM-04: SQLite lässt genau einen
 * Schreiber zu, zwei gleichzeitige Festschreibungen laufen deshalb
 * nacheinander ab. Ohne Wartezeit brächen sie mit einem Timeout ab, statt zu
 * warten.
 */
export async function runInTransaction<T>(
  run: (handle: TransactionHandle) => Promise<T>,
  options: { readonly maxWait: number; readonly timeout: number } = {
    maxWait: 30_000,
    timeout: 15_000,
  },
): Promise<T> {
  return getPrismaClient().$transaction(
    async (tx) => run(tx as unknown as TransactionHandle),
    options,
  );
}

/**
 * Der einzige Zugriff ohne Organisationskontext, der kein Datum liest:
 * die Lebendprüfung des Healthchecks (NFA-BETR-08).
 */
export async function pingDatabase(): Promise<void> {
  await getPrismaClient().organization.count();
}

/** Geordnetes Schließen für Kommandozeilenwerkzeuge. */
export async function disconnectDatabase(): Promise<void> {
  await getPrismaClient().$disconnect();
}
