'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { authorize } from '@/application/auth/authorize';
import { readRequestContext } from '@/application/auth/request-context';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import { inviteMember, withdrawInvitation } from '@/application/members/invitation-service';
import {
  changeMemberRole,
  type MemberError,
  setMemberDisabled,
  startPasswordReset,
} from '@/application/members/member-service';
import type { Delivery } from '@/application/notifications/deliver';
import { messages } from '@/i18n/de';
import { getEnv } from '@/infrastructure/config/env';
import { invitationPath, MEMBERS_SETTINGS_PATH, passwordResetPath } from '@/routes';

const id = z.string().trim().min(1).max(64);

/**
 * Der vollständige Link, wie er weitergegeben wird.
 *
 * Aus `APP_URL` und nicht aus der Anfrage: Ein Link, der aus einem `Host`-Header
 * entsteht, zeigt auf das, was der Aufrufer behauptet. Bei einem Nachweis, den
 * jemand anklicken soll, ist das der Unterschied zwischen einer Einladung und
 * einem Umleitungsangriff.
 */
function absolute(pathname: string): string {
  return `${getEnv().APP_URL.replace(/\/$/u, '')}${pathname}`;
}

function describe(error: MemberError): string {
  switch (error.kind) {
    case 'NOT_FOUND':
      return messages.members.errorNOT_FOUND;
    case 'ROLE_NOT_FOUND':
      return messages.members.errorROLE_NOT_FOUND;
    case 'LAST_ADMINISTRATOR':
      return messages.members.errorLAST_ADMINISTRATOR;
    case 'SELF':
      return messages.members.errorSELF;
  }
}

// ─── Einladen: der Link erscheint genau einmal ──────────────────────────────

export type InviteFormState =
  | { readonly status: 'idle' }
  /**
   * Der einzige Zustand, in dem der Token existiert.
   *
   * Er lebt in der Antwort einer Server Action und nirgends sonst — dieselbe
   * Bauart wie die Wiederherstellungscodes. Ein Neuladen der Seite zeigt ihn
   * nicht wieder, weil es ihn nicht mehr gibt.
   */
  | {
      readonly status: 'invited';
      readonly email: string;
      readonly link: string;
      /** Was aus der Zustellung wurde (M14); der Link steht trotzdem da. */
      readonly delivery: Delivery;
    }
  | { readonly status: 'error'; readonly message: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(200)),
  roleId: id,
});

export async function inviteMemberAction(
  _previous: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'organization.administer');

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    roleId: formData.get('roleId'),
  });

  if (!parsed.success) {
    // Welche der beiden Meldungen passt, entscheidet die fehlende Angabe: Ohne
    // Rolle ist die Rolle das Problem, sonst die Adresse.
    const role = formData.get('roleId');
    const hasRole = typeof role === 'string' && role.trim().length > 0;

    return {
      status: 'error',
      message: hasRole ? messages.members.inviteEmailInvalid : messages.members.inviteRoleMissing,
    };
  }

  const context = await readRequestContext();
  const result = await inviteMember(
    authorized,
    parsed.data,
    session.userId,
    context.ipAddress,
  );

  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.error.kind === 'EMAIL_TAKEN'
          ? messages.members.inviteEmailTaken
          : messages.members.errorROLE_NOT_FOUND,
    };
  }

  revalidatePath(MEMBERS_SETTINGS_PATH);

  return {
    status: 'invited',
    email: result.value.invitation.email,
    link: absolute(invitationPath(result.value.token)),
    delivery: result.value.delivery,
  };
}

// ─── Passwortzurücksetzung: ebenfalls genau einmal ──────────────────────────

export type ResetFormState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'created';
      readonly email: string;
      readonly link: string;
      readonly delivery: Delivery;
    }
  | { readonly status: 'error'; readonly message: string };

export async function resetMemberPasswordAction(
  _previous: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'organization.administer');

  const memberId = id.safeParse(formData.get('memberId'));
  if (!memberId.success) {
    return { status: 'error', message: messages.members.errorNOT_FOUND };
  }

  const context = await readRequestContext();
  const result = await startPasswordReset(
    authorized,
    memberId.data,
    session.userId,
    context.ipAddress,
  );

  if (!result.ok) {
    return { status: 'error', message: describe(result.error) };
  }

  const email = z.string().trim().max(200).safeParse(formData.get('email'));

  return {
    status: 'created',
    delivery: result.value.delivery,
    email: email.success ? email.data : '',
    link: absolute(passwordResetPath(result.value.token)),
  };
}

// ─── Die übrigen Handlungen: Umleitung mit Rückmeldung in der Adresse ───────
//
// Kein Rückkanal nötig, kein Geheimnis zu zeigen. Die Meldung steht in der
// Adresse (`?erledigt=`) wie bei den Schnellaktionen der Rechnungsliste: Ein
// POST endet besser mit einer Umleitung, und die Meldung soll ein Neuladen
// nicht überleben — sie gilt einer Handlung, nicht einem Zustand.

function back(done: string, failed?: string): never {
  const query = failed === undefined ? `erledigt=${done}` : `fehler=${failed}`;
  redirect(`${MEMBERS_SETTINGS_PATH}?${query}`);
}

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'organization.administer');

  const memberId = id.safeParse(formData.get('memberId'));
  const roleId = id.safeParse(formData.get('roleId'));
  if (!memberId.success || !roleId.success) {
    back('', 'NOT_FOUND');
  }

  const context = await readRequestContext();
  const result = await changeMemberRole(
    authorized,
    memberId.data,
    roleId.data,
    session.userId,
    context.ipAddress,
  );

  revalidatePath(MEMBERS_SETTINGS_PATH);
  back('rolle', result.ok ? undefined : result.error.kind);
}

/** Sperren und Entsperren in einer Aktion — die Kennung ist gebunden. */
export async function setMemberDisabledAction(
  memberId: string,
  disabled: boolean,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'organization.administer');

  const context = await readRequestContext();
  const result = await setMemberDisabled(
    authorized,
    memberId,
    disabled,
    session.userId,
    context.ipAddress,
  );

  revalidatePath(MEMBERS_SETTINGS_PATH);
  back(disabled ? 'gesperrt' : 'entsperrt', result.ok ? undefined : result.error.kind);
}

export async function withdrawInvitationAction(
  invitationId: string,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'organization.administer');

  const context = await readRequestContext();
  await withdrawInvitation(authorized, invitationId, session.userId, context.ipAddress);

  revalidatePath(MEMBERS_SETTINGS_PATH);
  back('zurueckgezogen');
}
