/**
 * Passwortrichtlinie (NFA-SEC-04, Spec §11.1).
 *
 * Die Prüfung gegen die Liste kompromittierter Passwörter erfolgt über eine
 * übergebene Funktion. So bleibt die Richtlinie eine reine Funktion, obwohl das
 * Laden der Liste Dateizugriff braucht — und sie ist ohne die 100.000 Einträge
 * testbar.
 *
 * Alle zutreffenden Verstöße werden zurückgegeben, nicht nur der erste: Ein zu
 * kurzes *und* kompromittiertes Passwort soll beides melden, statt den Benutzer
 * zwei Anläufe raten zu lassen.
 */

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Obergrenze gegen Erschöpfungsangriffe: Argon2id mit 64 MB Speicher auf ein
 * beliebig langes Eingabefeld anzuwenden wäre ein Angriffsvektor. Der Wert
 * liegt weit über jedem sinnvollen Passwort.
 */
export const MAX_PASSWORD_LENGTH = 1024;

export type PasswordViolation =
  | { readonly kind: 'TOO_SHORT'; readonly minLength: number }
  | { readonly kind: 'TOO_LONG'; readonly maxLength: number }
  | { readonly kind: 'COMPROMISED' };

/** Prüft, ob ein Passwort in einer Liste bekannter Leaks vorkommt. */
export type CompromisedPasswordLookup = (candidate: string) => boolean;

export function validatePassword(
  password: string,
  isCompromised: CompromisedPasswordLookup,
): readonly PasswordViolation[] {
  const violations: PasswordViolation[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    violations.push({ kind: 'TOO_SHORT', minLength: MIN_PASSWORD_LENGTH });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    violations.push({ kind: 'TOO_LONG', maxLength: MAX_PASSWORD_LENGTH });
  }
  if (isCompromised(password)) {
    violations.push({ kind: 'COMPROMISED' });
  }

  return violations;
}

export function isPasswordAcceptable(
  password: string,
  isCompromised: CompromisedPasswordLookup,
): boolean {
  return validatePassword(password, isCompromised).length === 0;
}
