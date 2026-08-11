'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { Alert, PRIMARY_BUTTON_CLASS, TextField } from '@/ui/components/form';

import { type NumberingFormState, saveNumberFormatAction, setStartValueAction } from './actions';

const INITIAL_STATE: NumberingFormState = { status: 'idle' };

export function NumberFormatForm({
  format,
  csrfToken,
}: {
  readonly format: string;
  readonly csrfToken: string;
}): ReactNode {
  const [state, formAction] = useActionState(saveNumberFormatAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'saved' ? <Alert tone="success">{messages.common.saved}</Alert> : null}
      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}

      <TextField
        name="format"
        label={messages.numbering.format}
        hint={messages.numbering.formatHint}
        required
        defaultValue={format}
      />

      <p className="text-ui text-ink-muted">
        {messages.numbering.formatChangeWarning}
      </p>

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.common.save}
        </button>
      </div>
    </form>
  );
}

export function StartValueForm({
  suggestedScope,
  csrfToken,
}: {
  readonly suggestedScope: string;
  readonly csrfToken: string;
}): ReactNode {
  const [state, formAction] = useActionState(setStartValueAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'saved' ? (
        <Alert tone="success">{messages.numbering.startValueSet}</Alert>
      ) : null}
      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="scope"
          label={messages.numbering.startValueScope}
          hint={messages.numbering.startValueScopeHint}
          required
          defaultValue={suggestedScope}
        />
        <TextField
          name="startValue"
          label={messages.numbering.startValue}
          type="number"
          min={0}
          required
          defaultValue="0"
        />
      </div>

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.numbering.startValueSubmit}
        </button>
      </div>
    </form>
  );
}
