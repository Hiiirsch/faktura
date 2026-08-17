/**
 * Die Frist einer Einladung (M8, FA-MEMB-02).
 *
 * **Sieben Tage.** Eine Einladung reist außerhalb der Anwendung — die
 * Anwendung versendet keine E-Mail und darf keine (NFA-COMP-05), also gibt
 * jemand den Link weiter, per Mail, im Gespräch, auf Papier. Das braucht länger
 * als ein zweiter Anmeldefaktor und kürzer als ein Urlaub: Eine Woche deckt den
 * Fall „am Freitag eingeladen, am Montag angefangen" und lässt einen Link nicht
 * monatelang gültig in einem Postfach liegen.
 *
 * Die Frist ist **kürzer als die einer Passwortzurücksetzung nicht** — sie ist
 * länger, und das ist Absicht: Eine Zurücksetzung wird angefordert, während
 * jemand wartet. Eine Einladung wird ausgesprochen, bevor jemand da ist.
 *
 * Rein und ohne Datenbank, damit die Frist prüfbar bleibt, ohne eine Uhr zu
 * stellen.
 */

/** Sieben Tage. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_MS);
}

/**
 * Ob die Einladung abgelaufen ist.
 *
 * Der Ablaufzeitpunkt selbst zählt als abgelaufen: Bei einem Nachweis, der
 * Zugang schafft, entscheidet man die Grenzfrage gegen den Zugang — dieselbe
 * Regel wie in `pending-login-policy.ts`.
 */
export function isInvitationExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Wie viele volle Tage die Einladung noch gilt — für die Mitgliederliste. */
export function invitationDaysRemaining(expiresAt: Date, now: Date): number {
  const remaining = expiresAt.getTime() - now.getTime();
  return remaining <= 0 ? 0 : Math.floor(remaining / (24 * 60 * 60 * 1000));
}
