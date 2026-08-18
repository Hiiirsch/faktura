import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  getManagedOrganization,
  getOpenInvitations,
  getOrganizationAccounts,
} from '@/application/admin/organization-admin';
import { requireAdminSession } from '@/application/admin/require-admin-session';
import { getAppTimeZone } from '@/application/system/display-settings';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { ADMIN_PATH } from '@/routes';
import { ConfirmDialog } from '@/ui/components/dialog';
import {
  Alert,
  NoScriptNotice,
  QUIET_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/ui/components/form';
import { MetricRow, type Metric } from '@/ui/components/metric';
import { EmptyState, PageHeader } from '@/ui/components/page';
import { DataTable } from '@/ui/components/table';
import { Toast } from '@/ui/components/toast';
import { formatDate, formatDateTime } from '@/ui/format';

import {
  setAccountDisabledAction,
  setOrganizationSuspendedAction,
  withdrawInvitationAsPlatformAction,
} from '../../actions';
import { ReissueInvitationForm, TenantPasswordResetForm } from './recovery-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.admin.detailHeading} · ${messages.app.name}` };

function noticeFor(done: string | undefined): string | null {
  switch (done) {
    case 'stillgelegt':
      return messages.admin.suspended;
    case 'freigegeben':
      return messages.admin.resumed;
    case 'kontoGesperrt':
      return messages.admin.accountDisabled;
    case 'kontoEntsperrt':
      return messages.admin.accountEnabled;
    case 'zurueckgezogen':
      return messages.admin.withdrawn;
    default:
      return null;
  }
}

function errorFor(kind: string | undefined): string | null {
  switch (kind) {
    case 'NOT_FOUND':
      return messages.admin.errorNOT_FOUND;
    case 'LAST_ADMINISTRATOR':
      return messages.admin.errorLAST_ADMINISTRATOR;
    case 'NO_OWNER_ROLE':
      return messages.admin.errorNO_OWNER_ROLE;
    default:
      return null;
  }
}

/**
 * Ein Unternehmen in der Verwaltung (M8, FA-ADM-03, -05, FA-ORG-03).
 *
 * **Was hier steht, sind Zahlen und Konten.** Keine Rechnungsnummer, kein
 * Kundenname, kein Betrag — und das ist keine Zurückhaltung beim Anzeigen,
 * sondern eine Folge des Aufbaus: Die Adminsitzung führt keinen
 * `OrganizationContext`, und jede Abfrage von Geschäftsdaten verlangt einen. Was
 * an Geschäftsdaten überhaupt erreichbar ist, ist `_count` — geprüft am
 * Quelltext in `tests/architecture/platform-repository.test.ts`.
 *
 * `notFound()` bei unbekannter Kennung: Ein 403 bestätigte, dass es das
 * Unternehmen gibt.
 */
export default async function AdminOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requireAdminSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const { id } = await params;
  const organization = await getManagedOrganization(session.platform, id);
  if (organization === null) {
    notFound();
  }

  const [accounts, invitations] = await Promise.all([
    getOrganizationAccounts(session.platform, id),
    getOpenInvitations(session.platform, id),
  ]);

  const params_ = await searchParams;
  const notice = noticeFor(typeof params_.erledigt === 'string' ? params_.erledigt : undefined);
  const failure = errorFor(typeof params_.fehler === 'string' ? params_.fehler : undefined);

  const timeZone = getAppTimeZone();
  const isSuspended = organization.suspendedAt !== null;

  const metrics: readonly Metric[] = [
    { label: messages.admin.columnAccounts, value: String(organization.userCount) },
    { label: messages.admin.columnInvoices, value: String(organization.invoiceCount) },
    { label: messages.admin.columnCustomers, value: String(organization.customerCount) },
    {
      label: messages.admin.columnLastLogin,
      value:
        organization.lastLoginAt === null
          ? messages.admin.neverSignedIn
          : formatDate(organization.lastLoginAt, timeZone),
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-content flex-col gap-6 px-8 pb-12">
      <PageHeader
        title={organization.name}
        description={messages.admin.createdOn.replace(
          '{date}',
          formatDate(organization.createdAt, timeZone),
        )}
        backHref={ADMIN_PATH}
        backLabel={messages.admin.back}
        meta={
          <span className={isSuspended ? 'text-ink-muted' : 'text-ink'}>
            {isSuspended ? messages.admin.stateSuspended : messages.admin.stateActive}
          </span>
        }
        actions={
          isSuspended ? (
            <form action={setOrganizationSuspendedAction.bind(null, id, false)}>
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                {messages.admin.resume}
              </button>
            </form>
          ) : (
            <form action={setOrganizationSuspendedAction.bind(null, id, true)}>
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <ConfirmDialog
                title={messages.admin.suspendConfirmTitle}
                message={messages.admin.suspendConfirm}
                confirmLabel={messages.admin.suspend}
                tone="danger"
                trigger={
                  <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                    {messages.admin.suspend}
                  </button>
                }
              />
            </form>
          )
        }
      />

      {notice === null ? null : <Toast message={notice} />}
      {failure === null ? null : <Alert tone="error">{failure}</Alert>}

      <section className="flex flex-col gap-3">
        <MetricRow metrics={metrics} />
        <p className="max-w-form text-small text-ink-muted">{messages.admin.metricsNote}</p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-semibold text-ink">{messages.admin.accountsHeading}</h2>

        {accounts.length === 0 ? (
          <EmptyState message={messages.admin.accountsEmpty} />
        ) : (
          <DataTable
            caption={messages.admin.accountsHeading}
            rows={accounts}
            rowKey={(account) => account.id}
            columns={[
              {
                key: 'account',
                // Nicht `columnAccounts`: Das steht schon über der Kachel mit
                // der Kontenzahl, und zweimal dasselbe Wort in zwei Bedeutungen
                // liest sich als Fehler.
                header: messages.members.columnName,
                cell: (account) => (
                  <span className="flex flex-col">
                    <span className="font-medium text-ink">
                      {account.name ?? messages.admin.accountNameMissing}
                    </span>
                    <span className="font-mono text-data text-ink-muted">{account.email}</span>
                  </span>
                ),
              },
              {
                key: 'role',
                header: messages.roles.columnName,
                fit: true,
                cell: (account) => (
                  <span className="text-ink-muted">
                    {account.role?.name ?? messages.admin.accountRoleMissing}
                  </span>
                ),
              },
              {
                key: 'lastLogin',
                header: messages.admin.columnLastLogin,
                fit: true,
                cell: (account) => (
                  <span className="text-ink-muted">
                    {account.lastLoginAt === null
                      ? messages.admin.neverSignedIn
                      : formatDateTime(account.lastLoginAt, timeZone)}
                  </span>
                ),
              },
              {
                /*
                  Zustand und Handlung in einer sichtbaren Spalte — nicht in der
                  Aktionsspalte von `DataTable`, deren Inhalt bis Hover unter
                  `opacity-0` liegt (FA-UI-19). Hier gibt es keine zweite Stelle,
                  an der sich ein Konto sperren ließe.
                */
                key: 'state',
                header: messages.admin.columnState,
                fit: true,
                cell: (account) => (
                  <span className="flex flex-col items-start gap-2">
                    <span className={account.disabledAt === null ? 'text-ink' : 'text-ink-muted'}>
                      {account.disabledAt === null
                        ? messages.admin.stateActive
                        : messages.members.stateDisabled}
                    </span>

                    {account.disabledAt === null ? (
                      <form action={setAccountDisabledAction.bind(null, id, account.id, true)}>
                        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                        <ConfirmDialog
                          title={messages.admin.disableConfirmTitle}
                          message={messages.admin.disableConfirm}
                          confirmLabel={messages.admin.disableAccount}
                          tone="danger"
                          trigger={
                            <button type="submit" className={QUIET_BUTTON_CLASS}>
                              {messages.admin.disableAccount}
                            </button>
                          }
                        />
                      </form>
                    ) : (
                      <form action={setAccountDisabledAction.bind(null, id, account.id, false)}>
                        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                        <button type="submit" className={QUIET_BUTTON_CLASS}>
                          {messages.admin.enableAccount}
                        </button>
                      </form>
                    )}
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>

      {/*
        Die drei Wege aus einer Sackgasse (M9/B1).

        Sie stehen unter den Konten und nicht darüber: Es sind Werkzeuge für den
        Ausnahmefall, nicht der Alltag der Verwaltung.
      */}
      <section className={SECTION_CLASS}>
        <h2 className="text-section font-semibold text-ink">
          {messages.admin.openInvitationsHeading}
        </h2>

        {invitations.length === 0 ? (
          <p className="text-ui text-ink-muted">{messages.admin.openInvitationsEmpty}</p>
        ) : (
          <ul className="flex flex-col">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-data text-ink">{invitation.email}</span>
                  <span className="text-small text-ink-muted">
                    {messages.admin.openInvitationExpires.replace(
                      '{date}',
                      formatDate(invitation.expiresAt, timeZone),
                    )}
                  </span>
                </span>

                <form
                  action={withdrawInvitationAsPlatformAction.bind(null, id, invitation.id)}
                >
                  <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                  <button type="submit" className={QUIET_BUTTON_CLASS}>
                    {messages.admin.withdraw}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION_CLASS}>
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold text-ink">
            {messages.admin.reissueHeading}
          </h2>
          <p className="max-w-form text-ui text-ink-muted">{messages.admin.reissueIntro}</p>
        </div>
        <NoScriptNotice message={messages.common.noScript} />
        <ReissueInvitationForm
          organizationId={id}
          csrfToken={csrfToken}
          defaultEmail={invitations[0]?.email ?? ''}
        />
      </section>

      {accounts.length === 0 ? null : (
        <section className={SECTION_CLASS}>
          <div className="flex flex-col gap-1">
            <h2 className="text-section font-semibold text-ink">
              {messages.admin.tenantResetSectionHeading}
            </h2>
            <p className="max-w-form text-ui text-ink-muted">
              {messages.admin.tenantResetIntro}
            </p>
          </div>
          <TenantPasswordResetForm
            organizationId={id}
            csrfToken={csrfToken}
            accounts={accounts.map((account) => ({
              value: account.id,
              label: account.email,
            }))}
          />
        </section>
      )}
    </main>
  );
}
