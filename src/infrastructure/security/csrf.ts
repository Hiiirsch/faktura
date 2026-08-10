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
 */
export const CSRF_HEADER_NAME = 'x-faktura-csrf';

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
