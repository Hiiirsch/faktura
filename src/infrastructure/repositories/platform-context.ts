/**
 * Der Betreiberkontext (M8).
 *
 * Das Gegenstück zu `OrganizationContext` — und sein Gegenteil. Wo jener eine
 * Abfrage auf **einen** Mandanten einschränkt, bezeugt dieser, dass die
 * Abfrage zu **keinem** gehört: Sie stammt aus der zentralen Verwaltung.
 *
 * **Die Trennung liegt im Typ, nicht in einer Prüfung.** Eine Adminsitzung
 * führt keinen `OrganizationContext`, und jede Funktion in
 * `infrastructure/repositories/**`, die Geschäftsdaten anfasst, verlangt einen
 * als ersten Pflichtparameter. Damit ist „die Verwaltung sieht keine
 * Rechnungen" kein Vorsatz, an den sich jemand halten muss, sondern ein
 * Übersetzungsfehler, sobald jemand es versucht.
 *
 * **Es gibt bewusst keine Funktion, die aus einem `PlatformContext` einen
 * `OrganizationContext` macht.** Diese Nichtexistenz ist die Anforderung
 * FA-ADM-04 (keine Übernahme fremder Sitzungen); `tests/architecture/`
 * hält sie fest.
 *
 * Wie beim Mandantenkontext ist der Typ markiert und lässt sich nicht aus einer
 * beliebigen Zeichenkette herstellen: `platformContextOf` ist die einzige
 * Quelle, und aufgerufen wird sie ausschließlich beim Auflösen einer
 * Adminsitzung und im Einrichtungsskript.
 */
declare const platformContextBrand: unique symbol;

export type PlatformContext = {
  readonly adminUserId: string;
  readonly [platformContextBrand]: true;
};

export function platformContextOf(adminUserId: string): PlatformContext {
  if (adminUserId.length === 0) {
    throw new RangeError('Leere Betreiberkennung');
  }
  return { adminUserId } as PlatformContext;
}
