/**
 * Lesezugriffe auf Mahnungen (M15, FA-MAHN-01).
 *
 * Die Routenschicht greift nicht unmittelbar auf die Persistenz zu
 * (NFA-ARCH-01) — der Lint-Wächter hat den ersten Versuch sofort gemeldet.
 * Hier steht deshalb, was die Belegseite braucht, in der Form, in der sie es
 * braucht.
 */
import type { Authorized } from '@/application/auth/authorize';
import { isReminderLevel, type ReminderLevel } from '@/domain/reminder/dunning';
import { listRemindersForInvoice } from '@/infrastructure/repositories/reminder-repository';

export type ReminderSummary = {
  readonly id: string;
  readonly number: string;
  readonly level: ReminderLevel;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly outstandingCents: number;
  readonly feeCents: number;
  readonly totalCents: number;
};

/**
 * Die Mahnungen eines Belegs.
 *
 * Eine Zeile mit unbekannter Stufe fällt heraus, statt die Seite mit einer
 * Beschriftung zu füllen, die nichts bezeichnet. Sie kann nur durch einen
 * Eingriff an der Datenbank entstehen — die CHECK-Bedingung lässt 1 bis 3 zu.
 */
export async function getRemindersForInvoice(
  context: Authorized<'invoice.read'>,
  invoiceId: string,
): Promise<readonly ReminderSummary[]> {
  const rows = await listRemindersForInvoice(context, invoiceId);

  return rows.flatMap((row) =>
    isReminderLevel(row.level)
      ? [
          {
            id: row.id,
            number: row.number,
            level: row.level,
            issueDate: row.issueDate,
            dueDate: row.dueDate,
            outstandingCents: row.outstandingCents,
            feeCents: row.feeCents,
            totalCents: row.totalCents,
          },
        ]
      : [],
  );
}

/** Die höchste bisher ausgestellte Stufe — `null`, wenn noch nicht gemahnt wurde. */
export function highestLevelOf(reminders: readonly ReminderSummary[]): ReminderLevel | null {
  return reminders.reduce<ReminderLevel | null>(
    (höchste, entry) => (höchste === null || entry.level > höchste ? entry.level : höchste),
    null,
  );
}
