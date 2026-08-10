/**
 * Stammdaten-Logik: IBAN, USt-IdNr, Kundennummern, Zahlungsziel und die
 * Ableitung der steuerlichen Behandlung
 * (FA-STAMM-03, -04; FA-KUND-02, -04, -05).
 */
import { describe, expect, it } from 'vitest';

import {
  formatIban,
  isValidBic,
  isValidIban,
  normalizeIban,
  validateIban,
} from '@/domain/banking/iban';
import {
  CUSTOMER_NUMBER_SEQUENCE_SCOPE,
  formatCustomerNumber,
  isCustomerNumber,
} from '@/domain/customer/customer-number';
import {
  isValidPaymentTerms,
  MAX_PAYMENT_TERMS_DAYS,
  resolvePaymentTerms,
} from '@/domain/customer/payment-terms';
import {
  determineTaxScheme,
  isTaxScheme,
  TAX_SCHEMES,
  taxCategoryForScheme,
  taxRateForScheme,
} from '@/domain/tax/tax-scheme';
import {
  hasVatIdPattern,
  isValidVatId,
  normalizeVatId,
  validateVatId,
  vatIdCountryPrefix,
} from '@/domain/tax/vat-id';
import { isErr, unwrap } from '@/domain/shared/result';
import type { CountryCode } from '@/domain/codes/country-code';

const country = (code: string): CountryCode => code as CountryCode;

describe('IBAN-Prüfung (FA-STAMM-04)', () => {
  it('akzeptiert gültige IBANs verschiedener Länder', () => {
    for (const iban of [
      'DE89370400440532013000',
      'AT611904300234573201',
      'CH9300762011623852957',
      'FR1420041010050500013M02606',
      'NL91ABNA0417164300',
      'GB29NWBK60161331926819',
    ]) {
      expect(isValidIban(iban), `${iban} sollte gültig sein`).toBe(true);
    }
  });

  it('ignoriert Leerzeichen und Kleinschreibung', () => {
    expect(isValidIban('de89 3704 0044 0532 0130 00')).toBe(true);
    expect(normalizeIban('de89 3704 0044')).toBe('DE8937040044');
  });

  it('erkennt einen Zahlendreher über die Prüfsumme', () => {
    // Zwei vertauschte Ziffern gegenüber der gültigen Nummer.
    const result = validateIban('DE89370400440532013090');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('CHECKSUM_FAILED');
    }
  });

  it('prüft die landesspezifische Länge', () => {
    const result = validateIban('DE8937040044053201300');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('WRONG_LENGTH');
      if (result.error.kind === 'WRONG_LENGTH') {
        expect(result.error.expected).toBe(22);
        expect(result.error.actual).toBe(21);
      }
    }
  });

  it('weist unbekannte Länderpräfixe zurück', () => {
    const result = validateIban('ZZ89370400440532013000');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('UNKNOWN_COUNTRY');
    }
  });

  it('weist leere und formwidrige Eingaben zurück', () => {
    expect(isErr(validateIban('   '))).toBe(true);
    expect(isErr(validateIban('DE!!370400440532013000'))).toBe(true);
    expect(isErr(validateIban('1234567890'))).toBe(true);
  });

  it('gibt die geprüfte Nummer normalisiert zurück', () => {
    expect(unwrap(validateIban('de89 3704 0044 0532 0130 00'))).toBe('DE89370400440532013000');
  });

  it('gruppiert für die Anzeige in Viererblöcken', () => {
    expect(formatIban('DE89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });

  it('formatiert auch eine leere Eingabe unfallfrei', () => {
    expect(formatIban('')).toBe('');
  });

  it('prüft den BIC auf acht oder elf Stellen', () => {
    expect(isValidBic('COBADEFFXXX')).toBe(true);
    expect(isValidBic('COBADEFF')).toBe(true);
    expect(isValidBic('COBADEF')).toBe(false);
    expect(isValidBic('1OBADEFF')).toBe(false);
  });
});

describe('USt-IdNr (FA-KUND-04)', () => {
  it('akzeptiert gültige Formate je Land', () => {
    for (const [vatId, code] of [
      ['DE123456789', 'DE'],
      ['ATU12345678', 'AT'],
      ['FRAB123456789', 'FR'],
      ['NL123456789B01', 'NL'],
      ['ITU12345678901'.replace('U', ''), 'IT'],
      ['CHE123456789MWST', 'CH'],
    ] as const) {
      expect(isValidVatId(vatId, code), `${vatId} sollte gültig sein`).toBe(true);
    }
  });

  it('normalisiert Punkte, Leerzeichen und Kleinschreibung', () => {
    expect(normalizeVatId('de 123.456-789')).toBe('DE123456789');
    expect(isValidVatId('de 123 456 789')).toBe(true);
  });

  it('weist ein falsches Format des Landes zurück', () => {
    const result = validateVatId('DE12345', 'DE');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('WRONG_FORMAT');
    }
  });

  it('erkennt, wenn Land und Präfix nicht zusammenpassen', () => {
    const result = validateVatId('ATU12345678', 'DE');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('COUNTRY_MISMATCH');
    }
  });

  it('führt Griechenland unter dem Präfix EL', () => {
    expect(isValidVatId('EL123456789', 'GR')).toBe(true);
    expect(isValidVatId('GR123456789', 'GR')).toBe(true);
  });

  it('meldet Länder ohne hinterlegtes Muster als solche', () => {
    const result = validateVatId('US123456789');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('UNSUPPORTED_COUNTRY');
    }
  });

  it('weist leere und formwidrige Eingaben zurück', () => {
    expect(isErr(validateVatId(''))).toBe(true);
    expect(isErr(validateVatId('12345'))).toBe(true);
  });

  it('liefert den Länderpräfix der Nummer', () => {
    expect(vatIdCountryPrefix('de123456789')).toBe('DE');
    expect(vatIdCountryPrefix('EL123456789')).toBe('EL');
  });

  it('gibt Auskunft, für welche Länder ein Muster hinterlegt ist', () => {
    expect(hasVatIdPattern('DE')).toBe(true);
    expect(hasVatIdPattern('AT')).toBe(true);
    expect(hasVatIdPattern('US')).toBe(false);
  });
});

describe('Kundennummern (FA-KUND-02)', () => {
  it('vergibt vierstellig mit führenden Nullen', () => {
    expect(formatCustomerNumber(1)).toBe('K-0001');
    expect(formatCustomerNumber(42)).toBe('K-0042');
    expect(formatCustomerNumber(9999)).toBe('K-9999');
  });

  it('wächst über vier Stellen hinaus, statt umzubrechen', () => {
    expect(formatCustomerNumber(10_000)).toBe('K-10000');
    expect(formatCustomerNumber(123_456)).toBe('K-123456');
  });

  it('weist ungültige Zählerstände zurück', () => {
    expect(() => formatCustomerNumber(0)).toThrow(RangeError);
    expect(() => formatCustomerNumber(-1)).toThrow(RangeError);
    expect(() => formatCustomerNumber(1.5)).toThrow(RangeError);
  });

  it('erkennt gültige Nummern wieder', () => {
    expect(isCustomerNumber('K-0001')).toBe(true);
    expect(isCustomerNumber('K-123456')).toBe(true);
    expect(isCustomerNumber('K-1')).toBe(false);
    expect(isCustomerNumber('0001')).toBe(false);
    expect(CUSTOMER_NUMBER_SEQUENCE_SCOPE).toBe('CUSTOMER');
  });
});

describe('Zahlungsziel (FA-KUND-05)', () => {
  it('bevorzugt das kundenspezifische Ziel', () => {
    expect(resolvePaymentTerms(30, 14)).toBe(30);
  });

  it('fällt ohne eigenes Ziel auf den Standard zurück', () => {
    expect(resolvePaymentTerms(null, 14)).toBe(14);
  });

  it('unterscheidet „kein Ziel hinterlegt" von „sofort zahlbar"', () => {
    expect(resolvePaymentTerms(0, 14)).toBe(0);
  });

  it('prüft den zulässigen Bereich', () => {
    expect(isValidPaymentTerms(0)).toBe(true);
    expect(isValidPaymentTerms(MAX_PAYMENT_TERMS_DAYS)).toBe(true);
    expect(isValidPaymentTerms(-1)).toBe(false);
    expect(isValidPaymentTerms(MAX_PAYMENT_TERMS_DAYS + 1)).toBe(false);
    expect(isValidPaymentTerms(14.5)).toBe(false);
  });
});

describe('Steuerliche Behandlung aus Stammdaten (FA-STAMM-03)', () => {
  const seller = { sellerCountry: country('DE'), sellerIsSmallBusiness: false };

  it('nutzt den Regelsatz im Inland', () => {
    const scheme = determineTaxScheme({
      ...seller,
      buyerCountry: country('DE'),
      buyerHasVatId: false,
    });
    expect(scheme).toBe('STANDARD');
    expect(taxCategoryForScheme(scheme)).toBe('S');
    expect(taxRateForScheme(scheme, 19)).toBe(19);
  });

  it('schlägt Reverse Charge bei EU-Kunden mit USt-IdNr vor (FA-CALC-06)', () => {
    const scheme = determineTaxScheme({
      ...seller,
      buyerCountry: country('AT'),
      buyerHasVatId: true,
    });
    expect(scheme).toBe('REVERSE_CHARGE');
    expect(taxCategoryForScheme(scheme)).toBe('AE');
    expect(taxRateForScheme(scheme, 19)).toBe(0);
  });

  it('bleibt bei EU-Kunden ohne USt-IdNr beim Regelsatz', () => {
    expect(
      determineTaxScheme({ ...seller, buyerCountry: country('AT'), buyerHasVatId: false }),
    ).toBe('STANDARD');
  });

  it('schlägt für Drittländer die Ausfuhr vor (FA-CALC-07)', () => {
    for (const code of ['CH', 'US', 'GB']) {
      const scheme = determineTaxScheme({
        ...seller,
        buyerCountry: country(code),
        buyerHasVatId: true,
      });
      expect(scheme, `${code} ist Drittland`).toBe('EXPORT');
      expect(taxCategoryForScheme(scheme)).toBe('G');
    }
  });

  it('setzt die Kleinunternehmerregelung über alles andere (FA-CALC-05)', () => {
    for (const buyerCountry of ['DE', 'AT', 'US']) {
      const scheme = determineTaxScheme({
        sellerCountry: country('DE'),
        sellerIsSmallBusiness: true,
        buyerCountry: country(buyerCountry),
        buyerHasVatId: true,
      });
      expect(scheme, `auch bei Kunde in ${buyerCountry}`).toBe('SMALL_BUSINESS');
      expect(taxCategoryForScheme(scheme)).toBe('E');
      expect(taxRateForScheme(scheme, 19)).toBe(0);
    }
  });

  it('führt für jedes Verfahren eine Kategorie', () => {
    for (const scheme of TAX_SCHEMES) {
      expect(taxCategoryForScheme(scheme)).toBeTruthy();
      expect(isTaxScheme(scheme)).toBe(true);
    }
    expect(isTaxScheme('IRGENDWAS')).toBe(false);
  });
});
