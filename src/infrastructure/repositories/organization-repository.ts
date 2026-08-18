/**
 * Die Organisationen selbst.
 *
 * **Kein Mandantenkontext, und seit M8/B5 auch keine Erzeugung eines solchen.**
 * `defaultOrganizationContext()` ist entfallen: Sie riet die Organisation, wenn
 * es genau eine gab, und das war die Krücke einer Installation mit einem
 * Mandanten. Bei mehreren wäre das Raten falsch — `npm run user:create` verlangt
 * jetzt `--organization`.
 *
 * Was hier bleibt, sind Abfragen ohne Kontext, weil sie **über** Organisationen
 * gehen statt in eine hinein. Aufgerufen werden sie vom Einrichtungskommando und
 * vom Isolationstest; die laufende Anwendung nimmt ihren Kontext aus der Sitzung
 * und die Verwaltung ihre Liste aus `platform-repository.ts`.
 */
import type { Organization } from '@prisma/client';

import { clientFor } from './client';

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
