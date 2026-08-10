/**
 * Zahlungsziel (FA-KUND-05, FA-RECH-08).
 *
 * Das kundenspezifische Ziel überschreibt den globalen Standard. `null` und
 * `0` sind dabei verschiedene Aussagen: `null` heißt „kein eigenes Ziel
 * hinterlegt", `0` heißt „zahlbar sofort".
 */

export const MIN_PAYMENT_TERMS_DAYS = 0;
export const MAX_PAYMENT_TERMS_DAYS = 365;

export function resolvePaymentTerms(
  customerTerms: number | null,
  companyDefault: number,
): number {
  return customerTerms ?? companyDefault;
}

export function isValidPaymentTerms(days: number): boolean {
  return (
    Number.isSafeInteger(days) && days >= MIN_PAYMENT_TERMS_DAYS && days <= MAX_PAYMENT_TERMS_DAYS
  );
}
