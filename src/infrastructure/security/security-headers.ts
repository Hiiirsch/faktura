/**
 * Sicherheits-Header (NFA-SEC-17, Spec §11.2).
 *
 * Zur Content Security Policy und der Vorgabe „kein `unsafe-inline` im
 * App-Kontext": Für `script-src` wird sie eingehalten — dort liegt der Schutz,
 * der zählt. Skripte laufen ausschließlich mit dem pro Anfrage erzeugten Nonce.
 *
 * Für `style-src` ist `'unsafe-inline'` gesetzt. Grund: React und die ab M2
 * vorgesehenen Komponenten (Combobox, Dialog) setzen Positionierung über
 * `style`-Attribute am Element. Ein Nonce greift bei Attributen nicht, nur bei
 * `<style>`-Blöcken — eine strikte `style-src` würde die Oberfläche
 * unbrauchbar machen, ohne nennenswerten Sicherheitsgewinn: Ein Angreifer, der
 * Style-Attribute einschleusen kann, hat bereits eine Injektionslücke.
 */

/**
 * Wofür die Kopfzeilen gelten.
 *
 * `app` ist die Oberfläche. `document` sind Antworten, die **fremden Inhalt**
 * ausliefern — die Belegvorschau aus einer hochgeladenen Vorlage und
 * hochgeladene Dateien. Für sie gilt eine engere Richtlinie: kein Skript, kein
 * Netz, nur eingebettete Daten.
 *
 * Der Unterschied, der beim Bauen der Vorschau aufgefallen ist: Das
 * App-Profil setzt `frame-ancestors 'none'` und `X-Frame-Options: DENY`. Damit
 * lässt sich die Vorschau **auch aus der eigenen Oberfläche heraus** nicht in
 * einen Rahmen laden — der Rahmen bliebe leer. Das Dokumentprofil erlaubt
 * deshalb `'self'`.
 */
export type SecurityProfile = 'app' | 'document';

export type SecurityHeaderOptions = {
  readonly nonce: string;
  readonly isDevelopment: boolean;
  readonly profile?: SecurityProfile;
};

/**
 * Richtlinie für ausgelieferten Fremdinhalt.
 *
 * `sandbox` ohne Werte entzieht dem Dokument alles: kein Skript, keine
 * Formulare, kein eigener Ursprung. Schrift und Bilder kommen ausschließlich
 * als `data:`-URI mit dem Dokument — genau so, wie der Renderer sie einbettet.
 */
function documentContentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "form-action 'none'",
    // Einbettbar aus der eigenen Oberfläche, nirgendwo sonst.
    "frame-ancestors 'self'",
    'sandbox',
  ].join('; ');
}

function buildContentSecurityPolicy({ nonce, isDevelopment }: SecurityHeaderOptions): string {
  // Der Entwicklungsserver von Next.js wertet Code für das Neuladen im Browser
  // zur Laufzeit aus und verbindet sich per WebSocket. Beides gilt nur hier.
  const scriptSrc = isDevelopment
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const connectSrc = isDevelopment ? "'self' ws: wss:" : "'self'";

  return [
    "default-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "form-action 'self'",
    // Die Belegvorschau wird als `<iframe>` derselben Herkunft eingebettet.
    // Ohne diese Angabe fällt `frame-src` auf `default-src 'none'` zurück, und
    // der Browser lädt den Rahmen gar nicht erst — sichtbar als weiße Fläche.
    // Die Gegenrichtung regelt `frame-ancestors` im Dokumentprofil; nötig sind
    // **beide**, die des Einbettenden und die des Eingebetteten.
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
  ].join('; ');
}

export function buildSecurityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const isDocument = options.profile === 'document';

  const headers: Record<string, string> = {
    'Content-Security-Policy': isDocument
      ? documentContentSecurityPolicy()
      : buildContentSecurityPolicy(options),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': isDocument ? 'SAMEORIGIN' : 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };

  if (!options.isDevelopment) {
    // Zwei Jahre, inklusive Subdomains, für die Preload-Liste vorbereitet.
    // Über HTTP ignorieren Browser den Header, im Entwicklungsbetrieb bliebe er
    // aber im Browser hängen und erzwänge dort dauerhaft HTTPS.
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  }

  return headers;
}
