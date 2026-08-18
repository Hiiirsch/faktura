/**
 * Die Frist eines Einrichtungsnachweises für ein Betreiberkonto (M8, FA-ADM-06).
 *
 * **24 Stunden** — dieselbe Spanne wie bei der Passwortzurücksetzung, und aus
 * demselben Grund: Wer den Nachweis ausstellt, wartet darauf. Er entsteht auf
 * dem Server und wird von derselben Person eingelöst, die ihn erzeugt hat; ein
 * Link, der eine Woche überdauert, hat seinen Zweck längst erfüllt und liegt nur
 * noch herum.
 *
 * Das unterscheidet ihn von einer Einladung an ein Mitglied (sieben Tage): Die
 * wird ausgesprochen, **bevor** jemand da ist, und reist außerhalb der
 * Anwendung zu einem Menschen, der von nichts weiß.
 *
 * Rein und ohne Datenbank, damit die Frist prüfbar bleibt, ohne eine Uhr zu
 * stellen.
 */

/** 24 Stunden. */
export const ADMIN_SETUP_TTL_MS = 24 * 60 * 60 * 1000;

export function adminSetupExpiry(now: Date): Date {
  return new Date(now.getTime() + ADMIN_SETUP_TTL_MS);
}

/** Der Ablaufzeitpunkt selbst zählt als abgelaufen. */
export function isAdminSetupExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
