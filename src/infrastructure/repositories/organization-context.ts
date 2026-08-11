/**
 * Der Mandantenkontext (M5.5a).
 *
 * Jede Repository-Funktion, die auf mandantengebundene Daten zugreift, nimmt
 * einen Wert dieses Typs als **ersten Pflichtparameter**. Eine Abfrage ohne
 * Einschränkung auf eine Organisation lässt sich damit nicht schreiben — sie
 * ist ein Typfehler, kein übersehener Filter.
 *
 * Der Typ ist markiert (`brand`) und lässt sich nicht aus einer beliebigen
 * Zeichenkette herstellen: `organizationContextOf` ist die einzige Quelle, und
 * aufgerufen wird sie ausschließlich dort, wo die Herkunft belegt ist — beim
 * Auflösen der Sitzung und beim Einrichten des ersten Kontos.
 */
declare const organizationContextBrand: unique symbol;

export type OrganizationContext = {
  readonly organizationId: string;
  readonly [organizationContextBrand]: true;
};

/**
 * Die Kennung der Organisation, die die Migration `organization_context`
 * anlegt. V1 arbeitet mit genau dieser einen.
 */
export const DEFAULT_ORGANIZATION_ID = 'org_default';

/**
 * Erzeugt den Kontext aus einer Organisationskennung.
 *
 * Aufrufer sind allein `resolveSession` (Kennung aus dem angemeldeten
 * Benutzer) und das Einrichtungsskript. Wer sie anderswo aufruft, umgeht die
 * Herkunftsprüfung — deshalb steht sie hier und nicht in einem Hilfsmodul.
 */
export function organizationContextOf(organizationId: string): OrganizationContext {
  if (organizationId.length === 0) {
    throw new RangeError('Leere Organisationskennung');
  }
  return { organizationId } as OrganizationContext;
}
