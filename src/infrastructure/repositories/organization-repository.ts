/**
 * Die Organisationen selbst.
 *
 * Kein Mandantenkontext — hier entsteht er. Aufgerufen wird das ausschließlich
 * beim Einrichten (`user:create`) und aus dem Isolationstest; die laufende
 * Anwendung erhält ihren Kontext aus der Sitzung.
 */
import type { Organization } from '@prisma/client';

import { clientFor } from './client';
import { DEFAULT_ORGANIZATION_ID, type OrganizationContext, organizationContextOf } from './organization-context';

export type { Organization };

export async function findOrganization(id: string): Promise<Organization | null> {
  return clientFor(undefined).organization.findUnique({ where: { id } });
}

export async function listOrganizations(): Promise<readonly Organization[]> {
  return clientFor(undefined).organization.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function createOrganization(id: string, name: string): Promise<Organization> {
  return clientFor(undefined).organization.create({ data: { id, name } });
}

/**
 * Der Kontext der Organisation, die die Migration angelegt hat.
 *
 * Für `user:create`: Ein neues Konto gehört zu dieser einen Organisation,
 * solange es keine Mitgliederverwaltung gibt.
 */
export async function defaultOrganizationContext(): Promise<OrganizationContext | null> {
  const organization = await findOrganization(DEFAULT_ORGANIZATION_ID);
  if (organization !== null) {
    return organizationContextOf(organization.id);
  }

  // Eine Datenbank, in der die Standardorganisation umbenannt oder ersetzt
  // wurde, bleibt benutzbar, solange es genau eine gibt.
  const all = await listOrganizations();
  const only = all.length === 1 ? all[0] : undefined;
  return only === undefined ? null : organizationContextOf(only.id);
}
