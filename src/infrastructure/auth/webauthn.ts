/**
 * Die Herkunft, an die ein Passkey gebunden ist (M9, FA-PASS-01).
 *
 * WebAuthn bindet jeden Schlüssel an zwei Angaben:
 *
 * - **`rpID`** — die Domain, für die er gilt. Sie steckt im Schlüssel selbst.
 * - **`origin`** — die vollständige Adresse, von der die Zeremonie ausging.
 *
 * Genau darin liegt die Phishing-Resistenz: Ein Authenticator gibt einer
 * falschen Domain nichts, und keine Eingabe des Benutzers kann das übersteuern.
 *
 * **Deshalb steht die Ableitung an genau einer Stelle.** Ein falsches `rpID` ist
 * ein stiller Totalausfall: Passkeys lassen sich anlegen, aber nie benutzen, und
 * der Fehler zeigt sich als wortlose Ablehnung im Browser. Zwei Stellen, die es
 * unterschiedlich ableiten, wären dieselbe Klasse Fehler wie zwei Stellen, die
 * „Umsatz" verschieden ausrechnen.
 *
 * **Ein Domainwechsel entwertet alle Passkeys.** Das lässt sich nicht abfangen —
 * die Bindung ist der Zweck. Benannt in README und in der Meldung beim
 * Registrieren.
 */
import { getEnv } from '@/infrastructure/config/env';

/**
 * Die Domain aus `APP_URL`.
 *
 * Ohne Anschluss (`:3000`) und ohne Schema: Das `rpID` ist ein reiner
 * Domainname. `localhost` ist erlaubt und gilt dem Browser auch über HTTP als
 * sicherer Kontext — auf jeder anderen Domain verlangt WebAuthn HTTPS.
 */
export function relyingPartyId(appUrl: string = getEnv().APP_URL): string {
  return new URL(appUrl).hostname;
}

/**
 * Die erwartete Herkunft — Schema, Domain und Anschluss, ohne Pfad.
 *
 * `new URL(...).origin` normalisiert dabei: Ein `APP_URL` mit abschließendem
 * Schrägstrich oder Pfad ergibt dieselbe Herkunft, die der Browser sendet.
 */
export function expectedOrigin(appUrl: string = getEnv().APP_URL): string {
  return new URL(appUrl).origin;
}

/**
 * Ob die Anwendung überhaupt in einem Kontext läuft, in dem Passkeys möglich
 * sind.
 *
 * Der Browser verweigert WebAuthn außerhalb eines sicheren Kontexts. `localhost`
 * gilt als sicher, jede andere Domain braucht HTTPS. Die Oberfläche fragt das
 * ab, um den Knopf nicht anzubieten, wo er nur eine wortlose Fehlermeldung
 * erzeugen könnte.
 */
export function isPasskeyCapableOrigin(appUrl: string = getEnv().APP_URL): boolean {
  const url = new URL(appUrl);
  return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

/**
 * Die Kennung, unter der ein Konto dem Authenticator bekannt ist.
 *
 * Sie wandert in den Passkey und kommt bei der Anmeldung zurück — daraus wird
 * das Konto aufgelöst, ohne dass jemand eine Adresse eintippen muss.
 *
 * **Nicht die E-Mail-Adresse**, obwohl sie eindeutig wäre: Der `userHandle`
 * liegt unverschlüsselt im Authenticator und wird bei jeder Anmeldung übertragen.
 * Die Kennung des Kontos sagt nichts über den Menschen dahinter; eine Adresse
 * schon.
 *
 * Das Präfix trennt die beiden Identitäten: Eine Mandantenkennung und eine
 * Betreiberkennung könnten theoretisch gleich lauten, und dann führte ein
 * Passkey in das falsche Konto.
 */
export function userHandleFor(kind: 'user' | 'admin', id: string): string {
  return `${kind}:${id}`;
}

export function parseUserHandle(
  handle: string,
): { readonly kind: 'user' | 'admin'; readonly id: string } | null {
  const separator = handle.indexOf(':');
  if (separator === -1) {
    return null;
  }

  const kind = handle.slice(0, separator);
  const id = handle.slice(separator + 1);

  if ((kind !== 'user' && kind !== 'admin') || id.length === 0) {
    return null;
  }

  return { kind, id };
}
