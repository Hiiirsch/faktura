/**
 * NFA-QUAL-08 — Beträge, Datumsangaben und Zahlen werden nach deutschen
 * Konventionen formatiert.
 *
 * Zugleich der Nachweis für NFA-ARCH-04: Der Code `HUR` wird erst hier, in der
 * Anzeigeschicht, zu „Stunde".
 */
import { describe, expect, it } from 'vitest';

import { cents } from '@/domain/money/money';
import { quantityFromScaled } from '@/domain/quantity/quantity';
import {
  formatAmount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  formatQuantityWithUnit,
  formatTaxCategory,
  formatUnit,
  parseGermanDecimal,
} from '@/ui/format';

const BERLIN = 'Europe/Berlin';

/** Intl setzt ein schmales geschütztes Leerzeichen vor das Währungszeichen. */
function normalize(value: string): string {
  return value.replace(/[\u00A0\u202F\u2009]/g, ' ');
}

describe('formatMoney', () => {
  it('formatiert mit Tausenderpunkt, Dezimalkomma und Währungszeichen', () => {
    expect(normalize(formatMoney(cents(123456)))).toBe('1.234,56 €');
    expect(normalize(formatMoney(cents(0)))).toBe('0,00 €');
    expect(normalize(formatMoney(cents(5)))).toBe('0,05 €');
  });

  it('formatiert negative Beträge', () => {
    expect(normalize(formatMoney(cents(-123456)))).toBe('-1.234,56 €');
    expect(normalize(formatMoney(cents(-5)))).toBe('-0,05 €');
  });

  it('bleibt bei großen Beträgen exakt', () => {
    // Über Number.MAX_SAFE_INTEGER/100 hinaus: eine Division durch 100 als
    // Fließkommazahl würde hier Stellen verlieren (FA-CALC-01).
    expect(normalize(formatMoney(cents(9007199254740991)))).toBe('90.071.992.547.409,91 €');
  });

  it('berücksichtigt die gewählte Währung', () => {
    expect(normalize(formatMoney(cents(123456), 'CHF'))).toContain('CHF');
  });
});

describe('formatAmount', () => {
  it('formatiert ohne Währungszeichen', () => {
    expect(normalize(formatAmount(cents(123456)))).toBe('1.234,56');
    expect(normalize(formatAmount(cents(-50)))).toBe('-0,50');
  });
});

describe('formatQuantity', () => {
  it('nutzt das Komma als Dezimaltrennzeichen', () => {
    expect(formatQuantity(quantityFromScaled(15_000))).toBe('1,5');
    expect(formatQuantity(quantityFromScaled(30_000))).toBe('3');
    expect(formatQuantity(quantityFromScaled(-22_500))).toBe('-2,25');
  });
});

describe('Labels entstehen erst in der Anzeigeschicht (NFA-ARCH-04, NFA-ARCH-05)', () => {
  it('übersetzt Einheitencodes ins Deutsche', () => {
    expect(formatUnit('HUR')).toBe('Stunde');
    expect(formatUnit('C62')).toBe('Stück');
    expect(formatUnit('MTK')).toBe('Quadratmeter');
  });

  it('verbindet Menge und Einheit', () => {
    expect(formatQuantityWithUnit(quantityFromScaled(15_000), 'HUR')).toBe('1,5 Stunde');
  });

  it('übersetzt Steuerkategorien ins Deutsche', () => {
    expect(formatTaxCategory('S')).toBe('Regelsatz');
    expect(formatTaxCategory('AE')).toBe('Steuerschuldnerschaft des Leistungsempfängers');
  });

  it('übersetzt Währungscodes ins Deutsche', () => {
    expect(formatCurrency('EUR')).toBe('Euro');
    expect(formatCurrency('CHF')).toBe('Schweizer Franken');
  });
});

describe('Datumsformatierung', () => {
  it('gibt Datumsangaben als TT.MM.JJJJ aus', () => {
    expect(formatDate(new Date('2026-03-01T10:00:00Z'), BERLIN)).toBe('01.03.2026');
    expect(formatDate(new Date('2026-12-31T12:00:00Z'), BERLIN)).toBe('31.12.2026');
  });

  it('rechnet in die Zeitzone der Anwendung um', () => {
    // 23:00 UTC ist in Berlin bereits der Folgetag — genau der Grund, warum die
    // Zeitzone konfiguriert und nicht der Serverumgebung überlassen wird.
    const lateEvening = new Date('2026-02-28T23:00:00Z');
    expect(formatDate(lateEvening, BERLIN)).toBe('01.03.2026');
    expect(formatDate(lateEvening, 'UTC')).toBe('28.02.2026');
  });

  it('gibt Datum und Uhrzeit aus', () => {
    expect(normalize(formatDateTime(new Date('2026-03-01T09:30:00Z'), BERLIN))).toBe(
      '01.03.2026, 10:30',
    );
  });
});

describe('parseGermanDecimal', () => {
  it('übersetzt deutsche Eingaben in die kanonische Form', () => {
    expect(parseGermanDecimal('1.234,50')).toBe('1234.50');
    expect(parseGermanDecimal('1,5')).toBe('1.5');
    expect(parseGermanDecimal('  42  ')).toBe('42');
    expect(parseGermanDecimal('-1.000,25')).toBe('-1000.25');
  });
});
