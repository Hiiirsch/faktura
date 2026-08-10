/**
 * Kalendertage ohne Zeitzone.
 *
 * Rechnungs-, Leistungs- und Fälligkeitsdatum sind Kalendertage, keine
 * Zeitpunkte. Als `DateTime` gespeichert würden sie zu UTC — der 1. März in
 * Berlin läge als `2026-02-28T23:00:00Z` in der Datenbank, und Monatsumsatz
 * wie Überfälligkeit kippten an der Tagesgrenze.
 *
 * Tests zuerst (Vorgabe für M3).
 */
import { describe, expect, it } from 'vitest';

import {
  addDays,
  comparePlainDates,
  isPlainDate,
  isPlainDateAfter,
  isPlainDateBefore,
  monthOf,
  parsePlainDate,
  plainDate,
  todayIn,
  yearMonthOf,
  yearOf,
} from '@/domain/time/plain-date';
import { isErr, unwrap } from '@/domain/shared/result';

describe('parsePlainDate', () => {
  it('liest gültige Kalendertage', () => {
    expect(unwrap(parsePlainDate('2026-03-01'))).toBe('2026-03-01');
    expect(unwrap(parsePlainDate('1999-12-31'))).toBe('1999-12-31');
    expect(unwrap(parsePlainDate('2024-02-29'))).toBe('2024-02-29');
  });

  it('weist formwidrige Eingaben zurück', () => {
    for (const input of ['', '2026-3-1', '01.03.2026', '2026/03/01', 'heute', '2026-03-01T00:00']) {
      expect(isErr(parsePlainDate(input)), input).toBe(true);
    }
  });

  it('weist Tage zurück, die es nicht gibt', () => {
    for (const input of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2025-02-29']) {
      const result = parsePlainDate(input);
      expect(isErr(result), input).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe('NOT_A_CALENDAR_DAY');
      }
    }
  });
});

describe('Rechnen mit Kalendertagen', () => {
  it('addiert Tage über Monats- und Jahresgrenzen', () => {
    expect(addDays(plainDate('2026-03-01'), 14)).toBe('2026-03-15');
    expect(addDays(plainDate('2026-01-25'), 14)).toBe('2026-02-08');
    expect(addDays(plainDate('2026-12-25'), 14)).toBe('2027-01-08');
  });

  it('rechnet Schaltjahre richtig', () => {
    expect(addDays(plainDate('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(plainDate('2024-02-28'), 2)).toBe('2024-03-01');
    expect(addDays(plainDate('2025-02-28'), 1)).toBe('2025-03-01');
  });

  it('addiert null und negative Tage', () => {
    expect(addDays(plainDate('2026-03-01'), 0)).toBe('2026-03-01');
    expect(addDays(plainDate('2026-03-01'), -1)).toBe('2026-02-28');
  });

  it('vergleicht chronologisch', () => {
    expect(isPlainDateBefore(plainDate('2026-02-28'), plainDate('2026-03-01'))).toBe(true);
    expect(isPlainDateBefore(plainDate('2026-03-01'), plainDate('2026-03-01'))).toBe(false);
    expect(comparePlainDates(plainDate('2026-01-01'), plainDate('2026-12-31'))).toBe(-1);
    expect(comparePlainDates(plainDate('2026-12-31'), plainDate('2026-01-01'))).toBe(1);
    expect(comparePlainDates(plainDate('2026-05-05'), plainDate('2026-05-05'))).toBe(0);
  });

  it('sortiert lexikografisch gleich chronologisch — Grundlage für Datenbankabfragen', () => {
    const dates = ['2026-12-01', '2026-01-15', '2025-06-30', '2026-01-02'];
    expect([...dates].sort()).toEqual(['2025-06-30', '2026-01-02', '2026-01-15', '2026-12-01']);
  });

  it('liefert Jahr und Monat', () => {
    expect(yearOf(plainDate('2026-03-01'))).toBe(2026);
    expect(monthOf(plainDate('2026-03-01'))).toBe(3);
  });
});

describe('todayIn — „heute" hängt an der Zeitzone der Anwendung', () => {
  it('nimmt in Berlin den Folgetag, wenn es in UTC noch der Vortag ist', () => {
    const lateEvening = new Date('2026-02-28T23:30:00Z');
    expect(todayIn('Europe/Berlin', lateEvening)).toBe('2026-03-01');
    expect(todayIn('UTC', lateEvening)).toBe('2026-02-28');
  });

  it('nimmt in Berlin noch den Vortag, wenn es in Tokio schon der nächste ist', () => {
    const earlyMorning = new Date('2026-03-01T22:00:00Z');
    expect(todayIn('Europe/Berlin', earlyMorning)).toBe('2026-03-01');
    expect(todayIn('Asia/Tokyo', earlyMorning)).toBe('2026-03-02');
  });

  it('berücksichtigt die Sommerzeitumstellung', () => {
    // Umstellung in Europa: letzter Sonntag im März 2026 ist der 29.
    const beforeSwitch = new Date('2026-03-28T23:30:00Z');
    expect(todayIn('Europe/Berlin', beforeSwitch)).toBe('2026-03-29');
  });
});

describe('Hilfsfunktionen für Kalendertage', () => {
  it('wirft beim Erzeugen aus einem ungültigen Literal', () => {
    expect(() => plainDate('kein-datum')).toThrow(RangeError);
    expect(() => plainDate('2026-02-30')).toThrow(RangeError);
  });

  it('prüft ohne zu werfen', () => {
    expect(isPlainDate('2026-03-01')).toBe(true);
    expect(isPlainDate('2026-02-30')).toBe(false);
  });

  it('liefert Jahr und Monat als Schlüssel für Monatsauswertungen', () => {
    expect(yearMonthOf(plainDate('2026-03-01'))).toBe('2026-03');
    expect(yearMonthOf(plainDate('2026-12-31'))).toBe('2026-12');
  });

  it('vergleicht auch in der Gegenrichtung', () => {
    expect(isPlainDateAfter(plainDate('2026-03-02'), plainDate('2026-03-01'))).toBe(true);
    expect(isPlainDateAfter(plainDate('2026-03-01'), plainDate('2026-03-01'))).toBe(false);
  });

  it('weist eine nicht ganzzahlige Tagesanzahl zurück', () => {
    expect(() => addDays(plainDate('2026-03-01'), 1.5)).toThrow(RangeError);
  });
});
