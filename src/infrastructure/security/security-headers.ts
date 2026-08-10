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

export type SecurityHeaderOptions = {
  readonly nonce: string;
  readonly isDevelopment: boolean;
};

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
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
  ].join('; ');
}

export function buildSecurityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildContentSecurityPolicy(options),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
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
