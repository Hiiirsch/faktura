/**
 * Regeln für die Zweifaktorauthentifizierung per TOTP (NFA-SEC-05, Spec §11.1).
 *
 * Die eigentliche Berechnung der Einmalkennwörter braucht Kryptografie und
 * liegt daher in der Infrastrukturschicht; hier stehen nur die Parameter und
 * die Normalisierung der Eingabe.
 */

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;

/**
 * Toleranz von einem Zeitfenster in jede Richtung. Deckt den üblichen
 * Uhrenversatz zwischen Telefon und Server ab, ohne das Zeitfenster für einen
 * Angreifer nennenswert zu vergrößern.
 */
export const TOTP_WINDOW = 1;

export const TOTP_ALGORITHM = 'SHA1';

/**
 * Entfernt Leerzeichen und Bindestriche. Authenticator-Apps zeigen den Code
 * gruppiert an („123 456"), und genau so tippen Benutzer ihn ab.
 */
export function normalizeTotpCode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

export function isWellFormedTotpCode(input: string): boolean {
  const normalized = normalizeTotpCode(input);
  return new RegExp(`^\\d{${String(TOTP_DIGITS)}}$`).test(normalized);
}
