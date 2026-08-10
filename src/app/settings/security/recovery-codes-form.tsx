'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';

import { regenerateRecoveryCodesAction, type TotpFormState } from './actions';
import { RecoveryCodeList } from './totp-setup-form';

const INITIAL_STATE: TotpFormState = { status: 'idle' };

/**
 * Neue Wiederherstellungscodes erzeugen. Wie bei der Ersteinrichtung eine
 * Client-Komponente, weil die Codes nur in dieser einen Antwort im Klartext
 * vorliegen.
 */
export function RecoveryCodesForm({
  csrfToken,
  unusedCount,
}: {
  csrfToken: string;
  unusedCount: number;
}): ReactNode {
  const [state, formAction] = useActionState(regenerateRecoveryCodesAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-3">
      {state.status === 'codes' ? (
        <RecoveryCodeList codes={state.codes} />
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {messages.security.recoveryRemaining.replace('{count}', String(unusedCount))}
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {messages.security.recoveryRegenerate}
        </button>
      </form>
    </div>
  );
}
