'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import {
  Alert,
  SECONDARY_BUTTON_CLASS,
  SelectField,
  type SelectOption,
  TextField,
} from '@/ui/components/form';

import {
  type RecoveryState,
  reissueInvitationAction,
  resetTenantPasswordAction,
} from '../../actions';

const INITIAL: RecoveryState = { status: 'idle' };

/**
 * Ein Link, der genau einmal zu sehen ist.
 *
 * Wortgleich zur Fassung in der Mitgliederverwaltung — `readonly`-Feld statt
 * Absatz, damit ein Doppelklick ihn vollständig aufnimmt. Ein „Kopieren"-Knopf
 * bräuchte die Clipboard-API, und die ist an eine sichere Herkunft gebunden.
 */
function RedemptionLink({
  heading,
  link,
}: {
  readonly heading: string;
  readonly link: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-2 rounded-control border border-rule bg-surface-sunken p-4">
      <span className="text-label font-semibold uppercase text-ink-faint">{heading}</span>
      <input
        readOnly
        value={link}
        aria-label={heading}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        className="w-full rounded-control border border-rule bg-surface px-3 py-2 font-mono text-data text-ink"
      />
      <p className="text-small text-ink-muted">{messages.admin.linkOnceOnly}</p>
    </div>
  );
}

/**
 * Die Einladung eines Unternehmens erneut ausstellen (M9/B1, FA-ADM-09).
 *
 * Client-Komponente, weil der Link **nur in dieser einen Antwort** existiert.
 */
export function ReissueInvitationForm({
  organizationId,
  csrfToken,
  defaultEmail,
}: {
  readonly organizationId: string;
  readonly csrfToken: string;
  /** Die Adresse der offenen Einladung, falls es eine gibt. */
  readonly defaultEmail: string;
}): ReactNode {
  const [state, formAction] = useActionState(
    reissueInvitationAction.bind(null, organizationId),
    INITIAL,
  );

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}
      {state.status === 'issued' ? (
        <RedemptionLink heading={state.heading} link={state.link} />
      ) : null}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <TextField
          name="email"
          label={messages.admin.ownerEmail}
          type="email"
          autoComplete="off"
          defaultValue={defaultEmail}
          required
        />

        <div>
          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
            {messages.admin.reissueSubmit}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Das Passwort eines Mandantenkontos zurücksetzen (M9/B1, FA-ADM-10).
 *
 * **Der Eingriff mit der größten Reichweite**, den der Betreiber hat. Er bekommt
 * damit keine Sitzung und kein Passwort — nur einen Nachweis, den ein Mensch
 * einlöst. Dass er ihn selbst einlösen könnte, ist der bewusst in Kauf genommene
 * Preis; deshalb steht der Vorgang im Protokoll des Unternehmens, und alle
 * Sitzungen des Kontos enden dabei.
 */
export function TenantPasswordResetForm({
  organizationId,
  csrfToken,
  accounts,
}: {
  readonly organizationId: string;
  readonly csrfToken: string;
  readonly accounts: readonly SelectOption[];
}): ReactNode {
  const [state, formAction] = useActionState(
    resetTenantPasswordAction.bind(null, organizationId),
    INITIAL,
  );

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}
      {state.status === 'issued' ? (
        <RedemptionLink heading={state.heading} link={state.link} />
      ) : null}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <SelectField
          name="userId"
          label={messages.admin.tenantResetAccount}
          options={accounts}
          required
        />

        <div>
          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
            {messages.admin.tenantResetSubmit}
          </button>
        </div>
      </form>
    </div>
  );
}
