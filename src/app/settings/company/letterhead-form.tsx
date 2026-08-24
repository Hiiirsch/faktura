'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { FileField } from '@/ui/components/file-field';
import { Alert, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';
import { SaveToast } from '@/ui/components/toast';

import { type LetterheadFormState, uploadLetterheadAction } from './actions';

const INITIAL_STATE: LetterheadFormState = { status: 'idle' };

export function LetterheadForm({ csrfToken }: { readonly csrfToken: string }): ReactNode {
  const [state, formAction] = useActionState(uploadLetterheadAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}
      <SaveToast
        savedAt={state.status === 'saved' ? state.savedAt : null}
        message={messages.company.letterheadSaved}
      />

      <FileField
        name="letterhead"
        label={messages.company.letterheadUpload}
        accept="application/pdf"
        required
      />

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.company.letterheadUploadButton}
        </button>
      </div>
    </form>
  );
}
