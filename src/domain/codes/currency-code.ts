/**
 * Währungscodes nach ISO 4217 (Spec §9.2).
 *
 * V1 rechnet in einer Währung je Rechnung; die Beschränkung auf die im
 * europäischen Geschäftsverkehr üblichen Codes hält die Auswahl im UI
 * überschaubar und ist bei Bedarf erweiterbar.
 */

export const CURRENCY_CODES = [
  'EUR',
  'CHF',
  'GBP',
  'USD',
  'DKK',
  'SEK',
  'NOK',
  'PLN',
  'CZK',
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const DEFAULT_CURRENCY_CODE: CurrencyCode = 'EUR';

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

/** Nachkommastellen der Währung — alle geführten Währungen haben zwei. */
export const CURRENCY_DECIMALS = 2;
