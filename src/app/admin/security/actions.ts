'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import {
  type AdminPasswordError,
  changeAdminPassword,
  revokeAdminSession,
  revokeOtherAdminSessions,
} from '@/application/admin/admin-security';
import { requireAdminSessionOrThrow } from '@/application/admin/require-admin-session';
import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { removePasskey } from '@/application/auth/passkey-registration';
import { readRequestContext } from '@/application/auth/request-context';
import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { messages } from '@/i18n/de';
import { ADMIN_SECURITY_PATH } from '@/routes';

/**
 * Rückmeldung über die Adresse — dasselbe Muster wie auf der Sicherheitsseite
 * der Mandanten (M5.8): Die stillen Aktionen haben keinen Rückkanal, ein POST
 * endet besser mit einer Umleitung, und die Meldung soll ein Neuladen **nicht**
 * überleben.
 */
function done(key: string): never {
  redirect(`${ADMIN_SECURITY_PATH}?erledigt=${encodeURIComponent(key)}`);
}

const idSchema = z.string().trim().min(1).max(64);

export type PasswordFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'saved'; readonly message: string; readonly savedAt: number }
  | { readonly status: 'error'; readonly message: string };

/**
 * Der Passwortwechsel läuft **nicht** über `done()`, sondern über einen
 * Rückkanal: Er kann fehlschlagen, und ein Fehler gehört an das Formular
 * (FA-UI-10) und nicht in eine Adresszeile.
 */
export async function changeAdminPasswordAction(
  _previous: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireAdminSessionOrThrow();
  const context = await readRequestContext();

  const currentPassword = formData.get('currentPassword');
  const newPassword = formData.get('newPassword');
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return { status: 'error', message: messages.adminSecurity.passwordWrong };
  }

  const result = await changeAdminPassword(
    session.platform,
    session.sessionId,
    { currentPassword, newPassword },
    context.ipAddress,
  );

  if (!result.ok) {
    return { status: 'error', message: passwordErrorMessage(result.error) };
  }

  const message =
    result.value.endedSessions === 0
      ? messages.adminSecurity.passwordChanged
      : messages.adminSecurity.passwordChangedWithSessions.replace(
          '{count}',
          String(result.value.endedSessions),
        );

  // Der Zeitstempel ist der `key` des Toasts: `useActionState` behält den
  // vorigen Zustand, und zweimal „saved" hintereinander bliebe sonst stumm
  // (M12).
  return { status: 'saved', message, savedAt: Date.now() };
}

function passwordErrorMessage(error: AdminPasswordError): string {
  switch (error.kind) {
    case 'WRONG_PASSWORD':
      return messages.adminSecurity.passwordWrong;
    case 'PASSWORD': {
      // Genannt wird der erste Verstoß: Drei Sätze übereinander sagen nicht
      // mehr als einer, und der erste ist der, den man zuerst behebt.
      const first = error.violations[0]?.kind;
      if (first === 'COMPROMISED') {
        return messages.adminSecurity.passwordCompromised;
      }
      if (first === 'TOO_LONG') {
        return messages.adminSecurity.passwordTooLong;
      }
      return messages.adminSecurity.passwordTooShort.replace('{min}', String(MIN_PASSWORD_LENGTH));
    }
    default:
      return messages.common.rejected;
  }
}

export async function revokeAdminSessionAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  const parsed = idSchema.safeParse(formData.get('sessionId'));
  if (!parsed.success) {
    return;
  }

  await revokeAdminSession(session.platform, parsed.data);
  done('sitzung-beendet');
}

export async function revokeOtherAdminSessionsAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  await revokeOtherAdminSessions(session.platform, session.sessionId);
  done('andere-sitzungen-beendet');
}

export async function removeAdminPasskeyAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireAdminSessionOrThrow();

  const parsed = idSchema.safeParse(formData.get('passkeyId'));
  if (!parsed.success) {
    return;
  }

  await removePasskey(
    { kind: 'admin', id: session.adminUserId, email: session.email, name: null },
    parsed.data,
  );
  done('passkey-entfernt');
}
