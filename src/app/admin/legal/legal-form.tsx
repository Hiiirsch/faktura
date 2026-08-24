'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { Alert, PRIMARY_BUTTON_CLASS, TextAreaField } from '@/ui/components/form';
import { SaveToast } from '@/ui/components/toast';

import { type LegalFormState, saveLegalNoticesAction } from './actions';

const INITIAL_STATE: LegalFormState = { status: 'idle' };

export function LegalForm({
  imprint,
  privacyAddendum,
  csrfToken,
}: {
  readonly imprint: string;
  readonly privacyAddendum: string;
  readonly csrfToken: string;
}): ReactNode {
  const [state, formAction] = useActionState(saveLegalNoticesAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}
      <SaveToast
        savedAt={state.status === 'saved' ? state.savedAt : null}
        message={messages.legal.adminSaved}
      />

      <TextAreaField
        name="imprint"
        label={messages.legal.adminImprintLabel}
        hint={messages.legal.adminImprintHint}
        rows={10}
        defaultValue={imprint}
      />

      <TextAreaField
        name="privacyAddendum"
        label={messages.legal.adminPrivacyLabel}
        hint={messages.legal.adminPrivacyHint}
        rows={14}
        defaultValue={privacyAddendum}
      />

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.common.save}
        </button>
      </div>
    </form>
  );
}
