/**
 * Kundennummern (FA-KUND-02).
 *
 * Anders als der Belegnummernkreis ist dieser nicht konfigurierbar: Für
 * Kundennummern gibt es keine steuerliche Vorgabe, und ein zweites
 * einstellbares Format wäre Konfiguration ohne Nutzen.
 *
 * Der Zähler wächst über die Mindestbreite hinaus, statt umzubrechen — die
 * 10.000. Kundennummer lautet `K-10000`, nicht `K-0000`.
 */

export const CUSTOMER_NUMBER_SEQUENCE_SCOPE = 'CUSTOMER';
export const CUSTOMER_NUMBER_PREFIX = 'K-';
export const CUSTOMER_NUMBER_MIN_DIGITS = 4;

export function formatCustomerNumber(sequenceValue: number): string {
  if (!Number.isSafeInteger(sequenceValue) || sequenceValue < 1) {
    throw new RangeError(`Zählerstand muss eine positive Ganzzahl sein: ${String(sequenceValue)}`);
  }
  return `${CUSTOMER_NUMBER_PREFIX}${String(sequenceValue).padStart(CUSTOMER_NUMBER_MIN_DIGITS, '0')}`;
}

export function isCustomerNumber(value: string): boolean {
  return new RegExp(`^${CUSTOMER_NUMBER_PREFIX}\\d{${String(CUSTOMER_NUMBER_MIN_DIGITS)},}$`).test(
    value,
  );
}
