/**
 * Die Frist einer WebAuthn-Aufgabe (M9, FA-PASS-02).
 *
 * **Zwei Minuten.** Eine Zeremonie dauert Sekunden: Knopf drücken, Finger
 * auflegen, fertig. Was darüber liegt, ist kein Bedienkomfort, sondern ein
 * Zeitfenster, in dem eine abgefangene Aufgabe noch verwertbar wäre.
 *
 * Die Aufgabe ist zudem **einmal verwendbar** — sie wird beim Prüfen gelöscht,
 * gleich ob die Prüfung gelingt. Eine zweite Antwort auf dieselbe Aufgabe ist
 * ein Wiedereinspielversuch, und der findet nichts mehr vor.
 *
 * Rein und ohne Datenbank.
 */

/** Zwei Minuten. */
export const WEBAUTHN_CHALLENGE_TTL_MS = 2 * 60 * 1000;

export function webauthnChallengeExpiry(now: Date): Date {
  return new Date(now.getTime() + WEBAUTHN_CHALLENGE_TTL_MS);
}

/** Der Ablaufzeitpunkt selbst zählt als abgelaufen. */
export function isWebauthnChallengeExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * Ob der zurückgemeldete Zähler einen **Klon** verrät.
 *
 * Ein Authenticator zählt jede Signatur hoch. Kommt ein Wert zurück, der nicht
 * größer ist als der gespeicherte, gibt es den Schlüssel zweimal — jemand hat
 * ihn kopiert, und beide Kopien zählen unabhängig voneinander.
 *
 * **Die Ausnahme ist der Wert 0.** Manche Authenticator führen gar keinen
 * Zähler und melden immer 0; dort ist der Rückschritt kein Hinweis, sondern die
 * Bauart. Nur wer einmal gezählt hat, muss weiterzählen.
 */
export function indicatesClonedAuthenticator(stored: number, received: number): boolean {
  if (stored === 0 && received === 0) {
    return false;
  }
  return received <= stored;
}
