/**
 * Zentrales Verzeichnis aller Routen der Anwendung.
 *
 * Zweck: Jede Route ist abzusichern, und NFA-SEC-01 verlangt einen Test, der
 * *alle* Routen automatisiert durchläuft. Ein solcher Test ist nur so
 * vollständig wie seine Routenliste. Deshalb pflegen wir sie hier zentral;
 * `tests/architecture/routes.test.ts` gleicht sie gegen das Dateisystem ab —
 * eine neue, hier nicht eingetragene Route lässt den Build scheitern.
 *
 * Der Proxy liest dieselbe Liste. Ein Pfad, der nicht darin steht, gilt als
 * geschützt: Vergessen führt zu einer Weiterleitung auf die Anmeldung, nicht
 * zu einer offenen Route.
 */

export const LOGIN_PATH = '/login';
export const DASHBOARD_PATH = '/';
export const SECURITY_SETTINGS_PATH = '/settings/security';
export const COMPANY_SETTINGS_PATH = '/settings/company';
export const CUSTOMERS_PATH = '/customers';
export const NEW_CUSTOMER_PATH = '/customers/new';
export const CATALOG_PATH = '/catalog';

export function customerPath(id: string): string {
  return `${CUSTOMERS_PATH}/${id}`;
}

export function assetPath(id: string): string {
  return `/api/assets/${id}`;
}

export type RouteKind = 'page' | 'api';

export type RouteAccess =
  /** Ohne Anmeldung erreichbar. Jeder Eintrag braucht eine Begründung. */
  | 'public'
  /** Erfordert eine gültige Sitzung. */
  | 'authenticated';

export type RouteDefinition = {
  /** Pfadmuster wie im Dateisystem, dynamische Segmente in eckigen Klammern. */
  readonly path: string;
  readonly kind: RouteKind;
  readonly access: RouteAccess;
  /** Begründung, warum die Route ohne Anmeldung erreichbar ist. */
  readonly publicReason?: string;
  /**
   * Konkreter Pfad für den Zugriffsschutz-Test. Nur bei dynamischen Routen
   * nötig — `/customers/[id]` lässt sich nicht wörtlich aufrufen.
   */
  readonly probePath?: string;
};

export const routes: readonly RouteDefinition[] = [
  { path: DASHBOARD_PATH, kind: 'page', access: 'authenticated' },
  {
    path: LOGIN_PATH,
    kind: 'page',
    access: 'public',
    publicReason: 'Die Anmeldeseite muss ohne Sitzung erreichbar sein.',
  },
  { path: SECURITY_SETTINGS_PATH, kind: 'page', access: 'authenticated' },
  { path: COMPANY_SETTINGS_PATH, kind: 'page', access: 'authenticated' },
  { path: CUSTOMERS_PATH, kind: 'page', access: 'authenticated' },
  { path: NEW_CUSTOMER_PATH, kind: 'page', access: 'authenticated' },
  {
    path: '/customers/[id]',
    kind: 'page',
    access: 'authenticated',
    probePath: '/customers/probe-kennung',
  },
  { path: CATALOG_PATH, kind: 'page', access: 'authenticated' },
  {
    path: '/api/assets/[id]',
    kind: 'api',
    access: 'authenticated',
    probePath: '/api/assets/probe-kennung',
  },
  {
    path: '/api/health',
    kind: 'api',
    access: 'public',
    publicReason:
      'Container- und Reverse-Proxy-Healthcheck. Antwortet ausschließlich mit betriebsbereit ja/nein, ohne Details.',
  },
];

/** Der Pfad, unter dem eine Route tatsächlich aufgerufen werden kann. */
export function probePathFor(route: RouteDefinition): string {
  return route.probePath ?? route.path;
}

export function findRoute(path: string): RouteDefinition | undefined {
  return routes.find((route) => route.path === path);
}

export function authenticatedRoutes(): readonly RouteDefinition[] {
  return routes.filter((route) => route.access === 'authenticated');
}

export function publicRoutes(): readonly RouteDefinition[] {
  return routes.filter((route) => route.access === 'public');
}

/** Wandelt `/customers/[id]` in einen Ausdruck, der `/customers/abc` erfasst. */
function toPathMatcher(pattern: string): RegExp {
  const source = pattern
    .split('/')
    .map((segment) =>
      segment.startsWith('[') && segment.endsWith(']') ? '[^/]+' : escapeRegExp(segment),
    )
    .join('/');
  return new RegExp(`^${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ob ein Pfad eine Sitzung erfordert. Unbekannte Pfade gelten als geschützt —
 * das sichere Verhalten, wenn jemand eine Route anlegt und den Eintrag hier
 * vergisst.
 */
export function pathRequiresAuthentication(pathname: string): boolean {
  const match = routes.find((route) => toPathMatcher(route.path).test(pathname));
  return match?.access !== 'public';
}
