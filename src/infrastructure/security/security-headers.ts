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
 * - `app` ist die Oberfläche.
 * - `document` sind Antworten, die **fremdes Markup** ausliefern: hochgeladene
 *   Dateien und die Fehlerseite der Vorlagenvorschau. Für sie gilt eine enge
 *   Richtlinie — kein Skript, kein Netz, nur eingebettete Daten.
 * - `pdf` sind erzeugte Belege. Sie sind kein Markup, sondern eine Binärdatei,
 *   die der eingebaute Betrachter des Browsers darstellt.
 *
 * Der Unterschied, der beim Bauen der Vorschau aufgefallen ist: Das App-Profil
 * setzt `frame-ancestors 'none'` und `X-Frame-Options: DENY`. Damit lässt sich
 * eine Antwort **auch aus der eigenen Oberfläche heraus** nicht in einen Rahmen
 * laden — er bliebe leer. Beide anderen Profile erlauben deshalb `'self'`.
 */
export type SecurityProfile = 'app' | 'document' | 'pdf';

export type SecurityHeaderOptions = {
  readonly nonce: string;
  readonly isDevelopment: boolean;
  readonly profile?: SecurityProfile;
};

/**
 * Richtlinie für ausgeliefertes Fremdmarkup.
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

/**
 * Richtlinie für erzeugte PDF-Dateien.
 *
 * Bewusst **nur** `frame-ancestors`. Zwei Gründe:
 *
 * 1. Die übrigen Direktiven greifen an einer Binärdatei ins Leere — ein PDF hat
 *    keine Skripte, keine Stile und keine Unterressourcen im Sinne der CSP.
 * 2. `sandbox` würde den eingebauten Betrachter des Browsers ausschalten. Er
 *    ist eine eigene, vom Browser gekapselte Anwendung; unter `sandbox` startet
 *    er nicht, und im Rahmen erschiene wieder eine weiße Fläche.
 *
 * Die Datei selbst ist unser Erzeugnis, kein hochgeladener Fremdinhalt: Sie
 * entsteht aus dem Dokumentmodell in einem Chromium ohne Netzzugriff.
 */
function pdfContentSecurityPolicy(): string {
  return "frame-ancestors 'self'";
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
    /*
     * Der Worker der Belegvorschau (M12).
     *
     * Ohne diese Angabe fällt der Browser über `child-src` auf `script-src`
     * zurück — und dort steht `strict-dynamic`, das eine Adresse nicht gelten
     * lässt. Der Worker startete wortlos nicht, und die Vorschau bliebe leer.
     * `blob:` steht dabei, weil ein gebündelter Worker je nach Ausspielung als
     * Blob geladen wird; die Quelle ist in beiden Fällen unser eigenes Bündel.
     */
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
  ].join('; ');
}

function contentSecurityPolicyFor(options: SecurityHeaderOptions): string {
  switch (options.profile) {
    case 'document':
      return documentContentSecurityPolicy();
    case 'pdf':
      return pdfContentSecurityPolicy();
    default:
      return buildContentSecurityPolicy(options);
  }
}

export function buildSecurityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const isEmbeddable = options.profile === 'document' || options.profile === 'pdf';

  const headers: Record<string, string> = {
    'Content-Security-Policy': contentSecurityPolicyFor(options),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': isEmbeddable ? 'SAMEORIGIN' : 'DENY',
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
