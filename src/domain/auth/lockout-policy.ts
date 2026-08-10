/**
 * Sperre nach fehlgeschlagenen Anmeldeversuchen (NFA-SEC-08, Spec §11.1).
 *
 * Reine Funktionen über dem Zählerstand — die Persistenz entscheidet nicht über
 * die Regel, sondern führt sie nur aus. „Jetzt" wird immer übergeben, nie
 * gelesen: sonst wäre das Verhalten an der Grenze nicht testbar.
 */

export const MAX_FAILED_LOGINS = 10;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export type LockoutState = {
  readonly failedLogins: number;
  readonly lockedUntil: Date | null;
};

export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** Verbleibende Sperrdauer in Millisekunden; 0, wenn nicht gesperrt. */
export function remainingLockoutMs(state: LockoutState, now: Date): number {
  if (state.lockedUntil === null) {
    return 0;
  }
  return Math.max(0, state.lockedUntil.getTime() - now.getTime());
}

/**
 * Verbucht einen Fehlversuch. Ab dem zehnten Versuch wird gesperrt; der Zähler
 * beginnt danach von vorn, damit nach Ablauf der Sperre nicht jeder weitere
 * Fehlversuch sofort erneut sperrt.
 */
export function registerFailedAttempt(state: LockoutState, now: Date): LockoutState {
  const failedLogins = state.failedLogins + 1;

  if (failedLogins >= MAX_FAILED_LOGINS) {
    return {
      failedLogins: 0,
      lockedUntil: new Date(now.getTime() + LOCKOUT_DURATION_MS),
    };
  }

  return { failedLogins, lockedUntil: state.lockedUntil };
}

/** Setzt den Zähler nach erfolgreicher Anmeldung zurück. */
export function clearFailedAttempts(): LockoutState {
  return { failedLogins: 0, lockedUntil: null };
}
