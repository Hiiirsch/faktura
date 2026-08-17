'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { authorize } from '@/application/auth/authorize';
import { readRequestContext } from '@/application/auth/request-context';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import {
  addRole,
  readPermissionKeys,
  removeRole,
  type RoleError,
  saveRole,
} from '@/application/roles/role-service';
import { messages } from '@/i18n/de';
import { ROLES_SETTINGS_PATH } from '@/routes';

const id = z.string().trim().min(1).max(64);

const roleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((value) => (value.length === 0 ? null : value)),
});

export type RoleFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'saved' }
  | { readonly status: 'error'; readonly message: string };

function describe(error: RoleError): string {
  switch (error.kind) {
    case 'NOT_FOUND':
      return messages.roles.errorNOT_FOUND;
    case 'NAME_TAKEN':
      return messages.roles.errorNAME_TAKEN;
    case 'IN_USE':
      return messages.roles.errorIN_USE;
    case 'LAST_ADMINISTRATOR':
      return messages.roles.errorLAST_ADMINISTRATOR;
  }
}

/**
 * Die angekreuzten Berechtigungen.
 *
 * `getAll` und danach der Filter auf bekannte Schlüssel: Ein Feld, das jemand
 * von Hand hinzufügt, landet nicht in der Datenbank. Es gewährte ohnehin nichts
 * (FA-ROLE-06) — aber in der Rollenliste stünde ein Recht, das niemand erklären
 * kann.
 */
function readPermissions(formData: FormData): readonly string[] {
  return formData
    .getAll('permissions')
    .filter((value): value is string => typeof value === 'string');
}

export async function createRoleAction(
  _previous: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'organization.administer');

  const parsed = roleSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) {
    return { status: 'error', message: messages.roles.nameMissing };
  }

  const context = await readRequestContext();
  const result = await addRole(
    authorized,
    {
      name: parsed.data.name,
      description: parsed.data.description,
      permissionKeys: readPermissionKeys(readPermissions(formData)),
    },
    session.userId,
    context.ipAddress,
  );

  if (!result.ok) {
    return { status: 'error', message: describe(result.error) };
  }

  revalidatePath(ROLES_SETTINGS_PATH);
  redirect(`${ROLES_SETTINGS_PATH}?erledigt=angelegt`);
}

export async function saveRoleAction(
  _previous: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'organization.administer');

  const roleId = id.safeParse(formData.get('roleId'));
  const parsed = roleSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
  });

  if (!roleId.success) {
    return { status: 'error', message: messages.roles.errorNOT_FOUND };
  }
  if (!parsed.success) {
    return { status: 'error', message: messages.roles.nameMissing };
  }

  const context = await readRequestContext();
  const result = await saveRole(
    authorized,
    roleId.data,
    {
      name: parsed.data.name,
      description: parsed.data.description,
      permissionKeys: readPermissionKeys(readPermissions(formData)),
    },
    session.userId,
    context.ipAddress,
  );

  if (!result.ok) {
    return { status: 'error', message: describe(result.error) };
  }

  revalidatePath(ROLES_SETTINGS_PATH);
  return { status: 'saved' };
}

export async function deleteRoleAction(roleId: string, formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'organization.administer');

  const context = await readRequestContext();
  const result = await removeRole(authorized, roleId, session.userId, context.ipAddress);

  revalidatePath(ROLES_SETTINGS_PATH);
  redirect(
    result.ok
      ? `${ROLES_SETTINGS_PATH}?erledigt=geloescht`
      : `${ROLES_SETTINGS_PATH}?fehler=${result.error.kind}`,
  );
}
