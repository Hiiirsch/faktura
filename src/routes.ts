/**
 * Zentrales Verzeichnis aller Routen der Anwendung.
 *
 * Zweck: Jede Route ist abzusichern, und NFA-SEC-01 verlangt einen Test, der
 * *alle* Routen automatisiert durchläuft. Ein solcher Test ist nur so
 * vollständig wie seine Routenliste. Deshalb pflegen wir sie hier zentral;
 * `tests/architecture/routes.test.ts` gleicht sie gegen das Dateisystem ab —
 * eine neue, hier nicht eingetragene Route lässt den Build scheitern.
 *
 * Die Middleware liest dieselbe Liste. Ein Pfad, der nicht darin steht, gilt
 * als geschützt: Vergessen führt zu einer Weiterleitung auf die Anmeldung,
 * nicht zu einer offenen Route.
 */

export const LOGIN_PATH = '/login';
export const DASHBOARD_PATH = '/';
export const SECURITY_SETTINGS_PATH = '/settings/security';

export type RouteKind = 'page' | 'api';

export type RouteAccess =
  /** Ohne Anmeldung erreichbar. Jeder Eintrag braucht eine Begründung. */
  | 'public'
  /** Erfordert eine gültige Sitzung. */
  | 'authenticated';

export type RouteDefinition = {
  readonly path: string;
  readonly kind: RouteKind;
  readonly access: RouteAccess;
  /** Begründung, warum die Route ohne Anmeldung erreichbar ist. */
  readonly publicReason?: string;
};

export const routes: readonly RouteDefinition[] = [
  {
    path: DASHBOARD_PATH,
    kind: 'page',
    access: 'authenticated',
  },
  {
    path: LOGIN_PATH,
    kind: 'page',
    access: 'public',
    publicReason: 'Die Anmeldeseite muss ohne Sitzung erreichbar sein.',
  },
  {
    path: SECURITY_SETTINGS_PATH,
    kind: 'page',
    access: 'authenticated',
  },
  {
    path: '/api/health',
    kind: 'api',
    access: 'public',
    publicReason:
      'Container- und Reverse-Proxy-Healthcheck. Antwortet ausschließlich mit betriebsbereit ja/nein, ohne Details.',
  },
];

export function findRoute(path: string): RouteDefinition | undefined {
  return routes.find((route) => route.path === path);
}

export function authenticatedRoutes(): readonly RouteDefinition[] {
  return routes.filter((route) => route.access === 'authenticated');
}

export function publicRoutes(): readonly RouteDefinition[] {
  return routes.filter((route) => route.access === 'public');
}

/**
 * Ob ein Pfad eine Sitzung erfordert. Unbekannte Pfade gelten als geschützt —
 * das sichere Verhalten, wenn jemand eine Route anlegt und den Eintrag hier
 * vergisst.
 */
export function pathRequiresAuthentication(pathname: string): boolean {
  return findRoute(pathname)?.access !== 'public';
}
