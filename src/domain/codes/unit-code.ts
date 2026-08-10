/**
 * Mengeneinheiten als Codes nach UN/ECE Recommendation 20 (Spec §9.2,
 * NFA-ARCH-04). Gespeichert wird ausschließlich der Code; die deutschen Labels
 * liegen in der Anzeigeschicht (src/i18n/de.ts).
 */

export const UNIT_CODES = [
  'C62', // Stück
  'HUR', // Stunde
  'DAY', // Tag
  'MON', // Monat
  'KGM', // Kilogramm
  'MTR', // Meter
  'MTK', // Quadratmeter
  'LTR', // Liter
  'E48', // Leistungseinheit
] as const;

export type UnitCode = (typeof UNIT_CODES)[number];

export const DEFAULT_UNIT_CODE: UnitCode = 'C62';

export function isUnitCode(value: string): value is UnitCode {
  return (UNIT_CODES as readonly string[]).includes(value);
}
