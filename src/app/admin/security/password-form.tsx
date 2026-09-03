'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { Alert, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';
import { PasswordField } from '@/ui/components/password-field';
import { SaveToast } from '@/ui/components/toast';

import { changeAdminPasswordAction, type PasswordFormState } from './actions';

const INITIAL: PasswordFormState = { status: 'idle' };

/**
 * Das eigene Passwort wechseln (M14.1, FA-ADM-18).
 *
 * Client-Komponente wegen des Rückkanals: Der Wechsel kann fehlschlagen — an
 * einem falschen bisherigen Passwort oder an der Passwortregel —, und ein
 * Fehler gehört an das Formular und nicht in die Adresszeile (FA-UI-10). Die
 * Bestätigung dagegen ist ein Toast (M12): Der Knopf steht am Ende eines
 * Abschnitts, und eine Meldung über dem ersten Feld sähe man nicht.
 *
 * Beide Felder sind `PasswordField` — mit Auge, ohne Vorbelegung.
 */
export function AdminPasswordForm({ csrfToken }: { readonly csrfToken: string }): ReactNode {
  const [state, formAction] = useActionState(changeAdminPasswordAction, INITIAL);

  return (
    <form action={formAction} className="flex max-w-form flex-col gap-4">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}

      <PasswordField
        name="currentPassword"
        label={messages.adminSecurity.passwordCurrent}
        autoComplete="current-password"
        required
      />

      <PasswordField
        name="newPassword"
        label={messages.adminSecurity.passwordNew}
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={messages.adminSecurity.passwordHint.replace('{min}', String(MIN_PASSWORD_LENGTH))}
      />

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.adminSecurity.passwordSubmit}
        </button>
      </div>

      <SaveToast
        savedAt={state.status === 'saved' ? state.savedAt : null}
        message={state.status === 'saved' ? state.message : messages.common.saved}
      />
    </form>
  );
}
