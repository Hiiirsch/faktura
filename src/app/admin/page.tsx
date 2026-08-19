import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { listManagedOrganizations } from '@/application/admin/organization-admin';
import { requireAdminSession } from '@/application/admin/require-admin-session';
import { listPasskeys } from '@/application/auth/passkey-registration';
import { getAppTimeZone } from '@/application/system/display-settings';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { isPasskeyCapableOrigin } from '@/infrastructure/auth/webauthn';
import {
  ADMIN_NEW_ORGANIZATION_PATH,
  ADMIN_PASSKEY_PATH,
  ADMIN_PATH,
  adminOrganizationPath,
} from '@/routes';
import {
  PRIMARY_BUTTON_CLASS,
  QUIET_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/ui/components/form';
import { EmptyState, PageHeader } from '@/ui/components/page';
import { DataTable } from '@/ui/components/table';
import { formatDate } from '@/ui/format';

import { removeAdminPasskeyAction } from './actions';
import { AdminNav } from './admin-nav';
import { PasskeyForm } from '../passkey-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.admin.title} · ${messages.app.name}` };

/**
 * Die Verwaltung (M8, FA-ADM-02, -03).
 *
 * **Was hier steht, sind Unternehmen und Zahlen.** Keine Rechnungsnummer, kein
 * Kundenname, kein Betrag. Das ist keine Zurückhaltung beim Anzeigen, sondern
 * eine Eigenschaft des Aufbaus: Eine Adminsitzung führt keinen
 * `OrganizationContext`, und jede Abfrage von Geschäftsdaten verlangt einen. Von
 * Geschäftstabellen ist überhaupt nur `_count` erreichbar, und das ist am
 * Quelltext geprüft — in zwei Formen, weil ein `include: { invoices: true }`
 * einem `_count` zum Verwechseln ähnlich sieht.
 *
 * Diese Seite hat **keinen** `AppShell`: Der Rahmen der Anwendung zeigt
 * Firmendaten und die Mandantennavigation, und beides gibt es hier nicht. Ein
 * gemeinsamer Rahmen wäre die erste Stelle, an der Mandantendaten in den
 * Adminbereich sickern.
 */
export default async function AdminPage(): Promise<ReactNode> {
  // Erste Anweisung: die Sitzungsprüfung — hier die der Verwaltung.
  const session = await requireAdminSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const organizations = await listManagedOrganizations(session.platform);
  const timeZone = getAppTimeZone();

  const passkeys = await listPasskeys({
    kind: 'admin',
    id: session.adminUserId,
    email: session.email,
    name: null,
  });
  const passkeysPossible = isPasskeyCapableOrigin();

  return (
    <>
      <AdminNav currentPath={ADMIN_PATH} email={session.email} csrfToken={csrfToken} />

      <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 pb-12">
        <PageHeader
          title={messages.admin.heading}
          description={messages.admin.scopeIntro}
          actions={
            <Link href={ADMIN_NEW_ORGANIZATION_PATH} className={PRIMARY_BUTTON_CLASS}>
              {messages.admin.newOrganization}
            </Link>
          }
        />

        <section className="flex flex-col gap-4">
          {organizations.length === 0 ? (
            <EmptyState
              message={messages.admin.organizationsEmpty}
              action={
                <Link href={ADMIN_NEW_ORGANIZATION_PATH} className={PRIMARY_BUTTON_CLASS}>
                  {messages.admin.newOrganization}
                </Link>
              }
            />
          ) : (
            <DataTable
              caption={messages.admin.organizationsHeading}
              rows={organizations}
              rowKey={(organization) => organization.id}
              columns={[
                {
                  key: 'name',
                  header: messages.admin.columnOrganization,
                  cell: (organization) => (
                    <span className="flex flex-col">
                      <Link
                        href={adminOrganizationPath(organization.id)}
                        className="font-medium text-accent hover:text-accent-hover"
                      >
                        {organization.name}
                      </Link>
                      <span className="text-small text-ink-muted">
                        {messages.admin.createdOn.replace(
                          '{date}',
                          formatDate(organization.createdAt, timeZone),
                        )}
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'accounts',
                  header: messages.admin.columnAccounts,
                  numeric: true,
                  fit: true,
                  cell: (organization) => organization.userCount,
                },
                {
                  key: 'invoices',
                  header: messages.admin.columnInvoices,
                  numeric: true,
                  fit: true,
                  cell: (organization) => organization.invoiceCount,
                },
                {
                  key: 'lastLogin',
                  header: messages.admin.columnLastLogin,
                  fit: true,
                  cell: (organization) => (
                    <span className="text-ink-muted">
                      {organization.lastLoginAt === null
                        ? messages.admin.neverSignedIn
                        : formatDate(organization.lastLoginAt, timeZone)}
                    </span>
                  ),
                },
                {
                  key: 'state',
                  header: messages.admin.columnState,
                  fit: true,
                  cell: (organization) => (
                    <span
                      className={organization.suspendedAt === null ? 'text-ink' : 'text-ink-muted'}
                    >
                      {organization.suspendedAt === null
                        ? messages.admin.stateActive
                        : messages.admin.stateSuspended}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </section>

        {/*
          Passkeys des Betreiberkontos (M9, FA-PASS-03).

          Auf der Übersicht und nicht auf einer eigenen Seite: Der Adminbereich hat
          keine Einstellungen, und eine Seite für einen Abschnitt wäre ein Weg mehr
          als Inhalt.
        */}
        <section className={SECTION_CLASS}>
          <h2 className="text-section font-semibold text-ink">
            {messages.security.passkeyHeading}
          </h2>
          <p className="max-w-form text-ui text-ink-muted">{messages.security.passkeyIntro}</p>

          {passkeys.length === 0 ? (
            <p className="text-ui text-ink-muted">{messages.security.passkeyEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-rule">
              {passkeys.map((passkey) => (
                <li
                  key={passkey.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-ui font-medium">{passkey.label}</span>
                    <span className="text-ui text-ink-muted">
                      {messages.security.passkeyCreated.replace(
                        '{date}',
                        formatDate(passkey.createdAt, timeZone),
                      )}
                    </span>
                    {/*
                      Die letzte Nutzung gehört dazu (FA-PASS-03): Sie ist die
                      einzige Angabe, an der auffällt, dass ein Schlüssel benutzt
                      wird, den man selbst nicht mehr benutzt.
                    */}
                    <span className="text-ui text-ink-muted">
                      {passkey.lastUsedAt === null
                        ? messages.security.passkeyNeverUsed
                        : `${messages.security.passkeyLastUsed} ${formatDate(passkey.lastUsedAt, timeZone)}`}
                    </span>
                    {passkey.disabled ? (
                      <span className="text-small text-ink">
                        {messages.security.passkeyDisabled}
                      </span>
                    ) : null}
                  </div>

                  <form action={removeAdminPasskeyAction}>
                    <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                    <input type="hidden" name="passkeyId" value={passkey.id} />
                    <button type="submit" className={QUIET_BUTTON_CLASS}>
                      {messages.security.passkeyRemove}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {passkeysPossible ? (
            <PasskeyForm endpoint={ADMIN_PASSKEY_PATH} csrfToken={csrfToken} />
          ) : (
            <p className="max-w-form text-ui text-ink">{messages.security.passkeyUnsupported}</p>
          )}
        </section>

          <section className={SECTION_CLASS}>
            <p className="max-w-form text-small text-ink-muted">{messages.admin.scopeNote}</p>
          </section>
      </main>
    </>
  );
}
