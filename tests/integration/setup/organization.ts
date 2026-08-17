/**
 * Der Mandantenkontext der Integrationstests.
 *
 * In der laufenden Anwendung entsteht er aus der Sitzung. Ein Test hat keine
 * Sitzung und greift deshalb auf die Organisation zu, die die Migration
 * `organization_context` anlegt — dieselbe, an der alle Bestandsdaten hängen.
 */
import { fullyAuthorized } from '@/application/auth/authorize';
import {
  DEFAULT_ORGANIZATION_ID,
  organizationContextOf,
} from '@/infrastructure/repositories/organization-context';

/**
 * Der Kontext trägt den Nachweis über **alle** Rechte (M8).
 *
 * Die Tests hier prüfen Fachlogik, nicht Rechtevergabe — die steht in
 * `permissions.test.ts` und `roles.test.ts`. Ohne den Nachweis müsste jeder
 * dieser Tests eine Sitzung samt Rolle aufbauen, um eine Rechnung anzulegen,
 * und prüfte damit an jeder Stelle etwas mit, was er nicht meint.
 */
export const testOrganization = fullyAuthorized(organizationContextOf(DEFAULT_ORGANIZATION_ID));
