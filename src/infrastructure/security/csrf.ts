/**
 * Namen und Herkunftsprüfung für den CSRF-Schutz (NFA-SEC-10, Spec §11.2).
 *
 * Diese Datei kommt bewusst ohne Importe aus: Sie wird von der Edge-Laufzeit
 * (proxy.ts), von Serverkomponenten *und* von Client-Komponenten gelesen. Jede
 * Abhängigkeit von `node:crypto` würde damit sowohl in die Edge-Laufzeit als
 * auch in das Browser-Bündel gezogen. Die Prüffunktion, die Kryptografie
 * braucht, steht deshalb in `csrf-verify.ts`.
 */

export const CSRF_COOKIE_NAME = 'faktura_csrf';
export const CSRF_FIELD_NAME = 'csrfToken';

/**
 * Kopfzeile, über die der Proxy den Token an die Serverkomponenten
 * weiterreicht. Beim allerersten Aufruf ist das Cookie noch nicht in der
 * Anfrage enthalten — ohne diesen Weg könnte das Formular kein gültiges Feld
 * rendern.
 *
 * **Sie läuft nur in diese eine Richtung.** Der Proxy `set`zt sie bei jeder
 * Anfrage, überschreibt also, was ein Aufrufer mitschickt. Als Nachweis taugt
 * sie deshalb nicht: Was hier ankommt, hat der Proxy selbst aus dem Cookie
 * gebildet, und ein Vergleich mit dem Cookie verglich das Cookie mit sich
 * selbst.
 */
export const CSRF_HEADER_NAME = 'x-faktura-csrf';

/**
 * Kopfzeile, in der ein **Aufrufer** den Token mitschickt (M9).
 *
 * Zwei Namen für zwei Richtungen, und das ist der Punkt: Die WebAuthn-Zeremonie
 * schickt JSON statt eines Formulars, der Token muss also in eine Kopfzeile.
 * Nähme sie `CSRF_HEADER_NAME`, käme er nie an — der Proxy hat den Wert vorher
 * ersetzt, und die Prüfung ginge unbemerkt immer durch.
 *
 * Aufgefallen ist das erst, als ein Test die Route ohne Kopfzeile aufrief und
 * eine Ablehnung erwartete. Über die Anwendungsschicht ist dieser Fehler
 * unsichtbar: Dort gibt es keinen Proxy.
 */
export const CSRF_REQUEST_HEADER_NAME = 'x-csrf-token';

/**
 * Vergleicht die Herkunft der Anfrage mit der konfigurierten Basis-URL.
 * `Origin` fehlt bei einfachen GET-Navigationen; bei schreibenden Aktionen
 * senden Browser sie immer, ein Fehlen ist dort also selbst ein Ablehngrund.
 */
export function isSameOrigin(originHeader: string | null, appUrl: string): boolean {
  if (originHeader === null || originHeader.length === 0) {
    return false;
  }
  try {
    return new URL(originHeader).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
