/**
 * Der Zwischenzustand zwischen Passwort und zweitem Faktor (NFA-SEC-05).
 *
 * Wird die Anmeldung auf zwei Seiten geteilt, entsteht ein Zustand, den es in
 * der einstufigen Fassung nicht gab: „Das Passwort stimmte, der zweite Faktor
 * fehlt noch." Er ist der empfindlichste Punkt des ganzen Vorgangs — wer ihn
 * erlangt, hat die erste Hürde bereits hinter sich.
 *
 * Zwei Regeln halten ihn klein:
 *
 * - **Er läuft schnell ab.** Fünf Minuten genügen, um das Telefon aus der
 *   Tasche zu holen; alles darüber ist ein Zeitfenster, das niemand braucht.
 *   Eine Sitzung dauert Stunden — dieser Nachweis darf das nicht.
 * - **Er verleiht kein Recht.** Er beweist nur, dass ein Passwort stimmte. Was
 *   damit erlaubt ist, steht in genau einer Handlung: den zweiten Faktor
 *   nachzureichen.
 *
 * Rein und ohne Datenbank, damit die Frist prüfbar bleibt, ohne eine Uhr zu
 * stellen.
 */

/** Fünf Minuten. */
export const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000;

export function pendingLoginExpiry(now: Date): Date {
  return new Date(now.getTime() + PENDING_LOGIN_TTL_MS);
}

/**
 * Ob der Nachweis noch gilt.
 *
 * Der Ablaufzeitpunkt selbst zählt als abgelaufen: Bei einem Zustand, der
 * Zugang vorbereitet, entscheidet man die Grenzfrage gegen den Zugang.
 */
export function isPendingLoginExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
