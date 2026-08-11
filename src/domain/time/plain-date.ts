/**
 * Kalendertage ohne Zeitzone.
 *
 * Rechnungs-, Leistungs- und Fälligkeitsdatum sind Kalendertage, keine
 * Zeitpunkte. Als `DateTime` gespeichert würden sie zu UTC — der 1. März in
 * Berlin läge als `2026-02-28T23:00:00Z` in der Datenbank, und je nach
 * Auslesekontext stünde der falsche Tag auf der Rechnung, der Monatsumsatz
 * fiele in den falschen Monat, und die Überfälligkeit kippte abends um 23 Uhr.
 *
 * Die Textform `YYYY-MM-DD` ist unmissverständlich, sortiert lexikografisch
 * gleich chronologisch — Zeitraumfilter und Sortierung in der Datenbank
 * funktionieren damit unverändert — und ist auch in einer Sicherung lesbar.
 *
 * Echte Zeitpunkte (Zahlungseingang, Protokollzeitstempel) bleiben `DateTime`.
 */
import { err, ok, type Result } from '../shared/result';

declare const plainDateBrand: unique symbol;

/** Ein Kalendertag in der Form `YYYY-MM-DD`. */
export type PlainDate = string & { readonly [plainDateBrand]: true };

export type PlainDateError =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'MALFORMED' }
  | { readonly kind: 'NOT_A_CALENDAR_DAY' };

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Millisekunden eines Tages — für die Umrechnung über UTC-Mitternacht. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  // Date.UTC normalisiert stillschweigend: Aus dem 30. Februar wird der
  // 1. oder 2. März. Genau daran erkennen wir einen Tag, den es nicht gibt.
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function parsePlainDate(input: string): Result<PlainDate, PlainDateError> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return err({ kind: 'EMPTY' });
  }

  const match = PATTERN.exec(trimmed);
  if (match === null) {
    return err({ kind: 'MALFORMED' });
  }

  const [, year = '', month = '', day = ''] = match;
  if (!isCalendarDay(Number(year), Number(month), Number(day))) {
    return err({ kind: 'NOT_A_CALENDAR_DAY' });
  }

  return ok(trimmed as PlainDate);
}

/**
 * Erzeugt einen Kalendertag aus einem Literal. Wirft bei ungültiger Eingabe —
 * für Konstanten, Testdaten und bereits geprüfte Werte aus der Datenbank.
 */
export function plainDate(value: string): PlainDate {
  const result = parsePlainDate(value);
  if (!result.ok) {
    throw new RangeError(`Kein gültiger Kalendertag: ${value}`);
  }
  return result.value;
}

export function isPlainDate(value: string): boolean {
  return parsePlainDate(value).ok;
}

export function yearOf(date: PlainDate): number {
  return Number(date.slice(0, 4));
}

export function monthOf(date: PlainDate): number {
  return Number(date.slice(5, 7));
}

/** Jahr und Monat als `YYYY-MM` — Schlüssel für Monatsauswertungen. */
export function yearMonthOf(date: PlainDate): string {
  return date.slice(0, 7);
}

export function addDays(date: PlainDate, days: number): PlainDate {
  if (!Number.isSafeInteger(days)) {
    throw new RangeError(`Tage müssen ganzzahlig sein: ${String(days)}`);
  }

  const base = Date.UTC(yearOf(date), monthOf(date) - 1, Number(date.slice(8, 10)));
  const shifted = new Date(base + days * MS_PER_DAY);

  return formatUtcDate(shifted) as PlainDate;
}

function formatUtcDate(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Ganze Tage zwischen zwei Kalendertagen; negativ, wenn `to` vor `from` liegt.
 *
 * Gerechnet wird über UTC-Mitternacht, damit keine Sommerzeitumstellung
 * dazwischenkommt: An den zwei Tagen im Jahr, an denen ein Tag 23 oder 25
 * Stunden hat, ergäbe eine Ortszeitrechnung sonst 0 oder 2 statt 1.
 */
export function daysBetween(from: PlainDate, to: PlainDate): number {
  const start = Date.UTC(yearOf(from), monthOf(from) - 1, Number(from.slice(8, 10)));
  const end = Date.UTC(yearOf(to), monthOf(to) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / MS_PER_DAY);
}

export function comparePlainDates(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isPlainDateBefore(a: PlainDate, b: PlainDate): boolean {
  return a < b;
}

export function isPlainDateAfter(a: PlainDate, b: PlainDate): boolean {
  return a > b;
}

/**
 * Der Kalendertag, der in der angegebenen Zeitzone gerade gilt.
 *
 * `Intl` gehört zum Sprachumfang, nicht zur Laufzeitumgebung — die
 * Domain-Schicht bleibt damit frei von Fremdabhängigkeiten. Der Zeitpunkt wird
 * übergeben, nicht gelesen: sonst wäre das Verhalten an der Tagesgrenze nicht
 * prüfbar.
 */
export function todayIn(timeZone: string, now: Date): PlainDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  // `en-CA` liefert bereits die Form YYYY-MM-DD.
  return plainDate(parts);
}
