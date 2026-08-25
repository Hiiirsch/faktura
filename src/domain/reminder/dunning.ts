/**
 * Mahnwesen — die Regeln (M15, FA-MAHN-01 bis -05).
 *
 * **Eine Mahnung ist kein umsatzsteuerlicher Beleg.** Sie fordert eine
 * bestehende Forderung ein, sie begründet keine neue: kein Steuerausweis, kein
 * Umsatz, keine Zahlung darauf. Bezahlt wird die **Rechnung**; die Mahnung
 * nennt nur, was von ihr offen ist. Deshalb liegt sie in einer eigenen Tabelle
 * und nicht als weiterer `documentType` an `Invoice` — dort bekäme jede
 * bestehende Regel (Umsatz, Zahlungen, Storno, Status) einen neuen Fall, den
 * man übersehen kann. Genau diese Blindheit nach Belegart hat M12 an vier
 * Stellen aufgedeckt.
 *
 * Was hier steht, ist rein: keine Datenbank, keine Uhr, kein Framework. Der
 * Bezugstag kommt als Parameter herein, wie überall in dieser Anwendung.
 */
import type { DocumentType } from '../document/document-type';
import { addCents, type Cents, isValidCents } from '../money/money';
import type { InvoiceStatus } from '../invoice/status';
import { addDays, type PlainDate } from '../time/plain-date';

/**
 * Die drei Stufen.
 *
 * **Drei und nicht beliebig viele.** Eine vierte Mahnung ist keine Mahnung
 * mehr, sondern eine Ankündigung, die niemand einlöst; wer nach der letzten
 * nicht zahlt, wird nicht durch eine weitere zahlen. Die Zahl steht hier und
 * nicht als Einstellung, weil sie eine Aussage über den Ablauf ist und nicht
 * über den Geschmack.
 */
export const REMINDER_LEVELS = [1, 2, 3] as const;

export type ReminderLevel = (typeof REMINDER_LEVELS)[number];

export const LAST_REMINDER_LEVEL: ReminderLevel = 3;

export function isReminderLevel(value: number): value is ReminderLevel {
  return (REMINDER_LEVELS as readonly number[]).includes(value);
}

/** Der Beleg, so weit ihn das Mahnwesen kennen muss. */
export type ReminderCandidate = {
  readonly documentType: DocumentType;
  readonly status: InvoiceStatus;
  readonly dueDate: PlainDate | null;
  readonly outstandingCents: Cents;
};

export type ReminderRefusal =
  /** Ein Entwurf ist keine Forderung. */
  | { readonly kind: 'NOT_ISSUED' }
  /** Eine Gutschrift fordert nichts ein — sie nimmt zurück. */
  | { readonly kind: 'NOT_AN_INVOICE' }
  /** Storniert: Die Forderung besteht nicht mehr. */
  | { readonly kind: 'CANCELLED' }
  /** Nichts offen. */
  | { readonly kind: 'NOTHING_OUTSTANDING' }
  /** Ohne Fälligkeitsdatum gibt es keinen Verzug. */
  | { readonly kind: 'NO_DUE_DATE' }
  /** Noch nicht fällig — mahnen kann man erst danach. */
  | { readonly kind: 'NOT_OVERDUE' }
  /** Die letzte Stufe ist erreicht. */
  | { readonly kind: 'LAST_LEVEL_REACHED' };

/**
 * Ob dieser Beleg heute gemahnt werden darf.
 *
 * **Dieselbe Bedingung, unter der der Server die Handlung annimmt** — die Regel
 * aus M12: Eine Aktion wird genau dann angeboten, wenn sie auch durchgeht.
 * Oberfläche und Anwendungsfall rufen beide diese Funktion.
 *
 * Die Reihenfolge der Prüfungen ist die Reihenfolge der Auskunft: Was am
 * grundsätzlichsten dagegen spricht, wird zuerst genannt. „Nichts offen" vor
 * „nicht überfällig", weil eine bezahlte Rechnung auch dann nicht gemahnt wird,
 * wenn ihr Termin lange verstrichen ist.
 */
export function refusalForReminder(
  invoice: ReminderCandidate,
  previousLevel: ReminderLevel | null,
  today: PlainDate,
): ReminderRefusal | null {
  if (invoice.documentType !== 'INVOICE') {
    return { kind: 'NOT_AN_INVOICE' };
  }
  if (invoice.status === 'DRAFT') {
    return { kind: 'NOT_ISSUED' };
  }
  if (invoice.status === 'CANCELLED') {
    return { kind: 'CANCELLED' };
  }
  if (invoice.outstandingCents <= 0) {
    return { kind: 'NOTHING_OUTSTANDING' };
  }
  if (invoice.dueDate === null) {
    return { kind: 'NO_DUE_DATE' };
  }
  if (invoice.dueDate >= today) {
    return { kind: 'NOT_OVERDUE' };
  }
  if (previousLevel !== null && previousLevel >= LAST_REMINDER_LEVEL) {
    return { kind: 'LAST_LEVEL_REACHED' };
  }

  return null;
}

/** Kurzform für die Oberfläche. */
export function canBeReminded(
  invoice: ReminderCandidate,
  previousLevel: ReminderLevel | null,
  today: PlainDate,
): boolean {
  return refusalForReminder(invoice, previousLevel, today) === null;
}

/**
 * Die nächste Stufe.
 *
 * Gezählt wird ab der höchsten bereits ausgestellten, nicht ab ihrer Anzahl:
 * Zwei Mahnungen derselben Stufe — etwa nach einem verlorenen Brief — dürfen
 * nicht dazu führen, dass die nächste eine Stufe überspringt.
 */
export function nextReminderLevel(previousLevel: ReminderLevel | null): ReminderLevel | null {
  if (previousLevel === null) {
    return 1;
  }
  if (previousLevel >= LAST_REMINDER_LEVEL) {
    return null;
  }

  const next = previousLevel + 1;
  return isReminderLevel(next) ? next : null;
}

/**
 * Die Mahngebühren je Stufe, wie das Unternehmen sie führt.
 *
 * Als Beträge in Cent und je Stufe einzeln — nicht als Prozentsatz und nicht
 * als eine Zahl für alle: Eine Zahlungserinnerung kostet üblicherweise nichts,
 * die letzte Mahnung am meisten, und dazwischen entscheidet der Betrieb.
 */
export type ReminderFees = {
  readonly level1Cents: Cents;
  readonly level2Cents: Cents;
  readonly level3Cents: Cents;
};

export function feeForLevel(fees: ReminderFees, level: ReminderLevel): Cents {
  switch (level) {
    case 1:
      return fees.level1Cents;
    case 2:
      return fees.level2Cents;
    default:
      return fees.level3Cents;
  }
}

export type ReminderAmounts = {
  /** Was von der Rechnung offen ist — ohne Gebühr. */
  readonly outstandingCents: Cents;
  readonly feeCents: Cents;
  /** Was insgesamt zu zahlen ist. */
  readonly totalCents: Cents;
};

/**
 * Was auf der Mahnung steht.
 *
 * Ganzzahlig in Cent, wie jeder Betrag in dieser Anwendung. Addiert wird über
 * `addCents`, damit auch hier eine Stelle über die Grenzen wacht — anders als
 * beim Produkt aus Menge, Betrag und Rabatt braucht es dafür kein `bigint`.
 *
 * Eine negative Gebühr wird abgewiesen statt stillschweigend verrechnet: Sie
 * wäre eine Gutschrift im Gewand einer Mahnung.
 */
export function reminderAmounts(outstandingCents: Cents, feeCents: Cents): ReminderAmounts {
  if (!isValidCents(outstandingCents) || !isValidCents(feeCents)) {
    throw new TypeError('Beträge müssen ganzzahlige Cent-Werte sein');
  }
  if (outstandingCents <= 0) {
    throw new RangeError('Eine Mahnung ohne offenen Betrag gibt es nicht');
  }
  if (feeCents < 0) {
    throw new RangeError('Eine Mahngebühr ist nicht negativ');
  }

  return {
    outstandingCents,
    feeCents,
    totalCents: addCents(outstandingCents, feeCents),
  };
}

/**
 * Die Zahlungsfrist der Mahnung.
 *
 * Sie ersetzt die Frist der Rechnung nicht — die ist verstrichen, darum geht es
 * ja —, sondern setzt eine neue, kurze. Gerechnet wird ab dem Tag der Mahnung
 * und in Kalendertagen, wie jede Frist in dieser Anwendung.
 */
export function reminderDueDate(issueDate: PlainDate, days: number): PlainDate {
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new RangeError(`Zahlungsfrist muss eine nicht-negative Ganzzahl sein: ${String(days)}`);
  }

  return addDays(issueDate, days);
}
