/**
 * Vergabe der Belegnummern (FA-NUM-02, -03, -04, -07, Spec §6).
 *
 * Die Nummer entsteht ausschließlich beim Festschreiben und ausschließlich
 * innerhalb der Transaktion, die auch den Statuswechsel schreibt. Zwei
 * nebenläufige Festschreibungen können dadurch nie dieselbe Nummer erhalten:
 * Das `increment` läuft atomar in der Datenbank, ohne den Zählerstand vorher
 * zu lesen und zurückzuschreiben.
 */
import type { Prisma } from '@prisma/client';

import {
  formatInvoiceNumber,
  INVOICE_SEQUENCE_PREFIX,
  sequenceScopeFor,
} from '@/domain/invoice/number-format';
import type { PlainDate } from '@/domain/time/plain-date';
import { getPrismaClient } from '@/infrastructure/db/prisma';

/** Der Ausschnitt des Prisma-Clients, der innerhalb einer Transaktion gilt. */
export type TransactionClient = Prisma.TransactionClient;

export type SequenceState = {
  readonly scope: string;
  readonly lastValue: number;
};

/**
 * Erhöht den Zähler des Bereichs und gibt die formatierte Nummer zurück.
 * Muss innerhalb einer Transaktion aufgerufen werden (FA-NUM-03).
 */
export async function allocateInvoiceNumber(
  tx: TransactionClient,
  format: string,
  issueDate: PlainDate,
): Promise<string> {
  const scope = sequenceScopeFor(format, issueDate);

  const sequence = await tx.numberSequence.upsert({
    where: { scope },
    create: { scope, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });

  return formatInvoiceNumber(format, issueDate, sequence.lastValue);
}

/** Zählerstände aller Belegbereiche (FA-NUM-06). */
export async function listInvoiceSequences(): Promise<readonly SequenceState[]> {
  const sequences = await getPrismaClient().numberSequence.findMany({
    where: { scope: { startsWith: INVOICE_SEQUENCE_PREFIX } },
    orderBy: { scope: 'asc' },
  });

  return sequences.map((sequence) => ({ scope: sequence.scope, lastValue: sequence.lastValue }));
}

export type StartValueError =
  | { readonly kind: 'ALREADY_IN_USE'; readonly lastValue: number }
  | { readonly kind: 'INVALID_VALUE' };

/**
 * Setzt einen Startwert, um eine Nummernfolge aus einem Altsystem lückenlos
 * fortzuführen (FA-NUM-07).
 *
 * Nur möglich, solange in diesem Bereich noch keine Nummer vergeben wurde —
 * ein nachträglich verstellter Zähler erzeugte entweder Lücken oder Dubletten,
 * und beides ließe sich nicht mehr heilen.
 */
export async function setSequenceStartValue(
  scope: string,
  startValue: number,
): Promise<{ ok: true } | { ok: false; error: StartValueError }> {
  if (!Number.isSafeInteger(startValue) || startValue < 0) {
    return { ok: false, error: { kind: 'INVALID_VALUE' } };
  }

  const prisma = getPrismaClient();
  const existing = await prisma.numberSequence.findUnique({ where: { scope } });

  if (existing !== null && existing.lastValue > 0) {
    return { ok: false, error: { kind: 'ALREADY_IN_USE', lastValue: existing.lastValue } };
  }

  await prisma.numberSequence.upsert({
    where: { scope },
    create: { scope, lastValue: startValue },
    update: { lastValue: startValue },
  });

  return { ok: true };
}
