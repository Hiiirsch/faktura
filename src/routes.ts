/**
 * Zentrales Verzeichnis aller Routen der Anwendung.
 *
 * Zweck: Ab M1 wird jede Route abgesichert, und NFA-SEC-01 verlangt einen Test,
 * der *alle* Routen automatisiert durchläuft. Ein solcher Test ist nur so
 * vollständig wie seine Routenliste. Deshalb pflegen wir sie hier zentral, und
 * `tests/architecture/routes.test.ts` gleicht sie gegen das Dateisystem ab —
 * eine neue, hier nicht eingetragene Route lässt den Test fehlschlagen.
 */

export type RouteKind = 'page' | 'api';

export type RouteAccess =
  /** Ohne Anmeldung erreichbar. Jeder Eintrag braucht eine Begründung. */
  | 'public'
  /** Erfordert eine gültige Sitzung (ab M1 durchgesetzt). */
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
    path: '/',
    kind: 'page',
    access: 'public',
    publicReason:
      'M0: Statusseite ohne fachliche Daten. Wird mit M1 auf "authenticated" umgestellt.',
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
