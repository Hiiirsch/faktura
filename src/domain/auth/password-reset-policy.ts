/**
 * Die Frist einer Passwortzurücksetzung (M8, FA-MEMB-04).
 *
 * **24 Stunden.** Kürzer als eine Einladung, weil der Anlass ein anderer ist:
 * Eine Zurücksetzung wird ausgelöst, während jemand vor einem gesperrten Konto
 * sitzt und wartet. Ein Nachweis, der einen Tag überdauert, hat seinen Zweck
 * längst erfüllt und liegt nur noch herum.
 *
 * Was der Nachweis **nicht** ist: ein neues Passwort. Die Rechteverwaltung löst
 * ihn aus und gibt ihn weiter; gesetzt wird das Passwort von dem, der es danach
 * kennt — und das ist genau eine Person. Ein Verfahren, in dem die Verwaltung
 * ein Passwort vergibt, hätte immer zwei Wissende, und der erste Wechsel danach
 * wäre freiwillig.
 *
 * Rein und ohne Datenbank.
 */

/** 24 Stunden. */
export const PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;

export function passwordResetExpiry(now: Date): Date {
  return new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
}

/** Der Ablaufzeitpunkt selbst zählt als abgelaufen. */
export function isPasswordResetExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
