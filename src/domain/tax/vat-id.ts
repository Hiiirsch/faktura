/**
 * Formale Prüfung der Umsatzsteuer-Identifikationsnummer (FA-KUND-04).
 *
 * Geprüft wird ausschließlich das Format des jeweiligen Landes. Eine Abfrage
 * beim VIES-Dienst der EU käme nicht in Frage: Die Anwendung überträgt keine
 * Daten an Dritte und funktioniert ohne ausgehende Verbindung (NFA-COMP-05).
 *
 * Ein formal gültiger Aufbau bedeutet also nicht, dass die Nummer vergeben ist.
 * Das ist eine bewusste Grenze — sie fängt Tippfehler ab, nicht mehr.
 */
import { err, ok, type Result } from '../shared/result';

/**
 * Aufbau je Land nach der Systematik der EU-Kommission. Der Länderpräfix ist
 * Teil der Nummer und in den Mustern enthalten.
 */
const VAT_ID_PATTERNS: Readonly<Record<string, RegExp>> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE[01]\d{9}$/,
  BG: /^BG\d{9,10}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  GR: /^(EL|GR)\d{9}$/,
  HR: /^HR\d{11}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE(\d{7}[A-W]|\d[A-Z*+]\d{5}[A-W]|\d{7}[A-W][AH])$/,
  IT: /^IT\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  LV: /^LV\d{11}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SE: /^SE\d{12}$/,
  SI: /^SI\d{8}$/,
  SK: /^SK\d{10}$/,
  // Nicht-EU, im Geschäftsverkehr dennoch geläufig.
  CH: /^CHE\d{9}(MWST|TVA|IVA)?$/,
  GB: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
};

export type VatIdError =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'MALFORMED' }
  | { readonly kind: 'UNSUPPORTED_COUNTRY'; readonly countryCode: string }
  | { readonly kind: 'WRONG_FORMAT'; readonly countryCode: string }
  | { readonly kind: 'COUNTRY_MISMATCH'; readonly expected: string; readonly actual: string };

export function normalizeVatId(input: string): string {
  return input.replace(/[\s.\-/]/g, '').toUpperCase();
}

/** Der Länderpräfix der Nummer selbst — bei Griechenland `EL` statt `GR`. */
export function vatIdCountryPrefix(vatId: string): string {
  return normalizeVatId(vatId).slice(0, 2);
}

/**
 * Prüft die Nummer. Ist ein Land angegeben, muss der Präfix dazu passen —
 * eine österreichische Nummer bei einem deutschen Kunden ist fast immer ein
 * Zuordnungsfehler.
 */
export function validateVatId(input: string, countryCode?: string): Result<string, VatIdError> {
  const vatId = normalizeVatId(input);

  if (vatId.length === 0) {
    return err({ kind: 'EMPTY' });
  }
  if (!/^[A-Z]{2}[A-Z0-9]+$/.test(vatId)) {
    return err({ kind: 'MALFORMED' });
  }

  const prefix = vatId.slice(0, 2);
  // Griechenland führt seine Nummern mit `EL`, das Land selbst heißt `GR`.
  const lookupCountry = prefix === 'EL' ? 'GR' : prefix;

  if (countryCode !== undefined && countryCode !== lookupCountry) {
    return err({ kind: 'COUNTRY_MISMATCH', expected: countryCode, actual: lookupCountry });
  }

  const pattern = VAT_ID_PATTERNS[lookupCountry];
  if (pattern === undefined) {
    return err({ kind: 'UNSUPPORTED_COUNTRY', countryCode: lookupCountry });
  }
  if (!pattern.test(vatId)) {
    return err({ kind: 'WRONG_FORMAT', countryCode: lookupCountry });
  }

  return ok(vatId);
}

export function isValidVatId(input: string, countryCode?: string): boolean {
  return validateVatId(input, countryCode).ok;
}

export function hasVatIdPattern(countryCode: string): boolean {
  return VAT_ID_PATTERNS[countryCode] !== undefined;
}
