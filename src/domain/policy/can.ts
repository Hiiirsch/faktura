/**
 * Zentrale Berechtigungsfrage (FA-UI-14, Frontend-Entwurf §7).
 *
 * Sichtbarkeit und Aktivierung jeder Aktion in der Oberfläche laufen über diese
 * eine Funktion. Der Grund steht im Entwurf: Ein späteres Rollenmodell füllt
 * sie an einer Stelle, statt dass jeder Button einzeln nachgerüstet werden muss
 * — wobei zuverlässig einer vergessen würde.
 *
 * V1 kennt genau einen Benutzer je Organisation und damit keine Rollen. Die
 * Funktion ist trotzdem keine Attrappe: Sie prüft, ob die Handlung zum
 * Gegenstand überhaupt passt. `can('issue', 'customer')` ist auch heute schon
 * falsch — ein Kunde wird nicht festgeschrieben.
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
  | 'recordPayment';

export type PolicySubject =
  | 'invoice'
  | 'customer'
  | 'catalogItem'
  | 'companyProfile'
  | 'numbering'
  | 'security';

/**
 * Welche Handlung an welchem Gegenstand überhaupt vorgesehen ist.
 *
 * Bewusst vollständig ausgeschrieben statt über Vererbung abgekürzt: Die
 * Tabelle ist die Aussage, und sie soll sich lesen lassen, ohne sie im Kopf
 * auszurechnen.
 */
const PERMITTED: Readonly<Record<PolicySubject, readonly PolicyAction[]>> = {
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
};

export function can(action: PolicyAction, subject: PolicySubject): boolean {
  return PERMITTED[subject].includes(action);
}
