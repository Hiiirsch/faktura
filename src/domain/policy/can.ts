/**
 * Zentrale Berechtigungsfrage (FA-UI-14, FA-ROLE-01, -06; Frontend-Entwurf §7).
 *
 * Sichtbarkeit und Aktivierung jeder Aktion laufen über diese eine Funktion.
 * Bis M7 lieferte sie durchgehend `true` — der Entwurf hatte sie als Platz für
 * ein späteres Rollenmodell vorgesehen, damit nicht jeder Knopf einzeln
 * nachgerüstet werden muss. Seit M8 ist der Platz gefüllt.
 *
 * **Der Katalog ist abgeleitet, nicht danebengestellt.** Ein Berechtigungs­
 * schlüssel ist genau ein Eintrag aus `PERMITTED` in der Form
 * `gegenstand.handlung` — typseitig aus derselben Tabelle erzeugt. Es gibt
 * damit **eine** Stelle, an der eine Berechtigung entsteht: Wer eine hinzufügt,
 * ergänzt eine Zeile, und Datenbank, Rollenformular und Oberfläche kennen sie.
 * Ein zweites Verzeichnis wäre die erste Stelle, an der beide auseinanderlaufen.
 *
 * **Ein unbekannter Schlüssel gewährt nichts** (FA-ROLE-06). Deshalb braucht
 * die Datenbank keine Fremdschlüsselprüfung auf den Katalog: `can()` fragt nur
 * nach Schlüsseln, die es kennt. Das unterscheidet sie grundlegend von
 * `organizationId`, wo ein falscher Wert eine Grenze verschiebt und deshalb
 * Trigger rechtfertigt.
 *
 * **Rein und ohne Zustand.** Wer die Berechtigungen eines Kontos liest, ist die
 * Sitzung (`application/auth/session-service.ts`); wer sie durchsetzt, ist
 * `application/auth/authorize.ts`. Hier steht nur, was sie bedeuten.
 */

export type PolicyAction =
  | 'create'
  | 'read'
  | 'update'
  | 'archive'
  | 'delete'
  | 'duplicate'
  | 'issue'
  | 'cancel'
  | 'recordPayment'
  /** Einen Vorgang ausführen, der nichts ändert — den Datenexport. */
  | 'run'
  /** Mitglieder und Rollen des eigenen Unternehmens verwalten. */
  | 'administer';

export type PolicySubject =
  | 'invoice'
  | 'customer'
  | 'catalogItem'
  | 'companyProfile'
  | 'numbering'
  | 'security'
  | 'template'
  | 'export'
  | 'organization';

/**
 * Welche Handlung an welchem Gegenstand überhaupt vorgesehen ist.
 *
 * Bewusst vollständig ausgeschrieben statt über Vererbung abgekürzt: Die
 * Tabelle ist die Aussage, und sie soll sich lesen lassen, ohne sie im Kopf
 * auszurechnen. Seit M8 ist sie zugleich der Berechtigungskatalog.
 */
export const PERMITTED = {
  // Belege werden nie gelöscht, sondern storniert — außer im Entwurf
  // (FA-RECH-11). Ob der konkrete Beleg noch Entwurf ist, entscheidet der
  // Status, nicht diese Tabelle.
  invoice: ['create', 'read', 'update', 'delete', 'duplicate', 'issue', 'cancel', 'recordPayment'],
  // Kunden werden archiviert, nie gelöscht (Spec §4.1).
  customer: ['create', 'read', 'update', 'archive'],
  catalogItem: ['create', 'read', 'update', 'archive'],
  companyProfile: ['read', 'update'],
  numbering: ['read', 'update'],
  security: ['read', 'update'],
  // Seit M8 eigener Gegenstand: Bis dahin behalf sich die Vorlagenseite mit
  // `companyProfile.update`, was zwei verschiedene Dinge unter einem Recht
  // zusammenfasste.
  template: ['create', 'read', 'update', 'delete'],
  export: ['run'],
  // **Ein** Schlüssel für Mitglieder und Rollen zusammen. Sie zu trennen wäre
  // Schein: Wer Rollen anlegen darf, kann sich selbst die Mitgliederverwaltung
  // erteilen. Und die Aussperrsicherung (FA-ROLE-04) muss dann nur eine
  // Invariante halten statt zweier.
  organization: ['administer'],
} as const satisfies Readonly<Record<PolicySubject, readonly PolicyAction[]>>;

/**
 * Ein Berechtigungsschlüssel — `gegenstand.handlung`.
 *
 * Aus `PERMITTED` erzeugt: Der Typ kennt genau die Kombinationen, die die
 * Tabelle vorsieht. `'invoice.archive'` ist damit kein gültiger Schlüssel, weil
 * ein Beleg nicht archiviert wird.
 */
export type PermissionKey = {
  [S in keyof typeof PERMITTED]: `${S}.${(typeof PERMITTED)[S][number]}`;
}[keyof typeof PERMITTED];

/** Alle Schlüssel als Liste — für das Rollenformular und die Prüfungen. */
export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = Object.entries(PERMITTED).flatMap(
  ([subject, actions]) => actions.map((action) => `${subject}.${action}` as PermissionKey),
);

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as readonly string[]).includes(value);
}

/**
 * Rechte, die jedes aktive Konto ohne Rolle trägt.
 *
 * Den Namen des eigenen Arbeitgebers zu kennen und das eigene Passwort zu
 * ändern sind keine Rechtefragen. Ohne `companyProfile.read` könnte die
 * Seitenleiste den Unternehmensnamen nicht zeigen, und jede Seite würde zur
 * Rechteprüfung; ohne `security.update` könnte ein Mitglied sein Passwort nicht
 * wechseln, was eine Sicherheitsfunktion von einer Rolle abhängig machte.
 */
export const BASE_PERMISSIONS: readonly PermissionKey[] = [
  'companyProfile.read',
  'security.read',
  'security.update',
];

/** Wer etwas tun will — mit der Menge seiner Berechtigungen. */
export type Actor = {
  readonly permissions: ReadonlySet<PermissionKey>;
};

/** Baut einen Akteur aus gespeicherten Schlüsseln; unbekannte fallen weg. */
export function actorOf(keys: readonly string[]): Actor {
  const permissions = new Set<PermissionKey>(BASE_PERMISSIONS);

  for (const key of keys) {
    if (isPermissionKey(key)) {
      permissions.add(key);
    }
  }

  return { permissions };
}

/** Ein Akteur mit allen Rechten — für die Rolle „Inhaber" und für Tests. */
export function omnipotentActor(): Actor {
  return { permissions: new Set(ALL_PERMISSION_KEYS) };
}

/**
 * Darf dieser Akteur diese Handlung an diesem Gegenstand?
 *
 * Zwei Fragen in einer: Passt die Handlung überhaupt zum Gegenstand
 * (`PERMITTED`), und hält der Akteur den Schlüssel. Die erste Frage stellte
 * schon V1; die zweite ist seit M8 dazugekommen.
 */
export function can(actor: Actor, action: PolicyAction, subject: PolicySubject): boolean {
  const actions: readonly PolicyAction[] = PERMITTED[subject];
  if (!actions.includes(action)) {
    return false;
  }

  return holds(actor, `${subject}.${action}` as PermissionKey);
}

/**
 * Dieselbe Frage, gestellt mit dem Schlüssel statt mit dem Paar.
 *
 * `can()` ist die Form für Aufrufstellen, die über eine Handlung an einem
 * Gegenstand sprechen — die Oberfläche tut das. Wer dagegen einen Schlüssel in
 * der Hand hat (die Durchsetzung, die Navigation, das Rollenformular), soll ihn
 * nicht erst in zwei Teile zerlegen müssen, um ihn wieder zusammenzusetzen.
 *
 * Die Prüfung „passt die Handlung zum Gegenstand" entfällt hier, weil sie im Typ
 * steckt: `PermissionKey` kennt nur die Kombinationen aus `PERMITTED`.
 */
export function holds(actor: Actor, key: PermissionKey): boolean {
  return actor.permissions.has(key);
}

/** Zerlegt einen Schlüssel in seine beiden Teile. */
export function splitPermissionKey(key: PermissionKey): {
  readonly subject: PolicySubject;
  readonly action: PolicyAction;
} {
  const separator = key.indexOf('.');
  return {
    subject: key.slice(0, separator) as PolicySubject,
    action: key.slice(separator + 1) as PolicyAction,
  };
}
