/**
 * Domain-Ereignisse bei Zustandsänderungen (NFA-ARCH-08, Spec §3.3).
 *
 * Jede Zustandsänderung einer Rechnung erzeugt ein Ereignis. In V1 schreiben
 * die Handler nur ins Protokoll; später hängen dort E-Mail-Versand, Mahnläufe
 * und Buchhaltungsexport an, ohne dass die Kernlogik sich ändert.
 *
 * Die Ereignisse sind reine Datenstrukturen — das Verteilen an Handler liegt
 * in der Anwendungsschicht.
 */
import type { Cents } from '../money/money';
import type { PlainDate } from '../time/plain-date';

export type InvoiceIssued = {
  readonly type: 'InvoiceIssued';
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly issueDate: PlainDate;
  readonly grossTotalCents: Cents;
};

export type InvoicePaymentRecorded = {
  readonly type: 'InvoicePaymentRecorded';
  readonly invoiceId: string;
  readonly amountCents: Cents;
  readonly paidTotalCents: Cents;
  readonly grossTotalCents: Cents;
};

export type InvoicePaid = {
  readonly type: 'InvoicePaid';
  readonly invoiceId: string;
  readonly grossTotalCents: Cents;
};

export type InvoiceCancelled = {
  readonly type: 'InvoiceCancelled';
  readonly invoiceId: string;
  readonly creditNoteId: string;
  readonly creditNoteNumber: string;
};

export type InvoiceEvent =
  | InvoiceIssued
  | InvoicePaymentRecorded
  | InvoicePaid
  | InvoiceCancelled;

export type InvoiceEventType = InvoiceEvent['type'];

/**
 * Ein Handler nimmt ein Ereignis entgegen; Fehler dürfen den Vorgang nicht
 * kippen.
 *
 * Der zweite Parameter trägt den Ausführungskontext — in dieser Anwendung den
 * Mandanten. Sein Typ bleibt offen: Die Domain kennt weder Organisationen noch
 * Persistenz, muss den Wert aber durchreichen, damit ein Handler weiß, wessen
 * Beleg er gerade sieht.
 */
export type InvoiceEventHandler<TContext = unknown> = (
  event: InvoiceEvent,
  context: TContext,
) => Promise<void> | void;

export const INVOICE_EVENT_TYPES: readonly InvoiceEventType[] = [
  'InvoiceIssued',
  'InvoicePaymentRecorded',
  'InvoicePaid',
  'InvoiceCancelled',
];
