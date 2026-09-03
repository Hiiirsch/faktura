'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import {
  Alert,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SelectField,
  type SelectOption,
  TextField,
} from '@/ui/components/form';

import { RedemptionLink } from '../../redemption-link';

import {
  inviteMemberAction,
  type InviteFormState,
  resetMemberPasswordAction,
  type ResetFormState,
} from './actions';

const INVITE_INITIAL: InviteFormState = { status: 'idle' };

/**
 * Ein Mitglied einladen.
 *
 * Client-Komponente, weil der Einladungslink **nur in dieser einen Antwort**
 * existiert — dieselbe Bauart wie die Wiederherstellungscodes. Ein Neuladen
 * zeigt ihn nicht wieder, weil es ihn nicht mehr gibt: Gespeichert ist nur sein
 * Hash.
 */
export function InviteForm({
  csrfToken,
  roles,
}: {
  readonly csrfToken: string;
  readonly roles: readonly SelectOption[];
}): ReactNode {
  const [state, formAction] = useActionState(inviteMemberAction, INVITE_INITIAL);

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}

      {state.status === 'invited' ? (
        <>
          <Alert tone="success">
            {messages.members.inviteLinkHeading} — {state.email}
          </Alert>
          <RedemptionLink
            heading={messages.members.inviteLinkHeading}
            hint={messages.members.inviteLinkOnceOnly}
            link={state.link}
            delivery={state.delivery}
            email={state.email}
          />
        </>
      ) : null}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="email"
            label={messages.members.inviteEmail}
            type="email"
            autoComplete="off"
            required
          />
          <SelectField name="roleId" label={messages.members.inviteRole} options={roles} required />
        </div>

        <div>
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            {messages.members.inviteSubmit}
          </button>
        </div>
      </form>
    </div>
  );
}

const RESET_INITIAL: ResetFormState = { status: 'idle' };

/**
 * Eine Passwortzurücksetzung auslösen.
 *
 * Bewusst **ein** Formular mit Kontoauswahl statt eines Knopfes je Zeile: Der
 * Link muss angezeigt werden, und eine Client-Komponente je Tabellenzeile würde
 * die Mitgliederliste vollständig in den Browser verlagern, obwohl sie eine
 * Server-Komponente sein kann.
 */
export function PasswordResetForm({
  csrfToken,
  members,
}: {
  readonly csrfToken: string;
  readonly members: readonly SelectOption[];
}): ReactNode {
  const [state, formAction] = useActionState(resetMemberPasswordAction, RESET_INITIAL);

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}

      {state.status === 'created' ? (
        <RedemptionLink
          heading={messages.members.resetLinkHeading}
          hint={messages.members.resetLinkOnceOnly}
          link={state.link}
          delivery={state.delivery}
          email={state.email}
        />
      ) : null}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <SelectField
          name="memberId"
          label={messages.members.columnEmail}
          options={members}
          required
        />

        <div>
          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
            {messages.members.resetPassword}
          </button>
        </div>
      </form>
    </div>
  );
}
