/**
 * Rollen und ihre Berechtigungen je Organisation (M8, FA-ROLE-01, -02).
 *
 * Wie bei den Kunden laufen Einzelabfragen über `findFirst` mit `id` **und**
 * `organizationId`: Eine fremde Rolle soll nicht gefunden werden, statt gefunden
 * und nachträglich verworfen.
 *
 * **Berechtigungen liegen als Zeilen, nicht als Textspalte.** SQLite kennt keinen
 * Array-Typ; eine Liste in einer Spalte machte Tippfehler unsichtbar und zwänge
 * die Aussperrsicherung, in einer Zeichenkette zu suchen statt Zeilen zu zählen.
 * Genau diese Zählung ist der Trigger `Organization_keeps_administrator_*`.
 */
import type { Prisma, Role, RolePermission } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';

export type { Role, RolePermission };

const withPermissions = {
  permissions: { select: { permissionKey: true } },
} satisfies Prisma.RoleInclude;

export type RoleWithPermissions = Prisma.RoleGetPayload<{ include: typeof withPermissions }>;

/** Rollen samt Berechtigungen und der Zahl der Konten, die sie tragen. */
export type RoleWithUsage = RoleWithPermissions & { readonly memberCount: number };

export async function listRoles(
  context: OrganizationContext,
): Promise<readonly RoleWithUsage[]> {
  const roles = await clientFor(undefined).role.findMany({
    where: { organizationId: context.organizationId },
    include: { ...withPermissions, _count: { select: { users: true } } },
    orderBy: { name: 'asc' },
  });

  return roles.map(({ _count, ...role }) => ({ ...role, memberCount: _count.users }));
}

export async function findRole(
  context: OrganizationContext,
  id: string,
): Promise<RoleWithPermissions | null> {
  return clientFor(undefined).role.findFirst({
    where: { id, organizationId: context.organizationId },
    include: withPermissions,
  });
}

export async function findRoleByName(
  context: OrganizationContext,
  name: string,
): Promise<Role | null> {
  return clientFor(undefined).role.findFirst({
    where: { organizationId: context.organizationId, name },
  });
}

export async function createRole(
  context: OrganizationContext,
  data: {
    readonly name: string;
    readonly description: string | null;
    readonly permissionKeys: readonly string[];
  },
  handle?: TransactionHandle,
): Promise<Role> {
  return clientFor(handle).role.create({
    data: {
      organizationId: context.organizationId,
      name: data.name,
      description: data.description,
      permissions: {
        create: data.permissionKeys.map((permissionKey) => ({
          organizationId: context.organizationId,
          permissionKey,
        })),
      },
    },
  });
}

export async function renameRole(
  context: OrganizationContext,
  id: string,
  data: { readonly name: string; readonly description: string | null },
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).role.updateMany({
    where: { id, organizationId: context.organizationId },
    data,
  });
  return result.count;
}

/**
 * Erteilt Berechtigungen. Vorhandene bleiben unberührt.
 *
 * Der Aufrufer übergibt die **Differenz**, nicht die Zielmenge:
 * `skipDuplicates` gibt es unter SQLite nicht, ein zweimal erteiltes Recht
 * verletzt also `@@unique([roleId, permissionKey])`. Die Rechnung steht in
 * `role-service.ts`, weil dort auch die Reihenfolge festgelegt ist — erst
 * gewähren, dann entziehen.
 */
export async function grantPermissions(
  context: OrganizationContext,
  roleId: string,
  permissionKeys: readonly string[],
  handle?: TransactionHandle,
): Promise<void> {
  if (permissionKeys.length === 0) {
    return;
  }

  await clientFor(handle).rolePermission.createMany({
    data: permissionKeys.map((permissionKey) => ({
      organizationId: context.organizationId,
      roleId,
      permissionKey,
    })),
  });
}

export async function revokePermissions(
  context: OrganizationContext,
  roleId: string,
  permissionKeys: readonly string[],
  handle?: TransactionHandle,
): Promise<void> {
  if (permissionKeys.length === 0) {
    return;
  }

  await clientFor(handle).rolePermission.deleteMany({
    where: { organizationId: context.organizationId, roleId, permissionKey: { in: [...permissionKeys] } },
  });
}

/**
 * Löscht eine Rolle.
 *
 * Scheitert an `ON DELETE RESTRICT`, wenn ein Konto sie trägt — das ist die
 * Absicht: Eine benutzte Rolle zu löschen hieße, ein Konto ohne Rolle zu
 * hinterlassen. Ebenso an einer offenen Einladung, die sie mitbringt.
 */
export async function deleteRole(
  context: OrganizationContext,
  id: string,
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).role.deleteMany({
    where: { id, organizationId: context.organizationId },
  });
  return result.count;
}

/**
 * Wie viele nicht gesperrte Konten dieses Recht halten.
 *
 * Für die Aussperrsicherung in der Anwendungsschicht: Sie soll erklären
 * („das letzte Konto mit Rechteverwaltung"), bevor die Datenbank abbricht. Die
 * Zusage selbst liegt im Trigger — diese Abfrage ist die Höflichkeit davor.
 */
export async function countActiveHoldersOf(
  context: OrganizationContext,
  permissionKey: string,
): Promise<number> {
  return clientFor(undefined).user.count({
    where: {
      organizationId: context.organizationId,
      disabledAt: null,
      role: { permissions: { some: { permissionKey } } },
    },
  });
}
