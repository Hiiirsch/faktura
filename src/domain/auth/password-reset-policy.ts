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

/**
 * Der Mindestabstand zwischen zwei Anforderungen desselben Kontos (M14, B3).
 *
 * **Fünf Minuten**, und der Grund ist nicht die Last, sondern der Empfänger:
 * Ohne diese Bremse wäre das Formular „Passwort vergessen" ein Versandknopf für
 * jeden, der eine fremde Adresse kennt — und die Nachrichten bekäme nicht der
 * Absender, sondern der Inhaber des Postfachs.
 *
 * Nicht länger, weil jemand davorsitzt und wartet: Wer die erste Mail im Spam
 * findet und es erneut versucht, soll nicht eine Viertelstunde ausgesperrt sein.
 */
export const RESET_REQUEST_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Ob der jüngste Nachweis noch zu frisch für einen zweiten ist.
 *
 * **Gerechnet wird über `expiresAt`, nicht über `createdAt`.** Der erste Anlauf
 * verglich den Zeitpunkt des Aufrufers mit dem, den die **Datenbank** beim
 * Einfügen setzt (`@default(now())`). In der Anwendung fällt das nie auf, weil
 * beide Uhren dieselbe sind — im Test, der einen festen Zeitpunkt übergibt,
 * lagen Monate dazwischen, und die Bremse griff für immer.
 *
 * `expiresAt` setzen wir selbst aus demselben `now`. Damit rechnet diese
 * Funktion ausschließlich mit Werten, die aus einer Uhr stammen — und sie ist
 * rein und ohne Datenbank prüfbar.
 */
export function isTooSoonForAnotherReset(expiresAt: Date, now: Date): boolean {
  const ausgestelltVor = PASSWORD_RESET_TTL_MS - (expiresAt.getTime() - now.getTime());
  return ausgestelltVor < RESET_REQUEST_INTERVAL_MS;
}

/** Der Ablaufzeitpunkt selbst zählt als abgelaufen. */
export function isPasswordResetExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
