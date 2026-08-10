/**
 * IBAN-Prüfung nach ISO 13616 / ISO 7064 (FA-STAMM-04).
 *
 * Geprüft wird dreifach: Länderpräfix, die für dieses Land festgelegte Länge
 * und die Prüfsumme Modulo 97. Ein Zahlendreher fällt damit sofort auf, statt
 * erst bei der ersten unzustellbaren Überweisung.
 *
 * Die Modulo-Rechnung läuft über `bigint` — eine IBAN ergibt nach der
 * Umsetzung in Ziffern eine bis zu 36-stellige Zahl, weit jenseits dessen, was
 * `number` exakt darstellt.
 */
import { err, ok, type Result } from '../shared/result';

/** Länge der IBAN je Land, soweit im SEPA-Raum und Umfeld vergeben. */
const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IS: 26, IT: 27,
  JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21,
  MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15,
  PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SE: 24,
  SI: 19, SK: 24, SM: 27, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

export type IbanError =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'MALFORMED' }
  | { readonly kind: 'UNKNOWN_COUNTRY'; readonly countryCode: string }
  | { readonly kind: 'WRONG_LENGTH'; readonly expected: number; readonly actual: number }
  | { readonly kind: 'CHECKSUM_FAILED' };

/** Entfernt Leerzeichen und vereinheitlicht die Schreibweise. */
export function normalizeIban(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Setzt Buchstaben in Ziffern um: A = 10, B = 11 … Z = 35, wie in ISO 13616
 * für die Prüfsummenberechnung vorgeschrieben.
 */
function toNumericString(iban: string): string {
  let result = '';
  for (const character of iban) {
    const code = character.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      result += String(code - 55);
    } else {
      result += character;
    }
  }
  return result;
}

export function validateIban(input: string): Result<string, IbanError> {
  const iban = normalizeIban(input);

  if (iban.length === 0) {
    return err({ kind: 'EMPTY' });
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return err({ kind: 'MALFORMED' });
  }

  const countryCode = iban.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];
  if (expectedLength === undefined) {
    return err({ kind: 'UNKNOWN_COUNTRY', countryCode });
  }
  if (iban.length !== expectedLength) {
    return err({ kind: 'WRONG_LENGTH', expected: expectedLength, actual: iban.length });
  }

  // Die ersten vier Zeichen wandern ans Ende, dann Modulo 97 über die
  // Ziffernfolge. Ergebnis muss 1 sein.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  if (BigInt(toNumericString(rearranged)) % 97n !== 1n) {
    return err({ kind: 'CHECKSUM_FAILED' });
  }

  return ok(iban);
}

export function isValidIban(input: string): boolean {
  return validateIban(input).ok;
}

/** Gruppiert zu Viererblöcken für die Anzeige — reine Darstellung. */
export function formatIban(iban: string): string {
  return (normalizeIban(iban).match(/.{1,4}/g) ?? []).join(' ');
}

/**
 * BIC nach ISO 9362: acht oder elf Stellen. Eine Prüfsumme gibt es hier nicht,
 * nur ein festes Format.
 */
export function isValidBic(input: string): boolean {
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(input.replace(/\s/g, '').toUpperCase());
}
