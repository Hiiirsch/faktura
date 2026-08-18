'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { endAdminSession } from '@/application/admin/admin-session-service';
import {
  createManagedOrganization,
  setOrganizationSuspended,
  setPlatformUserDisabled,
} from '@/application/admin/organization-admin';
import { requireAdminSessionOrThrow } from '@/application/admin/require-admin-session';
import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { messages } from '@/i18n/de';
import {
  ADMIN_SESSION_COOKIE_NAME,
  clearedAdminSessionCookieOptions,
} from '@/infrastructure/auth/session-cookie';
import { getEnv } from '@/infrastructure/config/env';
import {
  ADMIN_LOGIN_PATH,
  ADMIN_PATH,
  adminOrganizationPath,
  invitationPath,
} from '@/routes';

/** Abmelden aus der Verwaltung: Sitzung serverseitig beenden, Cookie löschen. */
export async function adminLogoutAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? '';

  if (token.length > 0) {
    await endAdminSession(token);
  }

  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, '', clearedAdminSessionCookieOptions());
  redirect(ADMIN_LOGIN_PATH);
}

/**
 * Der Einladungslink, wie der Betreiber ihn weitergibt.
 *
 * Aus `APP_URL` und nicht aus der Anfrage — dieselbe Begründung wie in der
 * Mitgliederverwaltung: Ein Link aus einem `Host`-Header zeigt auf das, was der
 * Aufrufer behauptet.
 */
function absoluteInvitationLink(token: string): string {
  return `${getEnv().APP_URL.replace(/\/$/u, '')}${invitationPath(token)}`;
}

export type NewOrganizationState =
  | { readonly status: 'idle' }
  /**
   * Der einzige Zustand, in dem der Token existiert.
   *
   * Er lebt in der Antwort dieser Aktion und nirgends sonst; gespeichert ist nur
   * sein Hash. Ein Neuladen zeigt ihn nicht wieder.
   */
  | {
      readonly status: 'created';
      readonly organizationId: string;
      readonly email: string;
      readonly link: string;
    }
  | { readonly status: 'error'; readonly message: string };

const newOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ownerEmail: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(200)),
});

export async function createOrganizationAction(
  _previous: NewOrganizationState,
  formData: FormData,
): Promise<NewOrganizationState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  // Erste Anweisung nach der Herkunftsprüfung: die Sitzung der Verwaltung.
  const session = await requireAdminSessionOrThrow();

  const parsed = newOrganizationSchema.safeParse({
    name: formData.get('name'),
    ownerEmail: formData.get('ownerEmail'),
  });

  if (!parsed.success) {
    const name = formData.get('name');
    const hasName = typeof name === 'string' && name.trim().length > 0;
    return {
      status: 'error',
      message: hasName ? messages.admin.emailInvalid : messages.admin.nameMissing,
    };
  }

  const context = await readRequestContext();
  const result = await createManagedOrganization(
    session.platform,
    parsed.data,
    session.adminUserId,
    context.ipAddress,
  );

  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.error.kind === 'EMAIL_TAKEN'
          ? messages.admin.emailTaken
          : messages.admin.nameMissing,
    };
  }

  revalidatePath(ADMIN_PATH);

  return {
    status: 'created',
    organizationId: result.value.organizationId,
    email: parsed.data.ownerEmail,
    link: absoluteInvitationLink(result.value.token),
  };
}

/** Stilllegen und Freigeben — die Kennung ist an die Aktion gebunden. */
export async function setOrganizationSuspendedAction(
  organizationId: string,
  suspended: boolean,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  const context = await readRequestContext();
  const result = await setOrganizationSuspended(
    session.platform,
    organizationId,
    suspended,
    session.adminUserId,
    context.ipAddress,
  );

  revalidatePath(ADMIN_PATH);
  revalidatePath(adminOrganizationPath(organizationId));

  redirect(
    `${adminOrganizationPath(organizationId)}?` +
      (result.ok
        ? `erledigt=${suspended ? 'stillgelegt' : 'freigegeben'}`
        : `fehler=${result.error.kind}`),
  );
}

export async function setAccountDisabledAction(
  organizationId: string,
  userId: string,
  disabled: boolean,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  const context = await readRequestContext();

  /*
   * Die Aussperrsicherung liegt in Triggern und greift auch hier.
   *
   * Sie wirft eine Datenbankausnahme statt eines benannten Fehlers — anders als
   * in der Mitgliederverwaltung, die vorher zählt und erklärt. Für den
   * Betreiber ist das vertretbar: Er benutzt ein Werkzeug für den Ausnahmefall.
   * Gefangen wird sie hier, damit die Seite eine Meldung zeigt statt einer
   * Fehlerseite.
   */
  let failed: string | null = null;
  try {
    const result = await setPlatformUserDisabled(
      session.platform,
      userId,
      disabled,
      session.adminUserId,
      context.ipAddress,
    );
    if (!result.ok) {
      failed = result.error.kind;
    }
  } catch {
    failed = 'LAST_ADMINISTRATOR';
  }

  revalidatePath(adminOrganizationPath(organizationId));

  redirect(
    `${adminOrganizationPath(organizationId)}?` +
      (failed === null
        ? `erledigt=${disabled ? 'kontoGesperrt' : 'kontoEntsperrt'}`
        : `fehler=${failed}`),
  );
}
