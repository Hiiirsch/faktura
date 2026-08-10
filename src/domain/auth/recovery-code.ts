/**
 * Wiederherstellungscodes für den Verlust des TOTP-Geräts (NFA-SEC-05).
 *
 * Ohne sie sperrt ein verlorenes Telefon den einzigen Benutzer dauerhaft aus
 * seiner eigenen Buchhaltung aus. Die Erzeugung braucht Zufall und liegt in der
 * Infrastrukturschicht; hier stehen Format und Normalisierung.
 */

export const RECOVERY_CODE_COUNT = 10;

/** Vier Gruppen zu vier Zeichen, z. B. `4F7K-2M9Q-XB3T-8HR5`. */
export const RECOVERY_CODE_GROUPS = 4;
export const RECOVERY_CODE_GROUP_LENGTH = 4;

/**
 * Alphabet ohne die Zeichen, die sich beim Abtippen verwechseln lassen:
 * kein I/1, kein O/0, kein U (Verwechslung mit V in manchen Schriften).
 */
export const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTVWXYZ23456789';

export function formatRecoveryCode(raw: string): string {
  const groups: string[] = [];
  for (let index = 0; index < raw.length; index += RECOVERY_CODE_GROUP_LENGTH) {
    groups.push(raw.slice(index, index + RECOVERY_CODE_GROUP_LENGTH));
  }
  return groups.join('-');
}

/** Macht die Eingabe unabhängig von Schreibweise, Leerzeichen und Bindestrichen. */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function isWellFormedRecoveryCode(input: string): boolean {
  const normalized = normalizeRecoveryCode(input);
  const expectedLength = RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_LENGTH;
  if (normalized.length !== expectedLength) {
    return false;
  }
  return [...normalized].every((character) => RECOVERY_CODE_ALPHABET.includes(character));
}
