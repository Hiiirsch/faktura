import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { listPlatformAccounts } from '@/application/admin/platform-accounts';
import { requireAdminSession } from '@/application/admin/require-admin-session';
import { getAppTimeZone } from '@/application/system/display-settings';
import { messages } from '@/i18n/de';
import {
  CSRF_FIELD_NAME,
  CSRF_HEADER_NAME,
} from '@/infrastructure/security/csrf';
import { ADMIN_ACCOUNTS_PATH } from '@/routes';
import { Alert, QUIET_BUTTON_CLASS, SECTION_CLASS } from '@/ui/components/form';
import { ConfirmDialog } from '@/ui/components/dialog';
import { PageHeader } from '@/ui/components/page';
import { DataTable } from '@/ui/components/table';
import { formatDate, formatDateTime } from '@/ui/format';

import { setPlatformAccountDisabledAction } from '../actions';
import { AdminNav } from '../admin-nav';
import {
  InvitePlatformAccountForm,
  ResetPlatformAccountForm,
} from './account-forms';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${messages.admin.accountsTitle} · ${messages.app.name}`,
};

/**
 * Betreiberkonten (M10, B1, FA-ADM-12, -13).
 *
 * **Was diese Seite möglich macht und was sie riskiert.** Bis M10 entstand ein
 * Betreiberkonto nur über `npm run admin:create`; wer die Anwendung betrieb, aber
 * keine Konsole hatte, konnte niemanden hinzunehmen. Umgekehrt entsteht mit dem
 * Sperren aus der Oberfläche zum ersten Mal ein Weg, die **gesamte** Verwaltung
 * auszusperren — deshalb kommt in derselben Migration der Trigger
 * `Platform_keeps_administrator_on_update` mit.
 *
 * Kein Kennzahlenblock, keine Zahlen: Ein Betreiberkonto hat keine Belege. Was
 * es hat, ist ein Zustand und eine letzte Anmeldung.
 */
export default async function AdminAccountsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  // Erste Anweisung: die Sitzungsprüfung — hier die der Verwaltung.
  const session = await requireAdminSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  const params = await searchParams;

  const accounts = await listPlatformAccounts(session.platform);
  const timeZone = getAppTimeZone();

  const done = typeof params.erledigt === 'string' ? params.erledigt : null;
  const failed = typeof params.fehler === 'string' ? params.fehler : null;

  return (
    <>
      <AdminNav
        currentPath={ADMIN_ACCOUNTS_PATH}
        email={session.email}
        csrfToken={csrfToken}
      />

      <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 pb-12">
        <PageHeader
          title={messages.admin.accountsPageHeading}
          description={messages.admin.accountsPageIntro}
        />

        {done === null ? null : (
          <Alert tone="success">
            {done === 'betreiberGesperrt'
              ? messages.admin.accountDisabled
              : messages.admin.accountEnabled}
          </Alert>
        )}

        {failed === null ? null : (
          <Alert tone="error">
            {failed === 'SELF'
              ? messages.admin.accountsErrorSELF
              : failed === 'NOT_FOUND'
                ? messages.admin.accountsErrorNOT_FOUND
                : messages.admin.accountsErrorLAST_ADMINISTRATOR}
          </Alert>
        )}

        <section className="flex flex-col gap-4">
          <DataTable
            caption={messages.admin.accountsPageHeading}
            rows={accounts}
            rowKey={(account) => account.id}
            columns={[
              {
                key: 'account',
                header: messages.admin.accountsColumnAccount,
                cell: (account) => (
                  <span className="flex flex-col">
                    <span className="font-mono text-data text-ink">
                      {account.email}
                    </span>
                    <span className="text-small text-ink-muted">
                      {account.id === session.adminUserId
                        ? messages.admin.accountsSelf
                        : messages.admin.createdOn.replace(
                            '{date}',
                            formatDate(account.createdAt, timeZone),
                          )}
                    </span>
                  </span>
                ),
              },
              {
                key: 'secondFactor',
                header: messages.admin.accountsColumnSecondFactor,
                fit: true,
                cell: (account) => (
                  <span
                    className={
                      account.totpEnabled ? 'text-ink' : 'text-ink-muted'
                    }
                  >
                    {account.totpEnabled
                      ? messages.admin.accountsSecondFactorOn
                      : messages.admin.accountsSecondFactorOff}
                  </span>
                ),
              },
              {
                key: 'lastLogin',
                header: messages.admin.accountsColumnLastLogin,
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
                  Zustand und Handlungen in **sichtbaren** Spalten — nicht in der
                  Aktionsspalte von `DataTable`, deren Inhalt bis Hover oder Fokus
                  unter `opacity-0` liegt (FA-UI-19). Dasselbe Argument wie in der
                  Mitglieder- und Rollenverwaltung: Hier gibt es keine zweite
                  Stelle, an der sich ein Konto ändern ließe.
                */
                key: 'state',
                header: messages.admin.accountsColumnState,
                fit: true,
                cell: (account) => (
                  <span
                    className={
                      account.disabledAt === null
                        ? 'text-ink'
                        : 'text-ink-muted'
                    }
                  >
                    {account.disabledAt === null
                      ? messages.admin.accountsStateActive
                      : messages.admin.accountsStateDisabled}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: messages.common.actions,
                fit: true,
                cell: (account) =>
                  // Das eigene Konto trägt keine Handlung: Es gibt keinen
                  // Vorgang, den „sich selbst sperren" abbildet.
                  account.id === session.adminUserId ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    <span className="flex flex-col items-start gap-2">
                      {account.disabledAt === null ? (
                        <form
                          action={setPlatformAccountDisabledAction.bind(
                            null,
                            account.id,
                            true,
                          )}
                        >
                          <input
                            type="hidden"
                            name={CSRF_FIELD_NAME}
                            value={csrfToken}
                          />
                          <ConfirmDialog
                            title={messages.admin.accountsDisableConfirmTitle}
                            message={messages.admin.accountsDisableConfirm}
                            confirmLabel={messages.admin.accountsDisable}
                            tone="danger"
                            trigger={
                              <button
                                type="submit"
                                className={QUIET_BUTTON_CLASS}
                              >
                                {messages.admin.accountsDisable}
                              </button>
                            }
                          />
                        </form>
                      ) : (
                        <form
                          action={setPlatformAccountDisabledAction.bind(
                            null,
                            account.id,
                            false,
                          )}
                        >
                          <input
                            type="hidden"
                            name={CSRF_FIELD_NAME}
                            value={csrfToken}
                          />
                          <button type="submit" className={QUIET_BUTTON_CLASS}>
                            {messages.admin.accountsEnable}
                          </button>
                        </form>
                      )}

                      <ResetPlatformAccountForm
                        adminUserId={account.id}
                        csrfToken={csrfToken}
                      />
                    </span>
                  ),
              },
            ]}
          />
        </section>

        <section className={SECTION_CLASS}>
          <h2 className="text-section font-semibold text-ink">
            {messages.admin.accountsInviteHeading}
          </h2>
          <p className="max-w-form text-ui text-ink-muted">
            {messages.admin.accountsInviteIntro}
          </p>
          <InvitePlatformAccountForm csrfToken={csrfToken} />
        </section>
      </main>
    </>
  );
}
