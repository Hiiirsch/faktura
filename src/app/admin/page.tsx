import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { countManagedOrganizations } from '@/application/admin/organization-admin';
import { requireAdminSession } from '@/application/admin/require-admin-session';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { SECTION_CLASS, QUIET_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { adminLogoutAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.admin.title} · ${messages.app.name}` };

/**
 * Die Verwaltung (M8, B1).
 *
 * In diesem Block nur der Rahmen und der Nachweis, dass die Trennung trägt:
 * die Anzahl der Unternehmen und der Satz, der die Reichweite benennt. Die
 * Unternehmensliste mit Kennzahlen und das Anlegen entstehen in B5.
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

  const count = await countManagedOrganizations(session.platform);

  return (
    <main className="mx-auto flex min-h-screen max-w-content flex-col gap-6 px-8 pb-12">
      <PageHeader
        title={messages.admin.heading}
        description={session.email}
        actions={
          <form action={adminLogoutAction}>
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <button type="submit" className={QUIET_BUTTON_CLASS}>
              {messages.admin.logout}
            </button>
          </form>
        }
      />

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-semibold text-ink">
          {messages.admin.organizationsHeading}
        </h2>
        <p className="metric-figure text-metric font-semibold text-ink">
          {String(count)}
        </p>
        <p className="max-w-form text-small text-ink-muted">
          {count === 0 ? messages.admin.organizationsEmpty : messages.admin.scopeNote}
        </p>
      </section>
    </main>
  );
}
