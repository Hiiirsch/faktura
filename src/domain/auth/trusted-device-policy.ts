/**
 * Die Frist eines vertrauten Geräts (M9, FA-TRUST-02).
 *
 * **30 Tage.** Lang genug, dass der Zweck eintritt — wer täglich arbeitet, gibt
 * den Code einmal im Monat ein statt jeden Morgen. Kurz genug, dass ein
 * abhandengekommenes Gerät nicht unbegrenzt weiterläuft.
 *
 * **Was hier abgewogen wird.** Ein vertrautes Gerät schwächt die
 * Zweifaktorauthentifizierung bewusst: Wer Passwort **und** Gerät hat, kommt
 * ohne Code hinein. Das ist der Sinn der Sache, und es ist vertretbar, weil das
 * Gerät ein Besitzfaktor ist — aber nur, solange vier Dinge gelten:
 *
 * 1. Der Nachweis ist an **ein Konto** gebunden, nicht nur an einen Token.
 * 2. Er ist einzeln widerrufbar und sichtbar (`/settings/security`).
 * 3. Er endet mit jedem Ereignis, das den Verdacht auf Verlust begründet:
 *    Passwortzurücksetzung, Abschalten des zweiten Faktors, Sperren des Kontos,
 *    „alle anderen Sitzungen beenden".
 * 4. Er gilt **nicht** für Betreiberkonten.
 *
 * Rein und ohne Datenbank, damit die Frist prüfbar bleibt, ohne eine Uhr zu
 * stellen.
 */

/** 30 Tage. */
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function trustedDeviceExpiry(now: Date): Date {
  return new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS);
}

/**
 * Ob der Nachweis abgelaufen ist.
 *
 * Der Ablaufzeitpunkt selbst zählt als abgelaufen — dieselbe Regel wie bei jedem
 * anderen Nachweis: Bei etwas, das Zugang schafft, entscheidet man die
 * Grenzfrage gegen den Zugang.
 */
export function isTrustedDeviceExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
