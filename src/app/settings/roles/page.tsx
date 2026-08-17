import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requirePermission } from '@/application/auth/authorize';
import { getRole, getRoles } from '@/application/roles/role-service';
import {
  ALL_PERMISSION_KEYS,
  PERMITTED,
  type PermissionKey,
  type PolicySubject,
  splitPermissionKey,
} from '@/domain/policy/can';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { ROLES_SETTINGS_PATH } from '@/routes';
import { ConfirmDialog } from '@/ui/components/dialog';
import {
  Alert,
  NoScriptNotice,
  QUIET_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/ui/components/form';
import { EmptyState, PageHeader } from '@/ui/components/page';
import { DataTable } from '@/ui/components/table';
import { Toast } from '@/ui/components/toast';

import { AppShell } from '../../app-shell';
import { deleteRoleAction } from './actions';
import { type PermissionGroup, RoleForm } from './role-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.roles.title} · ${messages.app.name}` };

/**
 * Die Gruppen des Formulars entstehen **aus dem Katalog**, nicht aus einer
 * zweiten Liste (M8, FA-ROLE-06).
 *
 * Wer in `PERMITTED` eine Zeile ergänzt, sieht sie hier — ohne diese Datei
 * anzufassen. Nur die deutschen Beschriftungen stehen daneben, und die gehören
 * ohnehin in die Anzeigeschicht (CLAUDE.md, Leitplanke 2). Fehlt eine, fällt das
 * beim Übersetzen auf: `messages.roles.subject` ist vollständig getypt.
 */
function permissionGroups(): readonly PermissionGroup[] {
  return Object.keys(PERMITTED).map((subject) => {
    const key = subject as PolicySubject;

    return {
      subject,
      label: messages.roles.subject[key],
      entries: ALL_PERMISSION_KEYS.filter(
        (permission) => splitPermissionKey(permission).subject === key,
      ).map((permission) => ({
        key: permission,
        label: messages.roles.action[splitPermissionKey(permission).action],
      })),
    };
  });
}

function noticeFor(done: string | undefined): string | null {
  switch (done) {
    case 'angelegt':
      return messages.roles.created;
    case 'geloescht':
      return messages.roles.deleted;
    default:
      return null;
  }
}

function errorFor(kind: string | undefined): string | null {
  switch (kind) {
    case 'IN_USE':
      return messages.roles.errorIN_USE;
    case 'NOT_FOUND':
      return messages.roles.errorNOT_FOUND;
    case 'LAST_ADMINISTRATOR':
      return messages.roles.errorLAST_ADMINISTRATOR;
    default:
      return null;
  }
}

/**
 * Rollen eines Unternehmens (M8, FA-ROLE-01, -02).
 *
 * Eine Seite und nicht zwei: Anlegen, Bearbeiten und Löschen stehen
 * untereinander, weil eine Rolle aus zwei Zeilen Text und einer Reihe von
 * Kästchen besteht. Eine eigene Unterseite je Rolle brächte einen Seitenwechsel
 * für eine Handlung, die in dieselbe Ansicht passt; welche Rolle bearbeitet
 * wird, steht in `?rolle=`.
 */
export default async function RolesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requirePermission('organization.administer');
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const params = await searchParams;
  const selectedId = typeof params.rolle === 'string' ? params.rolle : null;

  const [roles, selected] = await Promise.all([
    getRoles(session.organization),
    selectedId === null ? null : getRole(session.organization, selectedId),
  ]);

  const notice = noticeFor(typeof params.erledigt === 'string' ? params.erledigt : undefined);
  const failure = errorFor(typeof params.fehler === 'string' ? params.fehler : undefined);
  const groups = permissionGroups();
  const total = ALL_PERMISSION_KEYS.length;

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={ROLES_SETTINGS_PATH}>
      <PageHeader title={messages.roles.heading} description={messages.roles.intro} />

      {notice === null ? null : <Toast message={notice} />}
      {failure === null ? null : <Alert tone="error">{failure}</Alert>}

      <NoScriptNotice message={messages.common.noScript} />

      {roles.length === 0 ? (
        <EmptyState message={messages.roles.empty} />
      ) : (
        <DataTable
          caption={messages.roles.heading}
          rows={roles}
          rowKey={(role) => role.id}
          columns={[
            {
              key: 'name',
              header: messages.roles.columnName,
              cell: (role) => (
                <span className="flex flex-col">
                  <span className="font-medium text-ink">{role.name}</span>
                  {role.description === null ? null : (
                    <span className="text-small text-ink-muted">{role.description}</span>
                  )}
                </span>
              ),
            },
            {
              key: 'permissions',
              header: messages.roles.columnPermissions,
              fit: true,
              cell: (role) => (
                <span className="text-ink-muted">
                  {messages.roles.permissionCount
                    .replace('{count}', String(role.permissions.length))
                    .replace('{total}', String(total))}
                </span>
              ),
            },
            {
              key: 'members',
              header: messages.roles.columnMembers,
              numeric: true,
              fit: true,
              cell: (role) => role.memberCount,
            },
            /*
              Sichtbare Aktionsspalte statt der von `DataTable`: Dort liegen die
              Aktionen unter `opacity-0` bis Hover oder Fokus (FA-UI-19), und
              „Bearbeiten" ist hier der einzige Weg, eine Rolle zu ändern.
            */
            {
              key: 'actions',
              header: messages.common.actions,
              fit: true,
              cell: (role) => (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`${ROLES_SETTINGS_PATH}?rolle=${encodeURIComponent(role.id)}`}
                    className={QUIET_BUTTON_CLASS}
                  >
                    {messages.common.edit}
                  </Link>

                  {/*
                    Löschen erscheint nur bei einer Rolle, die niemand trägt.
                    `ON DELETE RESTRICT` würde es ohnehin abweisen; ein Knopf,
                    der immer scheitert, ist kein Angebot.
                  */}
                  {role.memberCount > 0 ? null : (
                    <form action={deleteRoleAction.bind(null, role.id)}>
                      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                      <ConfirmDialog
                        title={messages.roles.deleteConfirmTitle}
                        message={messages.roles.deleteConfirm}
                        confirmLabel={messages.roles.delete}
                        tone="danger"
                        trigger={
                          <button type="submit" className={QUIET_BUTTON_CLASS}>
                            {messages.roles.delete}
                          </button>
                        }
                      />
                    </form>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-medium">
          {selected === null ? messages.roles.createHeading : messages.roles.editHeading}
        </h2>

        {/*
          `key` erzwingt einen neuen Formularzustand beim Wechsel der Rolle:
          Ohne ihn behielte React die Ankreuzungen der vorher bearbeiteten
          Rolle, weil die Komponente dieselbe bleibt.
        */}
        <RoleForm
          key={selected?.id ?? 'neu'}
          csrfToken={csrfToken}
          groups={groups}
          role={
            selected === null
              ? undefined
              : {
                  id: selected.id,
                  name: selected.name,
                  description: selected.description,
                  permissionKeys: selected.permissions.map(
                    (entry) => entry.permissionKey as PermissionKey,
                  ),
                }
          }
        />
      </section>
    </AppShell>
  );
}
