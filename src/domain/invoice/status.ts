/**
 * Statusmodell (FA-STAT-01 bis -05, Spec §7).
 *
 * Der Status ist nichts, was gesetzt wird, sondern etwas, das sich aus
 * Zahlungslage und Stornovermerk **ergibt**. Überfälligkeit wird gar nicht
 * gespeichert, sondern aus Fälligkeitsdatum und heutigem Tag abgeleitet
 * (FA-STAT-02) — deshalb braucht es dafür keinen geplanten Auftrag.
 */
import type { DocumentType } from '../document/document-type';
import { type Cents, subtractCents, ZERO_CENTS } from '../money/money';
import { type PlainDate, isPlainDateBefore } from '../time/plain-date';

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(value);
}

export type PaymentState = {
  readonly isCancelled: boolean;
  readonly grossTotalCents: Cents;
  readonly paidTotalCents: Cents;
};

/**
 * Leitet den Status eines festgeschriebenen Belegs ab.
 *
 * Ein Bruttobetrag von null gilt als bezahlt: Es gibt nichts zu zahlen, und
 * ein dauerhaft „offener" Beleg über 0,00 € wäre in jeder Fälligkeitsliste ein
 * Störfaktor.
 */
export function deriveStatus(state: PaymentState): InvoiceStatus {
  if (state.isCancelled) {
    return 'CANCELLED';
  }
  if (state.paidTotalCents >= state.grossTotalCents) {
    return 'PAID';
  }
  if (state.paidTotalCents > 0) {
    return 'PARTIALLY_PAID';
  }
  return 'ISSUED';
}

/** Restbetrag; nie negativ, auch bei Überzahlung. */
export function outstandingAmount(grossTotalCents: Cents, paidTotalCents: Cents): Cents {
  if (paidTotalCents >= grossTotalCents) {
    return ZERO_CENTS;
  }
  return subtractCents(grossTotalCents, paidTotalCents);
}

/**
 * Erlaubte Statusübergänge.
 *
 * Die Zahlungswege gelten in beide Richtungen, weil erfasste Zahlungen
 * korrigierbar sind (FA-STAT-07): Wird eine Zahlung zurückgenommen, fällt der
 * Beleg von `PAID` auf `PARTIALLY_PAID` oder `ISSUED` zurück.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  DRAFT: ['ISSUED'],
  ISSUED: ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
  PARTIALLY_PAID: ['ISSUED', 'PAID', 'CANCELLED'],
  PAID: ['ISSUED', 'PARTIALLY_PAID', 'CANCELLED'],
  // Aus dem Storno führt kein Weg zurück — der Beleg bleibt unverändert
  // erhalten (FA-STAT-09).
  CANCELLED: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedTransitionsFrom(status: InvoiceStatus): readonly InvoiceStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

/** Belege, auf die noch Geld erwartet wird. */
export function isOpenReceivable(status: InvoiceStatus): boolean {
  return status === 'ISSUED' || status === 'PARTIALLY_PAID';
}

/**
 * Ob der Beleg eine Handlung noch zulässt (M12, FA-STAT-04, FA-STAT-05).
 *
 * **Warum das hier steht und nicht in der Oberfläche.** Beide Regeln gab es
 * schon — in `cancelInvoice` und in `addPayment`, als Reihe von Abweisungen.
 * Die Oberfläche kannte sie nicht und bot beides an, sobald der Status
 * „ausgestellt" war: Man konnte eine **Stornorechnung stornieren** und sie als
 * bezahlt markieren. Der Server wies es korrekt ab — nur passierte dann
 * sichtbar nichts, und der Fehlschlag sah aus wie ein Fehler des Benutzers.
 *
 * Als Funktionen der Domäne sind sie an einer Stelle nachlesbar und für beide
 * Seiten dieselben. Eine Kopie in der Oberfläche wäre die zweite Wahrheit, die
 * beim nächsten Sonderfall zurückbleibt.
 */
export function canBeCancelled(status: InvoiceStatus, documentType: DocumentType): boolean {
  // Eine Gutschrift storniert man nicht — sie **ist** das Storno.
  if (documentType !== 'INVOICE') {
    return false;
  }
  return status !== 'DRAFT' && status !== 'CANCELLED';
}

/** Ob auf den Beleg noch eine Zahlung erfasst werden kann (FA-STAT-05). */
export function acceptsPayments(status: InvoiceStatus, documentType: DocumentType): boolean {
  // Eine Gutschrift wird nicht bezahlt — sie erstattet.
  if (documentType !== 'INVOICE') {
    return false;
  }
  return status !== 'DRAFT' && status !== 'CANCELLED';
}

/**
 * Überfälligkeit — abgeleitet, nicht gespeichert (FA-STAT-02).
 *
 * Am Fälligkeitstag selbst ist ein Beleg noch nicht überfällig; erst am
 * Folgetag.
 */
export function isOverdue(
  status: InvoiceStatus,
  dueDate: PlainDate | null,
  today: PlainDate,
): boolean {
  if (dueDate === null || !isOpenReceivable(status)) {
    return false;
  }
  return isPlainDateBefore(dueDate, today);
}

/** Tage seit Fälligkeit; 0, wenn nicht überfällig. Für die Sortierung in M6. */
export function daysOverdue(dueDate: PlainDate | null, today: PlainDate): number {
  if (dueDate === null || !isPlainDateBefore(dueDate, today)) {
    return 0;
  }
  const due = Date.UTC(
    Number(dueDate.slice(0, 4)),
    Number(dueDate.slice(5, 7)) - 1,
    Number(dueDate.slice(8, 10)),
  );
  const reference = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  return Math.round((reference - due) / (24 * 60 * 60 * 1000));
}
