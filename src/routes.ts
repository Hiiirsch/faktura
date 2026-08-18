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
export const ADMIN_PATH = '/admin';
export const ADMIN_LOGIN_PATH = '/admin/login';
export const ADMIN_LOGIN_CODE_PATH = '/admin/login/code';
/** Unternehmensverwaltung des Betreibers (M8, B5). */
export const ADMIN_NEW_ORGANIZATION_PATH = '/admin/organizations/new';

export function adminOrganizationPath(id: string): string {
  return `/admin/organizations/${id}`;
}
/** Zweiter Anmeldeschritt — erscheint nur, wenn das Konto einen zweiten Faktor führt. */
export const LOGIN_CODE_PATH = '/login/code';
export const DASHBOARD_PATH = '/';
export const SECURITY_SETTINGS_PATH = '/settings/security';
export const EXPORT_SETTINGS_PATH = '/settings/export';
/** Die Sicherung liegt im Adminbereich (M8, NFA-SEC-23). */
export const BACKUP_DOWNLOAD_PATH = '/admin/api/backup';
export const DATA_EXPORT_PATH = '/api/export';
export const COMPANY_SETTINGS_PATH = '/settings/company';
export const CUSTOMERS_PATH = '/customers';
export const NEW_CUSTOMER_PATH = '/customers/new';
export const CATALOG_PATH = '/catalog';
export const NUMBERING_SETTINGS_PATH = '/settings/numbering';
export const INVOICES_PATH = '/invoices';
export const NEW_INVOICE_PATH = '/invoices/new';
export const TEMPLATE_SETTINGS_PATH = '/settings/templates';
/** Mitglieder und Rollen des eigenen Unternehmens (M8). */
export const MEMBERS_SETTINGS_PATH = '/settings/members';
export const ROLES_SETTINGS_PATH = '/settings/roles';

/**
 * Die beiden Einlöseseiten (M8).
 *
 * Englisch wie jede andere Route dieser Anwendung, obwohl die Oberfläche
 * deutsch ist: Ein Pfad ist ein Bezeichner (CLAUDE.md).
 *
 * Das Segment ist der **Token selbst**, keine Kennung. Eine Kennung neben einem
 * Token wäre eine zweite Angabe ohne zweiten Nutzen — der Token ist schon
 * eindeutig, und die Zeile in der Datenbank findet man über seinen Hash.
 */
export const INVITATION_PATH = '/invitations';
export const PASSWORD_RESET_PATH = '/password-reset';

export function invitationPath(token: string): string {
  return `${INVITATION_PATH}/${encodeURIComponent(token)}`;
}

export function passwordResetPath(token: string): string {
  return `${PASSWORD_RESET_PATH}/${encodeURIComponent(token)}`;
}

export function invoicePath(id: string): string {
  return `${INVOICES_PATH}/${id}`;
}

export function customerPath(id: string): string {
  return `${CUSTOMERS_PATH}/${id}`;
}

export function templatePath(id: string): string {
  return `${TEMPLATE_SETTINGS_PATH}/${id}`;
}

export function assetPath(id: string): string {
  return `/api/assets/${id}`;
}

/** Download des erzeugten PDF (FA-PDF-01). */
export function invoicePdfPath(id: string): string {
  return `/api/invoices/${id}/pdf`;
}

/**
 * Dasselbe PDF zum Einbetten statt zum Herunterladen (FA-PDF-02).
 *
 * `inline=1` steuert die `Content-Disposition`; die Angaben hinter dem
 * Rautezeichen liest der eingebaute Betrachter des Browsers und blendet damit
 * seine Werkzeugleiste aus. Sie erreichen den Server nie.
 */
export function invoicePdfEmbedPath(id: string): string {
  return `${invoicePdfPath(id)}?inline=1#toolbar=0&navpanes=0&view=FitH`;
}

/** Vorschau einer noch nicht gespeicherten Vorlage (FA-TPL-04). */
export const TEMPLATE_PREVIEW_PATH = '/api/templates/preview';

export type RouteKind = 'page' | 'api';

/**
 * Welches Sicherheitsprofil der Proxy auf die Antwort legt.
 *
 * Voreinstellung ist `app`. `document` steht an den Routen, die fremden Inhalt
 * ausliefern: Belegvorschau und hochgeladene Dateien. Der Proxy setzt die
 * Kopfzeilen **nach** dem Routenhandler und überschreibt dabei, was dieser
 * gesetzt hat — deshalb steht die Entscheidung hier und nicht in der Route.
 */
export type RouteSecurityProfile = 'app' | 'document' | 'pdf';

export type RouteAccess =
  /** Ohne Anmeldung erreichbar. Jeder Eintrag braucht eine Begründung. */
  | 'public'
  /** Erfordert eine gültige Sitzung eines Mandantenkontos. */
  | 'authenticated'
  /**
   * Erfordert eine Sitzung der zentralen Verwaltung (M8).
   *
   * **Eine gültige Mandantensitzung genügt hier nicht** — das ist der Kern der
   * Trennung und der Fall, den ein späterer Umbau am ehesten still kaputtmacht.
   * Der Zugriffsschutztest prüft deshalb jede solche Route mit drei Anfragen:
   * ohne Cookie, mit Mandantencookie, mit Admincookie.
   */
  | 'platformAdmin';

export type RouteDefinition = {
  /** Pfadmuster wie im Dateisystem, dynamische Segmente in eckigen Klammern. */
  readonly path: string;
  readonly kind: RouteKind;
  readonly access: RouteAccess;
  /** Begründung, warum die Route ohne Anmeldung erreichbar ist. */
  readonly publicReason?: string;
  /**
   * Öffentlich, aber nicht offen.
   *
   * Die Route braucht **keine Sitzung** und trotzdem einen Nachweis: Der
   * zweite Anmeldeschritt liegt vor der Sitzung und verlangt den kurzlebigen
   * Nachweis aus dem ersten. Ohne ihn zeigt er nichts, sondern leitet an den
   * Anfang zurück. Der Zugriffsschutztest prüft für solche Routen genau das —
   * eine `200`-Antwort ohne Nachweis wäre der Fehler.
   */
  readonly requiresPendingLogin?: boolean;
  /**
   * Öffentlich, und der Nachweis steht in der Adresse (M8).
   *
   * Einladung und Passwortzurücksetzung liegen vor der Sitzung — es gibt noch
   * kein Konto oder keinen Zugang zu ihm. Geschützt sind sie durch einen Token
   * mit 256 Bit Entropie, dessen Hash in der Datenbank liegt.
   *
   * Anders als beim zweiten Anmeldeschritt leitet die Seite **nicht** zurück,
   * sondern antwortet mit `200` und einer neutralen Ablehnung: Eine Umleitung
   * auf die Anmeldung wäre für den Empfänger eines abgelaufenen Links nicht zu
   * unterscheiden von „falsche Adresse". Der Zugriffsschutztest prüft deshalb
   * beides — Status `200` **und** dass nichts über das Unternehmen darin steht.
   */
  readonly requiresRedemptionToken?: boolean;
  /**
   * Konkreter Pfad für den Zugriffsschutz-Test. Nur bei dynamischen Routen
   * nötig — `/customers/[id]` lässt sich nicht wörtlich aufrufen.
   */
  readonly probePath?: string;
  readonly securityProfile?: RouteSecurityProfile;
};

export const routes: readonly RouteDefinition[] = [
  { path: DASHBOARD_PATH, kind: 'page', access: 'authenticated' },
  {
    path: LOGIN_PATH,
    kind: 'page',
    access: 'public',
    publicReason: 'Die Anmeldeseite muss ohne Sitzung erreichbar sein.',
  },
  {
    path: LOGIN_CODE_PATH,
    kind: 'page',
    access: 'public',
    requiresPendingLogin: true,
    publicReason:
      'Der zweite Anmeldeschritt liegt vor der Sitzung. Geschützt ist er nicht ' +
      'durch eine Sitzung, sondern durch den kurzlebigen Nachweis aus dem ersten ' +
      'Schritt: Ohne ihn zeigt die Seite nichts und leitet zurück.',
  },
  // ── Zentrale Verwaltung (M8) ──────────────────────────────────────────────
  { path: ADMIN_PATH, kind: 'page', access: 'platformAdmin' },
  { path: ADMIN_NEW_ORGANIZATION_PATH, kind: 'page', access: 'platformAdmin' },
  {
    path: '/admin/organizations/[id]',
    kind: 'page',
    access: 'platformAdmin',
    probePath: '/admin/organizations/probe-kennung',
  },
  {
    path: ADMIN_LOGIN_PATH,
    kind: 'page',
    access: 'public',
    publicReason: 'Die Anmeldung der Verwaltung muss ohne Sitzung erreichbar sein.',
  },
  {
    path: ADMIN_LOGIN_CODE_PATH,
    kind: 'page',
    access: 'public',
    requiresPendingLogin: true,
    publicReason:
      'Der zweite Anmeldeschritt der Verwaltung liegt vor der Sitzung. Geschützt ist ' +
      'er durch den kurzlebigen Nachweis aus dem ersten Schritt.',
  },

  {
    path: '/invitations/[token]',
    kind: 'page',
    access: 'public',
    requiresRedemptionToken: true,
    probePath: '/invitations/unbekannter-token',
    publicReason:
      'Wer eine Einladung annimmt, hat noch kein Konto. Geschützt ist die Seite nicht ' +
      'durch eine Sitzung, sondern durch den Token in der Adresse; ohne gültigen Token ' +
      'nennt sie weder Unternehmen noch Adresse.',
  },
  {
    path: '/password-reset/[token]',
    kind: 'page',
    access: 'public',
    requiresRedemptionToken: true,
    probePath: '/password-reset/unbekannter-token',
    publicReason:
      'Wer sein Passwort neu setzt, kommt gerade nicht in sein Konto. Geschützt ist die ' +
      'Seite durch den Token in der Adresse.',
  },

  { path: SECURITY_SETTINGS_PATH, kind: 'page', access: 'authenticated' },
  { path: MEMBERS_SETTINGS_PATH, kind: 'page', access: 'authenticated' },
  { path: ROLES_SETTINGS_PATH, kind: 'page', access: 'authenticated' },
  { path: EXPORT_SETTINGS_PATH, kind: 'page', access: 'authenticated' },
  {
    path: BACKUP_DOWNLOAD_PATH,
    kind: 'api',
    access: 'platformAdmin',
    // Herunterladen, nicht anzeigen: dasselbe Profil wie die übrigen Dateien.
    securityProfile: 'document',
  },
  {
    path: DATA_EXPORT_PATH,
    kind: 'api',
    access: 'authenticated',
    securityProfile: 'document',
  },
  { path: COMPANY_SETTINGS_PATH, kind: 'page', access: 'authenticated' },
  { path: CUSTOMERS_PATH, kind: 'page', access: 'authenticated' },
  { path: NEW_CUSTOMER_PATH, kind: 'page', access: 'authenticated' },
  {
    path: '/customers/[id]',
    kind: 'page',
    access: 'authenticated',
    probePath: '/customers/probe-kennung',
  },
  { path: INVOICES_PATH, kind: 'page', access: 'authenticated' },
  { path: NEW_INVOICE_PATH, kind: 'page', access: 'authenticated' },
  {
    path: '/invoices/[id]',
    kind: 'page',
    access: 'authenticated',
    probePath: '/invoices/probe-kennung',
  },
  { path: CATALOG_PATH, kind: 'page', access: 'authenticated' },
  { path: NUMBERING_SETTINGS_PATH, kind: 'page', access: 'authenticated' },
  { path: TEMPLATE_SETTINGS_PATH, kind: 'page', access: 'authenticated' },
  {
    path: '/settings/templates/[id]',
    kind: 'page',
    access: 'authenticated',
    probePath: '/settings/templates/probe-kennung',
  },
  {
    path: '/api/invoices/[id]/pdf',
    kind: 'api',
    access: 'authenticated',
    probePath: '/api/invoices/probe-kennung/pdf',
    // Wird als Vorschau eingebettet; ohne dieses Profil greift
    // `X-Frame-Options: DENY` und der Rahmen bleibt weiß.
    securityProfile: 'pdf',
  },
  {
    // Antwortet mit PDF, bei einem Vorlagenfehler mit einer HTML-Meldung. Das
    // Dokumentprofil deckt beide Fälle ab: Es erlaubt das Einbetten und hält
    // die Fehlermeldung skriptfrei.
    path: TEMPLATE_PREVIEW_PATH,
    kind: 'api',
    access: 'authenticated',
    securityProfile: 'document',
  },
  {
    path: '/api/assets/[id]',
    kind: 'api',
    access: 'authenticated',
    probePath: '/api/assets/probe-kennung',
    securityProfile: 'document',
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

/** Das Sicherheitsprofil eines Pfades; unbekannte Pfade gelten als `app`. */
export function securityProfileFor(pathname: string): RouteSecurityProfile {
  const match = routes.find((route) => toPathMatcher(route.path).test(pathname));
  return match?.securityProfile ?? 'app';
}

/** Routen, die eine Sitzung der zentralen Verwaltung verlangen. */
export function platformAdminRoutes(): readonly RouteDefinition[] {
  return routes.filter((route) => route.access === 'platformAdmin');
}

/**
 * Welcher Nachweis für diesen Pfad nötig ist.
 *
 * Ein unbekannter Pfad gilt als geschützt — dieselbe Fail-safe-Regel wie
 * bisher, nur mit drei möglichen Antworten statt zwei. Löst
 * `pathRequiresAuthentication` ab, das die Adminrouten nicht unterscheiden
 * konnte.
 */
export function requiredCredentialFor(pathname: string): RouteAccess {
  const match = routes.find((route) => toPathMatcher(route.path).test(pathname));
  return match?.access ?? 'authenticated';
}

