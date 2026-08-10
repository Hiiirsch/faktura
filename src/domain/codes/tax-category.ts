/**
 * Steuerkategorien als Codes nach UNTDID 5305 (Spec §9.2, NFA-ARCH-05).
 *
 * Die Zuordnung eines Geschäftsvorfalls zu einer Kategorie ist Gegenstand von
 * M3; hier stehen nur die zulässigen Codes und die Frage, ob eine Kategorie
 * überhaupt einen Steuersatz größer null tragen darf.
 */

export const TAX_CATEGORY_CODES = [
  'S',  // Regelsatz
  'AE', // Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)
  'E',  // steuerbefreit, u. a. Kleinunternehmer nach §19 UStG
  'G',  // Ausfuhrlieferung Drittland
  'K',  // innergemeinschaftliche Lieferung
  'Z',  // Nullsatz
] as const;

export type TaxCategoryCode = (typeof TAX_CATEGORY_CODES)[number];

export const DEFAULT_TAX_CATEGORY: TaxCategoryCode = 'S';

/**
 * Kategorien, die zwingend mit Steuersatz null geführt werden. Bei allen
 * übrigen ist ein Satz größer null zulässig, aber nicht vorgeschrieben.
 */
const ZERO_RATE_CATEGORIES: ReadonlySet<TaxCategoryCode> = new Set(['AE', 'E', 'G', 'K', 'Z']);

export function isTaxCategoryCode(value: string): value is TaxCategoryCode {
  return (TAX_CATEGORY_CODES as readonly string[]).includes(value);
}

export function requiresZeroRate(category: TaxCategoryCode): boolean {
  return ZERO_RATE_CATEGORIES.has(category);
}
