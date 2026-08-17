/**
 * Unternehmensverwaltung aus der Sicht des Betreibers (M8).
 *
 * Die Anwendungsschicht zwischen Adminseiten und `platform-repository`. Sie
 * trägt in B1 nur die Übersichtszahl; Anlegen, Stilllegen und die Kennzahlen je
 * Unternehmen kommen mit B5 hinzu.
 *
 * Erster Parameter ist überall der `PlatformContext` — dasselbe Muster wie der
 * `OrganizationContext` in der Mandantenschicht, mit derselben Wirkung: Ohne
 * Adminsitzung lässt sich keine dieser Funktionen aufrufen, und mit ihr kommt
 * man an keine Geschäftsdaten.
 */
import type { PlatformContext } from '@/application/admin/admin-session-service';
import { countOrganizations } from '@/infrastructure/repositories/platform-repository';

export async function countManagedOrganizations(platform: PlatformContext): Promise<number> {
  return countOrganizations(platform);
}
