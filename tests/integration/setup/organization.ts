/**
 * Der Mandantenkontext der Integrationstests.
 *
 * In der laufenden Anwendung entsteht er aus der Sitzung. Ein Test hat keine
 * Sitzung und greift deshalb auf die Organisation zu, die die Migration
 * `organization_context` anlegt — dieselbe, an der alle Bestandsdaten hängen.
 */
import {
  DEFAULT_ORGANIZATION_ID,
  organizationContextOf,
} from '@/infrastructure/repositories/organization-context';

export const testOrganization = organizationContextOf(DEFAULT_ORGANIZATION_ID);
