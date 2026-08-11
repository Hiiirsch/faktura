'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { Alert, INPUT_CLASS, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';

import { type LogoFormState, uploadLogoAction } from './actions';

const INITIAL_STATE: LogoFormState = { status: 'idle' };

export function LogoForm({ csrfToken }: { readonly csrfToken: string }): ReactNode {
  const [state, formAction] = useActionState(uploadLogoAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}
      {state.status === 'saved' ? <Alert tone="success">{messages.common.saved}</Alert> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="logo" className="text-ui font-medium">
          {messages.company.logoUpload}
        </label>
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          required
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.company.logoUploadButton}
        </button>
      </div>
    </form>
  );
}
