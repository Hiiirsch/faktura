/**
 * Rollen anlegen, umbauen und löschen (M8, FA-ROLE-01, -02, -04).
 *
 * **Die Reihenfolge ist hier die eigentliche Logik: erst gewähren, dann
 * entziehen.**
 *
 * Der Grund liegt in der Datenbank. Die Aussperrsicherung ist ein Trigger, und
 * Trigger feuern in SQLite **zeilenweise**; aufgeschobene Bedingungen
 * (`DEFERRABLE INITIALLY DEFERRED`) gibt es nicht. Wer eine Rolle so umbaut,
 * dass `organization.administer` von einer Rolle auf eine andere wandert, und
 * dabei zuerst entzieht, erzeugt einen Zwischenzustand ohne Rechteverwaltung —
 * mitten in einer Transaktion, die am Ende wieder in Ordnung wäre. Der Trigger
 * sieht das Ende nicht. Er bricht ab, und die ganze Umstellung scheitert.
 *
 * Gewährt man zuerst, entsteht höchstens ein Zwischenzustand mit **einer**
 * Rechteverwaltung zu viel. Den verbietet niemand.
 *
 * Die Differenz wird deshalb hier ausgerechnet und nicht im Repository: Sie
 * gehört zur Reihenfolge, und die ist eine fachliche Entscheidung.
 */
import type { Authorized } from '@/application/auth/authorize';
import {
  ALL_PERMISSION_KEYS,
  isPermissionKey,
  type PermissionKey,
} from '@/domain/policy/can';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { runInTransaction } from '@/infrastructure/repositories/client';
import {
  countActiveHoldersOf,
  createRole,
  deleteRole,
  findRole,
  findRoleByName,
  grantPermissions,
  listRoles,
  renameRole,
  revokePermissions,
  type RoleWithPermissions,
  type RoleWithUsage,
} from '@/infrastructure/repositories/role-repository';

export type { RoleWithPermissions, RoleWithUsage };

export type RoleData = {
  readonly name: string;
  readonly description: string | null;
  readonly permissionKeys: readonly PermissionKey[];
};

export type RoleError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NAME_TAKEN' }
  /** Die Rolle trägt noch Konten oder eine offene Einladung. */
  | { readonly kind: 'IN_USE' }
  /**
   * Der Umbau nähme dem Unternehmen die letzte Rechteverwaltung (FA-ROLE-04).
   *
   * Die Anwendung erklärt, die Datenbank garantiert: Dieser Fall wird hier
   * abgefangen, damit die Oberfläche einen Satz zeigen kann statt eines
   * abgebrochenen Schreibvorgangs. Fällt die Prüfung aus, bricht der Trigger ab
   * — nur eben unschön.
   */
  | { readonly kind: 'LAST_ADMINISTRATOR' };

/** Das Recht, dessen Verlust ein Unternehmen aussperrt. */
const ADMINISTER: PermissionKey = 'organization.administer';

/**
 * Filtert eine Eingabe auf bekannte Schlüssel.
 *
 * Ein unbekannter Schlüssel gewährt ohnehin nichts (FA-ROLE-06), aber er soll
 * auch nicht gespeichert werden: In der Rollenliste stünde sonst ein Recht, das
 * es nicht gibt, und niemand könnte erklären, was es tut.
 */
export function readPermissionKeys(values: readonly string[]): readonly PermissionKey[] {
  return values.filter(isPermissionKey);
}

export async function getRoles(
  context: Authorized<'organization.administer'>,
): Promise<readonly RoleWithUsage[]> {
  return listRoles(context);
}

export async function getRole(
  context: Authorized<'organization.administer'>,
  id: string,
): Promise<RoleWithPermissions | null> {
  return findRole(context, id);
}

export async function addRole(
  context: Authorized<'organization.administer'>,
  data: RoleData,
  actorId: string,
  ipAddress: string | null,
): Promise<Result<RoleWithPermissions, RoleError>> {
  if ((await findRoleByName(context, data.name)) !== null) {
    return err({ kind: 'NAME_TAKEN' });
  }

  const role = await createRole(context, {
    name: data.name,
    description: data.description,
    permissionKeys: [...data.permissionKeys],
  });

  await recordAuditEntry(context, {
    entityType: 'Role',
    entityId: role.id,
    action: 'CREATED',
    actorId,
    ipAddress,
    details: { name: role.name, permissions: data.permissionKeys.length },
  });

  const created = await findRole(context, role.id);
  return created === null ? err({ kind: 'NOT_FOUND' }) : ok(created);
}

/**
 * Setzt Name, Beschreibung und Rechtemenge einer Rolle neu.
 *
 * Die Rechtemenge wird als **Ziel** übergeben; die Differenz entsteht hier.
 */
export async function saveRole(
  context: Authorized<'organization.administer'>,
  id: string,
  data: RoleData,
  actorId: string,
  ipAddress: string | null,
): Promise<Result<RoleWithPermissions, RoleError>> {
  const before = await findRole(context, id);
  if (before === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const clash = await findRoleByName(context, data.name);
  if (clash !== null && clash.id !== id) {
    return err({ kind: 'NAME_TAKEN' });
  }

  const current = new Set(before.permissions.map((entry) => entry.permissionKey));
  const target = new Set<string>(data.permissionKeys);

  const toGrant = [...target].filter((key) => !current.has(key));
  const toRevoke = [...current].filter((key) => !target.has(key));

  /*
   * Nimmt dieser Umbau dem Unternehmen die Rechteverwaltung?
   *
   * Nur wenn die Rolle sie **hatte** und nicht mehr haben soll, und nur wenn
   * kein anderes Konto sie hält. `countActiveHoldersOf` zählt auch die Konten
   * dieser Rolle mit — deshalb wird verglichen, wie viele davon an ihr hängen.
   */
  if (current.has(ADMINISTER) && !target.has(ADMINISTER)) {
    const holders = await countActiveHoldersOf(context, ADMINISTER);
    const roles = await listRoles(context);
    const mine = roles.find((entry) => entry.id === id)?.memberCount ?? 0;

    if (holders - mine <= 0) {
      return err({ kind: 'LAST_ADMINISTRATOR' });
    }
  }

  await runInTransaction(async (handle) => {
    await renameRole(context, id, { name: data.name, description: data.description }, handle);
    // Erst gewähren, dann entziehen — siehe Kopf dieser Datei.
    await grantPermissions(context, id, toGrant, handle);
    await revokePermissions(context, id, toRevoke, handle);
  });

  await recordAuditEntry(context, {
    entityType: 'Role',
    entityId: id,
    action: 'UPDATED',
    actorId,
    ipAddress,
    details: { name: data.name, granted: toGrant.length, revoked: toRevoke.length },
  });

  const after = await findRole(context, id);
  return after === null ? err({ kind: 'NOT_FOUND' }) : ok(after);
}

/**
 * Löscht eine Rolle, die niemand trägt.
 *
 * Ein Konto ohne Rolle hätte nur die Grundrechte und stünde plötzlich vor einer
 * leeren Anwendung. `ON DELETE RESTRICT` wehrt das auf Datenbankebene ab;
 * hier wird vorher gezählt, damit die Oberfläche es erklären kann.
 */
export async function removeRole(
  context: Authorized<'organization.administer'>,
  id: string,
  actorId: string,
  ipAddress: string | null,
): Promise<Result<null, RoleError>> {
  const roles = await listRoles(context);
  const role = roles.find((entry) => entry.id === id);

  if (role === undefined) {
    return err({ kind: 'NOT_FOUND' });
  }
  if (role.memberCount > 0) {
    return err({ kind: 'IN_USE' });
  }

  const deleted = await deleteRole(context, id);
  if (deleted === 0) {
    return err({ kind: 'NOT_FOUND' });
  }

  await recordAuditEntry(context, {
    entityType: 'Role',
    entityId: id,
    action: 'DELETED',
    actorId,
    ipAddress,
    details: { name: role.name },
  });

  return ok(null);
}

/** Alle Schlüssel des Katalogs — für das Rollenformular. */
export function allPermissionKeys(): readonly PermissionKey[] {
  return ALL_PERMISSION_KEYS;
}
