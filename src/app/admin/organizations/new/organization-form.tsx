'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { adminOrganizationPath } from '@/routes';
import {
  Alert,
  PRIMARY_BUTTON_CLASS,
  QUIET_BUTTON_CLASS,
  TextField,
} from '@/ui/components/form';

import { createOrganizationAction, type NewOrganizationState } from '../../actions';

const INITIAL: NewOrganizationState = { status: 'idle' };

/**
 * Ein Unternehmen anlegen (M8, FA-ORG-02, FA-ADM-05).
 *
 * Client-Komponente, weil der Einladungslink **nur in dieser einen Antwort**
 * existiert — dieselbe Bauart wie die Wiederherstellungscodes und die Einladung
 * in der Mitgliederverwaltung. Gespeichert ist nur sein Hash; ein Neuladen zeigt
 * ihn nicht wieder.
 *
 * Das Formular verschwindet nach dem Anlegen. Es stehen zu lassen hieße
 * anzubieten, dasselbe Unternehmen ein zweites Mal anzulegen, während der Link
 * zum ersten noch daneben steht.
 */
export function NewOrganizationForm({ csrfToken }: { readonly csrfToken: string }): ReactNode {
  const [state, formAction] = useActionState(createOrganizationAction, INITIAL);

  if (state.status === 'created') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          {messages.admin.createdHeading} — {state.email}
        </Alert>

        <div className="flex flex-col gap-2 rounded-control border border-rule bg-surface-sunken p-4">
          <span className="text-label font-semibold uppercase text-ink-faint">
            {messages.admin.createdHeading}
          </span>
          {/*
            `readonly`-Feld statt Absatz: So nimmt ein Doppelklick den Link
            vollständig auf. Ein „Kopieren"-Knopf bräuchte die Clipboard-API, und
            die ist an eine sichere Herkunft gebunden — in einer selbstgehosteten
            Installation ohne Zertifikat also nicht verlässlich da.
          */}
          <input
            readOnly
            value={state.link}
            aria-label={messages.admin.createdHeading}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            className="w-full rounded-control border border-rule bg-surface px-3 py-2 font-mono text-data text-ink"
          />
          <p className="text-small text-ink-muted">{messages.admin.createdOnceOnly}</p>
        </div>

        <div>
          <Link
            href={adminOrganizationPath(state.organizationId)}
            className={QUIET_BUTTON_CLASS}
          >
            {messages.admin.open}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}

      <TextField
        name="name"
        label={messages.admin.organizationName}
        hint={messages.admin.organizationNameHint}
        required
      />
      <TextField
        name="ownerEmail"
        label={messages.admin.ownerEmail}
        type="email"
        autoComplete="off"
        required
      />

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.admin.createSubmit}
        </button>
      </div>
    </form>
  );
}
