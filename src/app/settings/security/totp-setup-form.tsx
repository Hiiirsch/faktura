'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';

import { confirmTotpAction, type TotpFormState } from './actions';

const INITIAL_STATE: TotpFormState = { status: 'idle' };

function errorText(message: string): string {
  return message === 'ALREADY_ENABLED'
    ? messages.security.totpAlreadyEnabled
    : messages.security.totpInvalidCode;
}

/**
 * Die Bestätigung läuft als Client-Komponente, weil die
 * Wiederherstellungscodes genau einmal entstehen und unmittelbar nach dem
 * Absenden angezeigt werden müssen. Über eine Weiterleitung ließen sie sich
 * nur transportieren, indem man sie zwischenspeichert — das widerspräche der
 * Zusage, dass ausschließlich ihr Hash gespeichert wird.
 */
export function TotpSetupForm({
  secret,
  csrfToken,
  qrCodeSvg,
}: {
  secret: string;
  csrfToken: string;
  qrCodeSvg: string;
}): ReactNode {
  const [state, formAction] = useActionState(confirmTotpAction, INITIAL_STATE);

  if (state.status === 'codes') {
    return <RecoveryCodeList codes={state.codes} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {messages.security.totpScan}
      </p>

      <div
        className="w-fit rounded-md bg-white p-3"
        // Der QR-Code wird serverseitig als SVG erzeugt und enthält keinerlei
        // Skript — er ist reine Vektorgrafik aus dem eigenen Prozess.
        dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
      />

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {messages.security.totpManualEntry}
      </p>
      <code className="w-fit rounded bg-neutral-100 px-2 py-1 font-mono text-sm dark:bg-neutral-800">
        {secret}
      </code>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {errorText(state.message)}
        </p>
      ) : null}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
        <input type="hidden" name="secret" value={secret} />

        <div className="flex flex-col gap-2">
          <label htmlFor="totp-code" className="text-sm font-medium">
            {messages.security.totpCode}
          </label>
          <input
            id="totp-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className="w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono tracking-widest text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {messages.security.totpConfirm}
        </button>
      </form>
    </div>
  );
}

export function RecoveryCodeList({ codes }: { codes: readonly string[] }): ReactNode {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
      <h3 className="font-medium">{messages.security.recoveryHeading}</h3>
      <p className="text-sm">{messages.security.recoveryIntro}</p>
      <p className="text-sm font-medium">{messages.security.recoveryOnceOnly}</p>
      <ul className="grid grid-cols-1 gap-1 font-mono text-sm sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  );
}
