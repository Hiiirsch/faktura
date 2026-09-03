/**
 * Das Dokumentmodell der Mahnung (M15, FA-MAHN-06).
 *
 * **Absender und Empfänger sind dieselben Typen wie beim Beleg**
 * (`DocumentSeller`, `DocumentBuyer`) — nicht aus Bequemlichkeit, sondern weil
 * es dieselben Angaben sind: Wer die Anschrift des Empfängers auf dem Beleg
 * richtig setzt, setzt sie hier richtig, und eine zweite Fassung liefe beim
 * ersten Sonderfall (freier Anschriftenblock, Land ≠ DE) auseinander.
 *
 * **Was fehlt, ist die Aussage:** keine Positionen, keine Steueraufstellung,
 * kein Netto und kein Brutto. Eine Mahnung weist keine Umsatzsteuer aus — sie
 * fordert eine bestehende Forderung ein und begründet keine neue. Ein
 * Steuerausweis darauf wäre nach §14c geschuldet, obwohl er nichts bezeichnet.
 */
import type { CurrencyCode } from '../codes/currency-code';
import type { DocumentBuyer, DocumentSeller } from '../document/invoice-document';
import type { Cents } from '../money/money';
import type { PlainDate } from '../time/plain-date';

import type { ReminderLevel } from './dunning';

/** Die gemahnte Rechnung, so weit sie auf dem Blatt erscheint. */
export type RemindedInvoice = {
  readonly number: string;
  readonly issueDate: PlainDate;
  readonly dueDate: PlainDate;
  readonly grossTotalCents: Cents;
};

export type ReminderDocument = {
  readonly number: string;
  readonly level: ReminderLevel;
  /** „Zahlungserinnerung", „Mahnung", „Letzte Mahnung". */
  readonly levelLabel: string;
  readonly issueDate: PlainDate;
  /** Die **neue** Frist; die der Rechnung ist verstrichen. */
  readonly dueDate: PlainDate;
  readonly currency: CurrencyCode;

  readonly seller: DocumentSeller;
  readonly buyer: DocumentBuyer;
  readonly invoice: RemindedInvoice;

  readonly outstandingCents: Cents;
  readonly feeCents: Cents;
  readonly totalCents: Cents;

  readonly introText: string;
  readonly outroText: string;
  readonly overdueText: string;

  readonly footerText: string | null;
};
