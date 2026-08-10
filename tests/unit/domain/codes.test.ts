/**
 * Normierte Codes statt Klartext (NFA-ARCH-04, NFA-ARCH-05, FA-KUND-03,
 * NFA-ARCH-09, Spec §9.2).
 *
 * Der Nachweis, dass die deutschen Labels erst in der Anzeigeschicht entstehen,
 * liegt in tests/unit/ui/format.test.ts.
 */
import { describe, expect, it } from 'vitest';

import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY_CODE,
  isCountryCode,
  isEuMemberState,
} from '@/domain/codes/country-code';
import {
  CURRENCY_CODES,
  CURRENCY_DECIMALS,
  DEFAULT_CURRENCY_CODE,
  isCurrencyCode,
} from '@/domain/codes/currency-code';
import {
  DEFAULT_TAX_CATEGORY,
  isTaxCategoryCode,
  requiresZeroRate,
  TAX_CATEGORY_CODES,
} from '@/domain/codes/tax-category';
import { DEFAULT_UNIT_CODE, isUnitCode, UNIT_CODES } from '@/domain/codes/unit-code';
import {
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_TYPES,
  isDocumentType,
} from '@/domain/document/document-type';

describe('Einheiten nach UN/ECE Rec 20 (NFA-ARCH-04)', () => {
  it('führt die in Spec §9.2 genannten Codes', () => {
    expect([...UNIT_CODES]).toEqual(['C62', 'HUR', 'DAY', 'MON', 'KGM', 'MTR', 'MTK', 'LTR', 'E48']);
  });

  it('erkennt gültige und ungültige Codes', () => {
    expect(isUnitCode('HUR')).toBe(true);
    expect(isUnitCode('Stunde')).toBe(false);
    expect(isUnitCode('hur')).toBe(false);
    expect(isUnitCode('')).toBe(false);
  });

  it('nutzt Stück als Vorgabe', () => {
    expect(DEFAULT_UNIT_CODE).toBe('C62');
  });
});

describe('Steuerkategorien nach UNTDID 5305 (NFA-ARCH-05)', () => {
  it('führt die in Spec §9.2 genannten Codes', () => {
    expect([...TAX_CATEGORY_CODES]).toEqual(['S', 'AE', 'E', 'G', 'K', 'Z']);
  });

  it('erkennt gültige und ungültige Codes', () => {
    expect(isTaxCategoryCode('AE')).toBe(true);
    expect(isTaxCategoryCode('Reverse Charge')).toBe(false);
    expect(isTaxCategoryCode('X')).toBe(false);
  });

  it('kennzeichnet die Kategorien, die zwingend mit Satz null geführt werden', () => {
    // Grundlage für FA-CALC-05 (§19) und FA-CALC-06 (Reverse Charge) in M3.
    expect(requiresZeroRate('AE')).toBe(true);
    expect(requiresZeroRate('E')).toBe(true);
    expect(requiresZeroRate('G')).toBe(true);
    expect(requiresZeroRate('K')).toBe(true);
    expect(requiresZeroRate('Z')).toBe(true);
    expect(requiresZeroRate('S')).toBe(false);
  });

  it('nutzt den Regelsatz als Vorgabe', () => {
    expect(DEFAULT_TAX_CATEGORY).toBe('S');
  });
});

describe('Ländercodes nach ISO 3166-1 alpha-2 (FA-KUND-03)', () => {
  it('besteht ausschließlich aus zweistelligen Großbuchstaben', () => {
    for (const code of COUNTRY_CODES) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('enthält keine Dubletten', () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
  });

  it('erkennt gültige und ungültige Codes', () => {
    expect(isCountryCode('DE')).toBe(true);
    expect(isCountryCode('AT')).toBe(true);
    expect(isCountryCode('Deutschland')).toBe(false);
    expect(isCountryCode('XX')).toBe(false);
    expect(isCountryCode('de')).toBe(false);
  });

  it('nutzt Deutschland als Vorgabe', () => {
    expect(DEFAULT_COUNTRY_CODE).toBe('DE');
  });

  it('kennt die 27 EU-Mitgliedstaaten', () => {
    const members = COUNTRY_CODES.filter((code) => isCountryCode(code) && isEuMemberState(code));
    expect(members).toHaveLength(27);
  });

  it('unterscheidet EU von Drittland — Grundlage für FA-CALC-06 und FA-CALC-07', () => {
    const inEu = (code: string): boolean => isCountryCode(code) && isEuMemberState(code);

    expect(inEu('DE')).toBe(true);
    expect(inEu('AT')).toBe(true);
    expect(inEu('CH')).toBe(false);
    expect(inEu('GB')).toBe(false);
    expect(inEu('US')).toBe(false);
  });
});

describe('Währungen nach ISO 4217', () => {
  it('besteht aus dreistelligen Großbuchstaben', () => {
    for (const code of CURRENCY_CODES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('erkennt gültige und ungültige Codes', () => {
    expect(isCurrencyCode('EUR')).toBe(true);
    expect(isCurrencyCode('Euro')).toBe(false);
    expect(isCurrencyCode('XXX')).toBe(false);
  });

  it('nutzt Euro als Vorgabe und rechnet mit zwei Nachkommastellen', () => {
    expect(DEFAULT_CURRENCY_CODE).toBe('EUR');
    expect(CURRENCY_DECIMALS).toBe(2);
  });
});

describe('Belegarten als Aufzählung (NFA-ARCH-09)', () => {
  it('führt Rechnung und Stornorechnung', () => {
    expect([...DOCUMENT_TYPES]).toEqual(['INVOICE', 'CREDIT_NOTE']);
    expect(DEFAULT_DOCUMENT_TYPE).toBe('INVOICE');
  });

  it('erkennt gültige und ungültige Werte', () => {
    expect(isDocumentType('CREDIT_NOTE')).toBe(true);
    expect(isDocumentType('OFFER')).toBe(false);
  });
});
