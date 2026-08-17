import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { requirePermission } from '@/application/auth/authorize';
import { getOpenInvitations } from '@/application/members/invitation-service';
import { getMembers } from '@/application/members/member-service';
import { getRoles } from '@/application/roles/role-service';
import { getAppTimeZone } from '@/application/system/display-settings';
import { invitationDaysRemaining } from '@/domain/auth/invitation-policy';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { MEMBERS_SETTINGS_PATH } from '@/routes';
import { ConfirmDialog } from '@/ui/components/dialog';
import {
  Alert,
  INLINE_SELECT_CLASS,
  NoScriptNotice,
  QUIET_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';
import { DataTable } from '@/ui/components/table';
import { Toast } from '@/ui/components/toast';
import { formatDateTime } from '@/ui/format';

import { AppShell } from '../../app-shell';
import {
  changeMemberRoleAction,
  setMemberDisabledAction,
  withdrawInvitationAction,
} from './actions';
import { InviteForm, PasswordResetForm } from './member-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.members.title} · ${messages.app.name}` };

/** Rückmeldung aus der Adresse — sie soll ein Neuladen nicht überleben. */
function noticeFor(done: string | undefined): string | null {
  switch (done) {
    case 'rolle':
      return messages.members.roleAssigned;
    case 'gesperrt':
      return messages.members.disabled;
    case 'entsperrt':
      return messages.members.enabled;
    case 'zurueckgezogen':
      return messages.members.withdrawn;
    default:
      return null;
  }
}

function errorFor(kind: string | undefined): string | null {
  switch (kind) {
    case 'LAST_ADMINISTRATOR':
      return messages.members.errorLAST_ADMINISTRATOR;
    case 'SELF':
      return messages.members.errorSELF;
    case 'NOT_FOUND':
      return messages.members.errorNOT_FOUND;
    case 'ROLE_NOT_FOUND':
      return messages.members.errorROLE_NOT_FOUND;
    default:
      return null;
  }
}

/**
 * Mitglieder eines Unternehmens (M8, FA-MEMB-01, -04, -06).
 *
 * Die Seite ist eine Server-Komponente; nur die beiden Abschnitte, in denen ein
 * **Link genau einmal** erscheint, sind Client-Komponenten. Die Tabelle selbst
 * kommt ohne JavaScript aus: Rollenwechsel und Sperren sind gewöhnliche
 * Formulare, die Rückmeldung steht in der Adresse.
 */
export default async function MembersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requirePermission('organization.administer');
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const [members, roles, invitations] = await Promise.all([
    getMembers(session.organization),
    getRoles(session.organization),
    getOpenInvitations(session.organization),
  ]);

  const params = await searchParams;
  const notice = noticeFor(typeof params.erledigt === 'string' ? params.erledigt : undefined);
  const failure = errorFor(typeof params.fehler === 'string' ? params.fehler : undefined);

  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }));
  const memberOptions = members
    .filter((member) => member.disabledAt === null)
    .map((member) => ({ value: member.id, label: member.email }));

  const timeZone = getAppTimeZone();
  const now = new Date();

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={MEMBERS_SETTINGS_PATH}>
      <PageHeader title={messages.members.heading} description={messages.members.intro} />

      {notice === null ? null : <Toast message={notice} />}
      {failure === null ? null : <Alert tone="error">{failure}</Alert>}

      <DataTable
        caption={messages.members.heading}
        rows={members}
        rowKey={(member) => member.id}
        columns={[
          {
            key: 'name',
            header: messages.members.columnName,
            cell: (member) => (
              <span className="flex flex-col">
                <span className="font-medium text-ink">
                  {member.name ?? messages.members.nameMissing}
                </span>
                <span className="font-mono text-data text-ink-muted">{member.email}</span>
                {member.totpEnabled ? (
                  <span className="text-small text-ink-faint">{messages.members.twoFactorOn}</span>
                ) : null}
              </span>
            ),
          },
          {
            key: 'role',
            header: messages.members.columnRole,
            cell: (member) => (
              /*
                Rollenwechsel ohne JavaScript: ein gewöhnliches Formular je
                Zeile. Die Kennung reist in einem versteckten Feld und nicht am
                Knopf — React belegt `name` eines absendenden Knopfes selbst
                (CLAUDE.md, M5.8).
              */
              <form action={changeMemberRoleAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                <input type="hidden" name="memberId" value={member.id} />
                <select
                  name="roleId"
                  defaultValue={member.role?.id ?? ''}
                  aria-label={messages.members.roleChange}
                  className={INLINE_SELECT_CLASS}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button type="submit" className={QUIET_BUTTON_CLASS}>
                  {messages.members.roleChangeSubmit}
                </button>
              </form>
            ),
          },
          {
            key: 'lastLogin',
            header: messages.members.columnLastLogin,
            fit: true,
            cell: (member) => (
              <span className="text-ink-muted">
                {member.lastLoginAt === null
                  ? messages.members.neverSignedIn
                  : formatDateTime(member.lastLoginAt, timeZone)}
              </span>
            ),
          },
          /*
            Zustand **und** Handlung in einer sichtbaren Spalte — nicht in der
            Aktionsspalte von `DataTable`.
            
            Deren Aktionen liegen unter `opacity-0` und erscheinen erst bei
            Hover oder Fokus (FA-UI-19). Für die Rechnungsliste ist das richtig:
            Dort ist jede Zeilenaktion auch auf der Belegseite erreichbar. Hier
            gibt es keine zweite Stelle — eine Sperre, die man nur findet, wenn
            man mit der Maus über die richtige Zeile fährt, ist keine.
          */
          {
            key: 'state',
            header: messages.members.columnState,
            fit: true,
            cell: (member) => (
              <span className="flex flex-col items-start gap-2">
                <span className={member.disabledAt === null ? 'text-ink' : 'text-ink-muted'}>
                  {member.disabledAt === null
                    ? messages.members.stateActive
                    : messages.members.stateDisabled}
                </span>

                {/*
                  Das eigene Konto trägt keine Sperr-Aktion. Nicht weil es
                  unmöglich wäre — die Aussperrsicherung deckt den harten Fall
                  ab —, sondern weil es keinen Vorgang gibt, den das abbildet:
                  Wer geht, wird von jemandem gesperrt, der bleibt.
                */}
                {member.id === session.userId ? null : member.disabledAt === null ? (
                  <form action={setMemberDisabledAction.bind(null, member.id, true)}>
                    <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                    <ConfirmDialog
                      title={messages.members.disableConfirmTitle}
                      message={messages.members.disableConfirm}
                      confirmLabel={messages.members.disable}
                      tone="danger"
                      trigger={
                        <button type="submit" className={QUIET_BUTTON_CLASS}>
                          {messages.members.disable}
                        </button>
                      }
                    />
                  </form>
                ) : (
                  <form action={setMemberDisabledAction.bind(null, member.id, false)}>
                    <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                    <button type="submit" className={QUIET_BUTTON_CLASS}>
                      {messages.members.enable}
                    </button>
                  </form>
                )}
              </span>
            ),
          },
        ]}
      />

      <section className={SECTION_CLASS}>
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-medium">{messages.members.inviteHeading}</h2>
          <p className="text-ui text-ink-muted">{messages.members.inviteIntro}</p>
        </div>
        <NoScriptNotice message={messages.common.noScript} />
        <InviteForm csrfToken={csrfToken} roles={roleOptions} />
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-medium">{messages.members.openHeading}</h2>

        {invitations.length === 0 ? (
          <p className="text-ui text-ink-muted">{messages.members.openEmpty}</p>
        ) : (
          <ul className="flex flex-col">
            {invitations.map((invitation) => {
              const days = invitationDaysRemaining(invitation.expiresAt, now);

              return (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-mono text-data text-ink">{invitation.email}</span>
                    <span className="text-small text-ink-muted">
                      {invitation.role.name} ·{' '}
                      {days === 0
                        ? messages.members.openExpiresToday
                        : messages.members.openExpires.replace('{days}', String(days))}
                    </span>
                  </span>

                  <form action={withdrawInvitationAction.bind(null, invitation.id)}>
                    <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                    <ConfirmDialog
                      title={messages.members.withdrawConfirmTitle}
                      message={messages.members.withdrawConfirm}
                      confirmLabel={messages.members.withdraw}
                      tone="danger"
                      trigger={
                        <button type="submit" className={QUIET_BUTTON_CLASS}>
                          {messages.members.withdraw}
                        </button>
                      }
                    />
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={SECTION_CLASS}>
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-medium">{messages.members.resetPassword}</h2>
          <p className="text-ui text-ink-muted">{messages.members.resetConfirm}</p>
        </div>
        <PasswordResetForm csrfToken={csrfToken} members={memberOptions} />
      </section>
    </AppShell>
  );
}
