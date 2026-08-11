'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';

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
      <p className="text-ui text-ink-muted">
        {messages.security.totpScan}
      </p>

      <div
        className="w-fit rounded-control bg-surface p-3"
        // Der QR-Code wird serverseitig als SVG erzeugt und enthält keinerlei
        // Skript — er ist reine Vektorgrafik aus dem eigenen Prozess.
        dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
      />

      <p className="text-ui text-ink-muted">
        {messages.security.totpManualEntry}
      </p>
      <code className="w-fit rounded-control bg-surface-sunken px-2 py-1 font-mono text-ui">
        {secret}
      </code>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-control border border-rule bg-ocker-wash px-4 py-3 text-ui text-ink"
        >
          {errorText(state.message)}
        </p>
      ) : null}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
        <input type="hidden" name="secret" value={secret} />

        <div className="flex flex-col gap-2">
          <label htmlFor="totp-code" className="text-ui font-medium">
            {messages.security.totpCode}
          </label>
          <input
            id="totp-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className={`${INPUT_CLASS} w-40 font-mono tracking-widest`}
          />
        </div>

        <button
          type="submit"
          className={PRIMARY_BUTTON_CLASS}
        >
          {messages.security.totpConfirm}
        </button>
      </form>
    </div>
  );
}

export function RecoveryCodeList({ codes }: { codes: readonly string[] }): ReactNode {
  return (
    <div className="flex flex-col gap-3 rounded-control border border-rule bg-ocker-wash p-4">
      <h3 className="font-medium">{messages.security.recoveryHeading}</h3>
      <p className="text-ui">{messages.security.recoveryIntro}</p>
      <p className="text-ui font-medium">{messages.security.recoveryOnceOnly}</p>
      <ul className="grid grid-cols-1 gap-1 font-mono text-ui sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  );
}
