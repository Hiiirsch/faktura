'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { BASE_PERMISSIONS, type PermissionKey, splitPermissionKey } from '@/domain/policy/can';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import {
  Alert,
  FOCUS_RING,
  PRIMARY_BUTTON_CLASS,
  TextAreaField,
  TextField,
} from '@/ui/components/form';
import { SaveToast } from '@/ui/components/toast';

import { createRoleAction, type RoleFormState, saveRoleAction } from './actions';

const INITIAL: RoleFormState = { status: 'idle' };

/** Die Schlüssel, gruppiert nach Gegenstand — die Reihenfolge kommt vom Katalog. */
export type PermissionGroup = {
  readonly subject: string;
  readonly label: string;
  readonly entries: readonly { readonly key: PermissionKey; readonly label: string }[];
};

const BASE = new Set<string>(BASE_PERMISSIONS);

/**
 * Das Rollenformular (M8, FA-ROLE-01).
 *
 * **Die Grundrechte stehen mit, aber nicht zur Wahl.** Jedes Konto trägt sie
 * ohnehin (`BASE_PERMISSIONS`); als abwählbares Kästchen wären sie ein
 * Versprechen, das `actorOf()` nicht hält — es fügt sie immer hinzu. Sie ganz zu
 * verschweigen wäre die andere Hälfte des Fehlers: Dann fehlte in der Liste,
 * was ein Konto darf.
 *
 * Client-Komponente, weil ein Validierungsfehler die Ankreuzungen erhalten soll.
 * Ohne JavaScript trägt die Seite einen `<NoScriptNotice>`.
 */
export function RoleForm({
  csrfToken,
  groups,
  role,
}: {
  readonly csrfToken: string;
  readonly groups: readonly PermissionGroup[];
  /** Fehlt beim Anlegen. */
  readonly role?:
    | {
        readonly id: string;
        readonly name: string;
        readonly description: string | null;
        readonly permissionKeys: readonly string[];
      }
    | undefined;
}): ReactNode {
  const [state, formAction] = useActionState(
    role === undefined ? createRoleAction : saveRoleAction,
    INITIAL,
  );

  const held = new Set(role?.permissionKeys ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
      {role === undefined ? null : <input type="hidden" name="roleId" value={role.id} />}

      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}
      <SaveToast
        savedAt={state.status === 'saved' ? state.savedAt : null}
        message={messages.roles.saved}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="name"
          label={messages.roles.name}
          hint={messages.roles.nameHint}
          defaultValue={role?.name ?? ''}
          required
        />
        <TextAreaField
          name="description"
          label={messages.roles.description}
          rows={2}
          defaultValue={role?.description ?? ''}
        />
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-ui font-medium text-ink">{messages.roles.permissions}</legend>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.subject} className="flex flex-col gap-2">
              <span className="text-label font-semibold uppercase text-ink-faint">
                {group.label}
              </span>

              {group.entries.map((entry) => {
                const isBase = BASE.has(entry.key);
                const { action } = splitPermissionKey(entry.key);

                return (
                  <label key={entry.key} className="flex items-start gap-2 text-ui text-ink">
                    <input
                      type="checkbox"
                      name="permissions"
                      value={entry.key}
                      defaultChecked={isBase || held.has(entry.key)}
                      disabled={isBase}
                      className={`mt-0.5 size-4 rounded-control border border-rule accent-accent ${FOCUS_RING}`}
                    />
                    <span className="flex flex-col">
                      <span>{entry.label}</span>
                      {isBase ? (
                        <span className="text-small text-ink-faint">
                          {messages.roles.baseHint}
                        </span>
                      ) : null}
                    </span>
                    {/*
                      Ein abgeschaltetes Kästchen wird nicht mitgesendet. Das
                      Grundrecht reist deshalb in einem versteckten Feld mit —
                      sonst entzöge das Speichern es der Rolle, und die
                      Rollenliste zeigte danach weniger, als das Konto kann.
                    */}
                    {isBase ? (
                      <input type="hidden" name="permissions" value={entry.key} />
                    ) : null}
                    <span className="sr-only">{action}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </fieldset>

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {role === undefined ? messages.roles.submitCreate : messages.roles.submitSave}
        </button>
      </div>
    </form>
  );
}
