'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { endAdminSession } from '@/application/admin/admin-session-service';
import {
  anonymizeTenantUser,
  createManagedOrganization,
  reissueInvitation,
  setOrganizationSuspended,
  setPlatformUserDisabled,
  updateManagedOrganization,
  startTenantPasswordReset,
  withdrawInvitationAsPlatform,
} from '@/application/admin/organization-admin';
import {
  invitePlatformAccount,
  resetPlatformAccount,
  setPlatformAccountDisabled,
} from '@/application/admin/platform-accounts';
import { requireAdminSessionOrThrow } from '@/application/admin/require-admin-session';
import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { removePasskey } from '@/application/auth/passkey-registration';
import { readRequestContext } from '@/application/auth/request-context';
import type { Delivery } from '@/application/notifications/deliver';
import { messages } from '@/i18n/de';
import {
  ADMIN_SESSION_COOKIE_NAME,
  clearedAdminSessionCookieOptions,
} from '@/infrastructure/auth/session-cookie';
import { getEnv } from '@/infrastructure/config/env';
import {
  ADMIN_ACCOUNTS_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_PATH,
  adminOrganizationPath,
  adminSetupPath,
  invitationPath,
  passwordResetPath,
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
function absoluteLink(pathname: string): string {
  return `${getEnv().APP_URL.replace(/\/$/u, '')}${pathname}`;
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
      /** Was aus der Zustellung wurde (M14) — der Link steht trotzdem da. */
      readonly delivery: Delivery;
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
    link: absoluteLink(invitationPath(result.value.token)),
    delivery: result.value.delivery,
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

// ─── Wege aus einer Sackgasse (M9/B1) ───────────────────────────────────────
//
// Beide Aktionen geben einen Link zurück, der **genau einmal** sichtbar ist —
// dieselbe Bauart wie die Einladung beim Anlegen und die Wiederherstellungscodes.
// Deshalb `useActionState` und kein Redirect: Über eine Umleitung ließe sich der
// Link nur transportieren, indem man ihn zwischenspeichert.

export type RecoveryState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'issued';
      readonly heading: string;
      readonly link: string;
      /**
       * Was aus der Zustellung wurde (M14).
       *
       * Optional, weil nicht jede Stelle zustellt — und dort, wo nicht, soll
       * kein Satz darüber stehen. `undefined` heißt „diese Handlung verschickt
       * nichts", nicht „es ging schief".
       */
      readonly delivery?: Delivery;
      /** Empfänger, für den Satz „… wurde zusätzlich an {email} geschickt". */
      readonly email?: string;
    }
  | { readonly status: 'error'; readonly message: string };

const idSchema = z.string().trim().min(1).max(64);

export async function reissueInvitationAction(
  organizationId: string,
  _previous: RecoveryState,
  formData: FormData,
): Promise<RecoveryState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireAdminSessionOrThrow();

  const email = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .safeParse(formData.get('email'));

  if (!email.success) {
    return { status: 'error', message: messages.admin.emailInvalid };
  }

  const context = await readRequestContext();
  const result = await reissueInvitation(
    session.platform,
    organizationId,
    email.data,
    session.adminUserId,
    context.ipAddress,
  );

  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.error.kind === 'EMAIL_TAKEN'
          ? messages.admin.emailTaken
          : result.error.kind === 'NO_OWNER_ROLE'
            ? messages.admin.errorNO_OWNER_ROLE
            : messages.admin.errorNOT_FOUND,
    };
  }

  revalidatePath(adminOrganizationPath(organizationId));

  return {
    status: 'issued',
    heading: messages.admin.reissuedHeading,
    link: absoluteLink(invitationPath(result.value.token)),
    delivery: result.value.delivery,
    email: email.data,
  };
}

export async function resetTenantPasswordAction(
  organizationId: string,
  _previous: RecoveryState,
  formData: FormData,
): Promise<RecoveryState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireAdminSessionOrThrow();

  const userId = idSchema.safeParse(formData.get('userId'));
  if (!userId.success) {
    return { status: 'error', message: messages.admin.errorNOT_FOUND };
  }

  const context = await readRequestContext();
  const result = await startTenantPasswordReset(
    session.platform,
    userId.data,
    session.adminUserId,
    context.ipAddress,
  );

  if (!result.ok) {
    return { status: 'error', message: messages.admin.errorNOT_FOUND };
  }

  revalidatePath(adminOrganizationPath(organizationId));

  return {
    status: 'issued',
    heading: messages.admin.tenantResetHeading,
    link: absoluteLink(passwordResetPath(result.value.token)),
    delivery: result.value.delivery,
    email: result.value.email,
  };
}

/** Zurückziehen braucht keinen Rückkanal — die Meldung steht in der Adresse. */
export async function withdrawInvitationAsPlatformAction(
  organizationId: string,
  invitationId: string,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  const context = await readRequestContext();
  const result = await withdrawInvitationAsPlatform(
    session.platform,
    organizationId,
    invitationId,
    session.adminUserId,
    context.ipAddress,
  );

  revalidatePath(adminOrganizationPath(organizationId));
  redirect(
    `${adminOrganizationPath(organizationId)}?` +
      (result.ok ? 'erledigt=zurueckgezogen' : `fehler=${result.error.kind}`),
  );
}

/** Einen Passkey des Betreiberkontos entfernen (M9, FA-PASS-04). */
export async function removeAdminPasskeyAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  const id = z.string().trim().min(1).max(64).safeParse(formData.get('passkeyId'));
  if (!id.success) {
    return;
  }

  await removePasskey(
    { kind: 'admin', id: session.adminUserId, email: session.email, name: null },
    id.data,
  );
  revalidatePath(ADMIN_PATH);
}

// ─── Betreiberkonten (M10/B1, FA-ADM-12, -13) ───────────────────────────────
//
// Zwei Bauarten in einem Abschnitt, und der Unterschied hat einen Grund:
//
// - **Sperren und Entsperren** enden in einer Umleitung mit `?erledigt=…`. Es
//   gibt nichts mitzunehmen, und eine Meldung, die ein Neuladen überlebt, wäre
//   falsch: Sie gilt einer Handlung, nicht einem Zustand.
// - **Einladen und Neueinrichten** geben einen Link zurück, der **genau einmal**
//   existiert. Über eine Umleitung ließe er sich nur transportieren, indem man
//   ihn zwischenspeichert — also `useActionState`.

export async function setPlatformAccountDisabledAction(
  adminUserId: string,
  disabled: boolean,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  const result = await setPlatformAccountDisabled(session.platform, adminUserId, disabled);

  revalidatePath(ADMIN_ACCOUNTS_PATH);

  redirect(
    `${ADMIN_ACCOUNTS_PATH}?` +
      (result.ok
        ? `erledigt=${disabled ? 'betreiberGesperrt' : 'betreiberEntsperrt'}`
        : `fehler=${result.error.kind}`),
  );
}

/** Übersetzt die Ablehnungen der Kontenverwaltung in einen Satz. */
function platformAccountMessage(
  kind: 'EMAIL_TAKEN' | 'NOT_FOUND' | 'SELF' | 'LAST_ADMINISTRATOR',
): string {
  return kind === 'EMAIL_TAKEN'
    ? messages.admin.emailTaken
    : kind === 'SELF'
      ? messages.admin.accountsErrorSELF
      : kind === 'NOT_FOUND'
        ? messages.admin.accountsErrorNOT_FOUND
        : messages.admin.accountsErrorLAST_ADMINISTRATOR;
}

export async function invitePlatformAccountAction(
  _previous: RecoveryState,
  formData: FormData,
): Promise<RecoveryState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireAdminSessionOrThrow();

  const email = z.string().trim().toLowerCase().pipe(z.email()).safeParse(formData.get('email'));

  if (!email.success) {
    return { status: 'error', message: messages.admin.emailInvalid };
  }

  const result = await invitePlatformAccount(session.platform, email.data);
  if (!result.ok) {
    return { status: 'error', message: platformAccountMessage(result.error.kind) };
  }

  revalidatePath(ADMIN_ACCOUNTS_PATH);

  return {
    status: 'issued',
    heading: messages.admin.accountsInvitedHeading,
    link: `${getEnv().APP_URL}${adminSetupPath(result.value.token)}`,
    delivery: result.value.delivery,
    email: result.value.email,
  };
}

export async function resetPlatformAccountAction(
  adminUserId: string,
  _previous: RecoveryState,
  formData: FormData,
): Promise<RecoveryState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireAdminSessionOrThrow();

  const id = idSchema.safeParse(adminUserId);
  if (!id.success) {
    return { status: 'error', message: messages.admin.accountsErrorNOT_FOUND };
  }

  const result = await resetPlatformAccount(session.platform, id.data);
  if (!result.ok) {
    return { status: 'error', message: platformAccountMessage(result.error.kind) };
  }

  revalidatePath(ADMIN_ACCOUNTS_PATH);

  return {
    status: 'issued',
    heading: messages.admin.accountsResetLinkHeading,
    link: `${getEnv().APP_URL}${adminSetupPath(result.value.token)}`,
    delivery: result.value.delivery,
    email: result.value.email,
  };
}

// ─── Anonymisieren und Bearbeiten (M10/B3, B4) ──────────────────────────────

/**
 * Ein Mandantenkonto unkenntlich machen (FA-ADM-15).
 *
 * Umleitung statt Rückgabewert: Es gibt nichts mitzunehmen, und die Meldung soll
 * ein Neuladen nicht überleben — sie gilt einer Handlung, nicht einem Zustand.
 */
export async function anonymizeAccountAction(
  organizationId: string,
  userId: string,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  const context = await readRequestContext();
  const result = await anonymizeTenantUser(
    session.platform,
    userId,
    session.adminUserId,
    context.ipAddress,
  );

  revalidatePath(adminOrganizationPath(organizationId));

  redirect(
    `${adminOrganizationPath(organizationId)}?` +
      (result.ok ? 'erledigt=anonymisiert' : `fehler=${result.error.kind}`),
  );
}

/** Name und interne Notiz eines Unternehmens ändern (FA-ADM-16). */
export async function updateOrganizationAction(
  organizationId: string,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  const name = z.string().trim().min(1).max(200).safeParse(formData.get('name'));
  const note = z.string().trim().max(2000).safeParse(formData.get('note') ?? '');

  if (!name.success) {
    redirect(`${adminOrganizationPath(organizationId)}?fehler=NAME_MISSING`);
  }

  const context = await readRequestContext();
  const result = await updateManagedOrganization(
    session.platform,
    organizationId,
    { name: name.data, note: note.success ? note.data : null },
    session.adminUserId,
    context.ipAddress,
  );

  revalidatePath(adminOrganizationPath(organizationId));

  redirect(
    `${adminOrganizationPath(organizationId)}?` +
      (result.ok ? 'erledigt=bearbeitet' : `fehler=${result.error.kind}`),
  );
}
