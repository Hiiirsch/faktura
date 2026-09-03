/**
 * Mahnwesen — die Regeln (M15, FA-MAHN-01 bis -05).
 *
 * Geprüft werden die Zusagen, die still brechen können: dass eine Gutschrift
 * nie gemahnt wird, dass eine bezahlte Rechnung nicht gemahnt wird, auch wenn
 * ihr Termin lange verstrichen ist, und dass nach der letzten Stufe keine
 * weitere entsteht.
 */
import { describe, expect, it } from 'vitest';

import {
  canBeReminded,
  feeForLevel,
  LAST_REMINDER_LEVEL,
  nextReminderLevel,
  refusalForReminder,
  reminderAmounts,
  reminderDueDate,
  type ReminderCandidate,
  type ReminderFees,
  type ReminderLevel,
} from '@/domain/reminder/dunning';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';

const HEUTE = plainDate('2026-08-25');

const FÄLLIG: ReminderCandidate = {
  documentType: 'INVOICE',
  status: 'ISSUED',
  dueDate: plainDate('2026-07-28'),
  outstandingCents: cents(119000),
};

const GEBÜHREN: ReminderFees = {
  level1Cents: cents(0),
  level2Cents: cents(500),
  level3Cents: cents(1000),
};

describe('FA-MAHN-01 Wer gemahnt werden darf', () => {
  it('lässt eine überfällige, offene Rechnung zu', () => {
    expect(refusalForReminder(FÄLLIG, null, HEUTE)).toBeNull();
    expect(canBeReminded(FÄLLIG, null, HEUTE)).toBe(true);
  });

  it('mahnt keine Gutschrift', () => {
    // Sie fordert nichts ein, sie nimmt zurück. Dieselbe Blindheit nach
    // Belegart hat M12 an vier Stellen aufgedeckt.
    const gutschrift = { ...FÄLLIG, documentType: 'CREDIT_NOTE' as const };

    expect(refusalForReminder(gutschrift, null, HEUTE)).toEqual({ kind: 'NOT_AN_INVOICE' });
  });

  it('mahnt keinen Entwurf', () => {
    const entwurf = { ...FÄLLIG, status: 'DRAFT' as const };

    expect(refusalForReminder(entwurf, null, HEUTE)).toEqual({ kind: 'NOT_ISSUED' });
  });

  it('mahnt keinen stornierten Beleg', () => {
    const storniert = { ...FÄLLIG, status: 'CANCELLED' as const };

    expect(refusalForReminder(storniert, null, HEUTE)).toEqual({ kind: 'CANCELLED' });
  });

  it('mahnt nicht, was bezahlt ist — auch wenn der Termin lange verstrichen ist', () => {
    const bezahlt = { ...FÄLLIG, status: 'PAID' as const, outstandingCents: cents(0) };

    expect(refusalForReminder(bezahlt, null, HEUTE)).toEqual({ kind: 'NOTHING_OUTSTANDING' });
  });

  it('mahnt ohne Fälligkeitsdatum nicht — ohne Termin kein Verzug', () => {
    const ohneTermin = { ...FÄLLIG, dueDate: null };

    expect(refusalForReminder(ohneTermin, null, HEUTE)).toEqual({ kind: 'NO_DUE_DATE' });
  });

  it('mahnt am Fälligkeitstag selbst noch nicht', () => {
    // Wer am letzten Tag der Frist zahlt, hat gezahlt. Verzug beginnt danach.
    const heuteFällig = { ...FÄLLIG, dueDate: HEUTE };

    expect(refusalForReminder(heuteFällig, null, HEUTE)).toEqual({ kind: 'NOT_OVERDUE' });
  });

  it('mahnt ab dem Tag nach der Fälligkeit', () => {
    const gesternFällig = { ...FÄLLIG, dueDate: plainDate('2026-08-24') };

    expect(refusalForReminder(gesternFällig, null, HEUTE)).toBeNull();
  });

  it('mahnt nach der letzten Stufe nicht weiter', () => {
    expect(refusalForReminder(FÄLLIG, LAST_REMINDER_LEVEL, HEUTE)).toEqual({
      kind: 'LAST_LEVEL_REACHED',
    });
  });
});

describe('FA-MAHN-02 Die Stufen', () => {
  it('beginnt bei eins', () => {
    expect(nextReminderLevel(null)).toBe(1);
  });

  it('zählt hoch', () => {
    expect(nextReminderLevel(1)).toBe(2);
    expect(nextReminderLevel(2)).toBe(3);
  });

  it('endet nach der dritten', () => {
    expect(nextReminderLevel(3)).toBeNull();
  });

  it('rechnet ab der höchsten Stufe, nicht ab der Anzahl', () => {
    /*
     * Zwei Mahnungen derselben Stufe — etwa nach einem verlorenen Brief —
     * dürfen die nächste nicht überspringen lassen. Die Funktion bekommt
     * deshalb die höchste bisherige Stufe und nicht deren Zahl; dieser Test
     * hält die Bedeutung des Parameters fest.
     */
    expect(nextReminderLevel(1)).toBe(2);
  });
});

describe('FA-MAHN-03 Die Mahngebühr', () => {
  it('nimmt den Betrag der jeweiligen Stufe', () => {
    expect(feeForLevel(GEBÜHREN, 1)).toBe(0);
    expect(feeForLevel(GEBÜHREN, 2)).toBe(500);
    expect(feeForLevel(GEBÜHREN, 3)).toBe(1000);
  });

  it('addiert sie zum offenen Betrag', () => {
    const beträge = reminderAmounts(cents(119000), cents(500));

    expect(beträge.outstandingCents).toBe(119000);
    expect(beträge.feeCents).toBe(500);
    expect(beträge.totalCents).toBe(119500);
  });

  it('kommt auch ohne Gebühr aus', () => {
    expect(reminderAmounts(cents(119000), cents(0)).totalCents).toBe(119000);
  });

  it('weist eine negative Gebühr ab, statt sie zu verrechnen', () => {
    // Sie wäre eine Gutschrift im Gewand einer Mahnung.
    expect(() => reminderAmounts(cents(119000), cents(-500))).toThrow(RangeError);
  });

  it('weist eine Mahnung ohne offenen Betrag ab', () => {
    expect(() => reminderAmounts(cents(0), cents(500))).toThrow(RangeError);
  });

  it('rechnet ausschließlich ganzzahlig', () => {
    // 19,99 + 0,01 darf nicht 20,000000000000004 ergeben — der Grund, warum in
    // dieser Anwendung nirgends eine Fließkommazahl steht.
    const beträge = reminderAmounts(cents(1999), cents(1));

    expect(beträge.totalCents).toBe(2000);
    expect(Number.isInteger(beträge.totalCents)).toBe(true);
  });
});

describe('FA-MAHN-04 Die neue Zahlungsfrist', () => {
  it('rechnet ab dem Tag der Mahnung', () => {
    // Sie ersetzt die Frist der Rechnung nicht — die ist verstrichen —, sondern
    // setzt eine neue, kurze.
    expect(reminderDueDate(plainDate('2026-08-25'), 7)).toBe('2026-09-01');
  });

  it('rechnet über den Monatswechsel hinweg', () => {
    expect(reminderDueDate(plainDate('2026-08-28'), 7)).toBe('2026-09-04');
  });

  it('erlaubt eine Frist von null Tagen — sofort fällig', () => {
    expect(reminderDueDate(plainDate('2026-08-28'), 0)).toBe('2026-08-28');
  });

  it('weist eine negative Frist ab', () => {
    expect(() => reminderDueDate(plainDate('2026-08-28'), -1)).toThrow(RangeError);
  });
});

describe('Die Stufe als Typ', () => {
  it('kennt genau drei', () => {
    const levels: readonly ReminderLevel[] = [1, 2, 3];

    expect(levels).toHaveLength(3);
    expect(LAST_REMINDER_LEVEL).toBe(3);
  });
});
