/**
 * Vergabe der Belegnummern (FA-NUM-02, -03, -04, -07, Spec §6).
 *
 * Die Nummer entsteht ausschließlich beim Festschreiben und ausschließlich
 * innerhalb der Transaktion, die auch den Statuswechsel schreibt. Zwei
 * nebenläufige Festschreibungen können dadurch nie dieselbe Nummer erhalten:
 * Das `increment` läuft atomar in der Datenbank, ohne den Zählerstand vorher
 * zu lesen und zurückzuschreiben.
 *
 * Der Zählerbereich ist seit M5.5a je Organisation eindeutig — sonst zählte
 * eine zweite Organisation im Kreis der ersten weiter, und beide bekämen
 * Lücken.
 */
import {
  formatInvoiceNumber,
  INVOICE_SEQUENCE_PREFIX,
  sequenceScopeFor,
} from '@/domain/invoice/number-format';
import type { PlainDate } from '@/domain/time/plain-date';
import type { TransactionHandle } from '@/infrastructure/repositories/client';
import {
  findSequence,
  incrementSequence,
  listSequencesWithPrefix,
  setSequenceValue,
} from '@/infrastructure/repositories/number-sequence-repository';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';

export type SequenceState = {
  readonly scope: string;
  readonly lastValue: number;
};

/**
 * Erhöht den Zähler des Bereichs und gibt die formatierte Nummer zurück.
 * Muss innerhalb einer Transaktion aufgerufen werden (FA-NUM-03).
 */
export async function allocateInvoiceNumber(
  context: OrganizationContext,
  handle: TransactionHandle,
  format: string,
  issueDate: PlainDate,
): Promise<string> {
  const scope = sequenceScopeFor(format, issueDate);
  const lastValue = await incrementSequence(context, scope, handle);

  return formatInvoiceNumber(format, issueDate, lastValue);
}

/** Zählerstände aller Belegbereiche (FA-NUM-06). */
export async function listInvoiceSequences(
  context: OrganizationContext,
): Promise<readonly SequenceState[]> {
  const sequences = await listSequencesWithPrefix(context, INVOICE_SEQUENCE_PREFIX);

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
  context: OrganizationContext,
  scope: string,
  startValue: number,
): Promise<{ ok: true } | { ok: false; error: StartValueError }> {
  if (!Number.isSafeInteger(startValue) || startValue < 0) {
    return { ok: false, error: { kind: 'INVALID_VALUE' } };
  }

  const existing = await findSequence(context, scope);

  if (existing !== null && existing.lastValue > 0) {
    return { ok: false, error: { kind: 'ALREADY_IN_USE', lastValue: existing.lastValue } };
  }

  await setSequenceValue(context, scope, startValue);

  return { ok: true };
}
