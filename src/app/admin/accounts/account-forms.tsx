'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { Alert, SECONDARY_BUTTON_CLASS, TextField } from '@/ui/components/form';

import { RedemptionLink } from '../../redemption-link';

import {
  invitePlatformAccountAction,
  type RecoveryState,
  resetPlatformAccountAction,
} from '../actions';

const INITIAL: RecoveryState = { status: 'idle' };


/**
 * Einen weiteren Betreiber einladen (M10/B1, FA-ADM-12).
 *
 * Client-Komponente, weil der Link **nur in dieser einen Antwort** existiert.
 * Gespeichert liegt sein Hash; ein zweites Mal zeigt ihn niemand.
 */
export function InvitePlatformAccountForm({
  csrfToken,
}: {
  readonly csrfToken: string;
}): ReactNode {
  const [state, action, pending] = useActionState(
    invitePlatformAccountAction,
    INITIAL,
  );

  return (
    <form action={action} className="flex max-w-form flex-col gap-4">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'error' ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}
      {state.status === 'issued' ? (
        <RedemptionLink
          heading={state.heading}
          hint={messages.admin.linkOnceOnly}
          link={state.link}
          delivery={state.delivery}
          email={state.email}
        />
      ) : null}

      <TextField
        name="email"
        type="email"
        label={messages.members.inviteEmail}
        required
      />

      <button
        type="submit"
        disabled={pending}
        className={SECONDARY_BUTTON_CLASS}
      >
        {messages.admin.accountsInviteSubmit}
      </button>
    </form>
  );
}

/**
 * Einem vorhandenen Betreiberkonto neue Zugangsdaten ausstellen.
 *
 * **Kein `ConfirmDialog` davor**, anders als beim Sperren: Der Dialog müsste den
 * Vorgang bestätigen, und die Antwort ist der Link — ein Dialog, der ein
 * Formular mit Rückgabewert auslöst, verschluckt ihn. Die Folge steht deshalb im
 * Text über dem Knopf, und der Knopf ist die zweite Handlung.
 */
export function ResetPlatformAccountForm({
  adminUserId,
  csrfToken,
}: {
  readonly adminUserId: string;
  readonly csrfToken: string;
}): ReactNode {
  const [state, action, pending] = useActionState(
    resetPlatformAccountAction.bind(null, adminUserId),
    INITIAL,
  );

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'error' ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}
      {state.status === 'issued' ? (
        <RedemptionLink
          heading={state.heading}
          hint={messages.admin.linkOnceOnly}
          link={state.link}
          delivery={state.delivery}
          email={state.email}
        />
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={SECONDARY_BUTTON_CLASS}
      >
        {messages.admin.accountsReset}
      </button>
    </form>
  );
}
