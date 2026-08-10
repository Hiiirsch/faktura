/**
 * Nummernkreis (FA-NUM-01, -05).
 *
 * Tests zuerst (Vorgabe für M3). Der Nummernkreis ist GoBD-relevant: Eine
 * vergebene Nummer wird nie wieder frei, und eine Kollision wäre ein Mangel,
 * der sich nachträglich nicht heilen lässt.
 */
import { describe, expect, it } from 'vitest';

import { plainDate } from '@/domain/time/plain-date';
import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  formatInvoiceNumber,
  isValidNumberFormat,
  parseNumberFormat,
  sequenceScopeFor,
} from '@/domain/invoice/number-format';
import { isErr, unwrap } from '@/domain/shared/result';

describe('Formatvorlage (FA-NUM-01)', () => {
  it('kennt die Standardvorlage aus der Spezifikation', () => {
    expect(DEFAULT_INVOICE_NUMBER_FORMAT).toBe('RE-{YYYY}-{SEQ:4}');
  });

  it('setzt alle vorgesehenen Platzhalter ein', () => {
    const date = plainDate('2026-03-05');
    expect(formatInvoiceNumber('RE-{YYYY}-{SEQ:4}', date, 7)).toBe('RE-2026-0007');
    expect(formatInvoiceNumber('{YY}-{SEQ:3}', date, 7)).toBe('26-007');
    expect(formatInvoiceNumber('{YYYY}{MM}-{SEQ:2}', date, 7)).toBe('202603-07');
    expect(formatInvoiceNumber('R{SEQ:6}', date, 7)).toBe('R000007');
  });

  it('nutzt denselben Platzhalter mehrfach', () => {
    expect(formatInvoiceNumber('{YYYY}/{MM}/{YYYY}-{SEQ:1}', plainDate('2026-03-05'), 9)).toBe(
      '2026/03/2026-9',
    );
  });

  it('lässt den Zähler über die angegebene Breite hinauswachsen', () => {
    const date = plainDate('2026-03-05');
    expect(formatInvoiceNumber('RE-{SEQ:4}', date, 9_999)).toBe('RE-9999');
    expect(formatInvoiceNumber('RE-{SEQ:4}', date, 10_000)).toBe('RE-10000');
    expect(formatInvoiceNumber('RE-{SEQ:4}', date, 1_234_567)).toBe('RE-1234567');
  });

  it('weist einen Zählerstand kleiner eins zurück', () => {
    expect(() => formatInvoiceNumber('RE-{SEQ:4}', plainDate('2026-03-05'), 0)).toThrow(RangeError);
  });
});

describe('Prüfung der Formatvorlage', () => {
  it('nimmt gültige Vorlagen an', () => {
    for (const format of ['RE-{YYYY}-{SEQ:4}', '{SEQ:1}', '{YY}{MM}{SEQ:9}', 'A-{YYYY}-B-{SEQ:5}']) {
      expect(unwrap(parseNumberFormat(format)).format, format).toBe(format);
    }
  });

  it('verlangt genau einen Zählerplatzhalter', () => {
    const withoutCounter = parseNumberFormat('RE-{YYYY}');
    expect(isErr(withoutCounter)).toBe(true);
    if (isErr(withoutCounter)) {
      expect(withoutCounter.error.kind).toBe('MISSING_SEQUENCE');
    }

    const twoCounters = parseNumberFormat('RE-{SEQ:2}-{SEQ:3}');
    expect(isErr(twoCounters)).toBe(true);
    if (isErr(twoCounters)) {
      expect(twoCounters.error.kind).toBe('MULTIPLE_SEQUENCES');
    }
  });

  it('weist unbekannte Platzhalter zurück', () => {
    const result = parseNumberFormat('RE-{KUNDE}-{SEQ:4}');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('UNKNOWN_PLACEHOLDER');
      if (result.error.kind === 'UNKNOWN_PLACEHOLDER') {
        expect(result.error.placeholder).toBe('KUNDE');
      }
    }
  });

  it('weist eine unbrauchbare Zählerbreite zurück', () => {
    expect(isErr(parseNumberFormat('RE-{SEQ:0}'))).toBe(true);
    expect(isErr(parseNumberFormat('RE-{SEQ:x}'))).toBe(true);
    expect(isErr(parseNumberFormat('RE-{SEQ:20}'))).toBe(true);
  });

  it('weist eine leere Vorlage zurück', () => {
    expect(isErr(parseNumberFormat(''))).toBe(true);
    expect(isErr(parseNumberFormat('   '))).toBe(true);
  });
});

describe('Zählerbereich (FA-NUM-05)', () => {
  const date = plainDate('2026-03-05');

  it('führt einen Jahreszähler, wenn die Vorlage eine Jahreskomponente hat', () => {
    expect(sequenceScopeFor('RE-{YYYY}-{SEQ:4}', date)).toBe('INVOICE-2026');
    expect(sequenceScopeFor('{YY}-{SEQ:4}', date)).toBe('INVOICE-2026');
  });

  it('startet zum Jahreswechsel neu', () => {
    expect(sequenceScopeFor('RE-{YYYY}-{SEQ:4}', plainDate('2026-12-31'))).toBe('INVOICE-2026');
    expect(sequenceScopeFor('RE-{YYYY}-{SEQ:4}', plainDate('2027-01-01'))).toBe('INVOICE-2027');
  });

  it('führt einen fortlaufenden Zähler ohne Jahreskomponente', () => {
    expect(sequenceScopeFor('RE-{SEQ:4}', date)).toBe('INVOICE');
    expect(sequenceScopeFor('RE-{SEQ:4}', plainDate('2027-01-01'))).toBe('INVOICE');
  });

  it('führt einen Monatszähler nur zusammen mit einer Jahreskomponente', () => {
    expect(sequenceScopeFor('{YYYY}{MM}-{SEQ:3}', date)).toBe('INVOICE-2026-03');
    // Ohne Jahr wäre ein Monatszähler eine Kollisionsquelle: „RE-01-0001"
    // entstünde im Januar jedes Jahres erneut.
    expect(sequenceScopeFor('RE-{MM}-{SEQ:4}', date)).toBe('INVOICE');
  });

  it('erzeugt über Jahre hinweg eindeutige Nummern — auch ohne Jahr in der Vorlage', () => {
    const numbers = new Set<string>();
    let counter = 0;

    for (const day of ['2026-01-15', '2026-02-15', '2027-01-15', '2027-02-15']) {
      counter += 1;
      numbers.add(formatInvoiceNumber('RE-{MM}-{SEQ:4}', plainDate(day), counter));
    }

    expect(numbers.size).toBe(4);
  });
});

describe('Kurzprüfung der Vorlage', () => {
  it('meldet gültige und ungültige Vorlagen ohne Ergebnisobjekt', () => {
    expect(isValidNumberFormat('RE-{YYYY}-{SEQ:4}')).toBe(true);
    expect(isValidNumberFormat('RE-{YYYY}')).toBe(false);
  });

  it('lässt unbekannte Platzhalter beim Formatieren unverändert stehen', () => {
    // Eine ungültige Vorlage kommt über die Einstellungen nicht in die
    // Datenbank; sollte sie es doch, bleibt der Platzhalter sichtbar statt
    // stillschweigend zu verschwinden.
    expect(formatInvoiceNumber('{KUNDE}-{SEQ:2}', plainDate('2026-03-05'), 3)).toBe('{KUNDE}-03');
  });
});
