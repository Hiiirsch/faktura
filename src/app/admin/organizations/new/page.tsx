import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { requireAdminSession } from '@/application/admin/require-admin-session';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { ADMIN_PATH } from '@/routes';
import { NoScriptNotice } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { NewOrganizationForm } from './organization-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.admin.newOrganization} · ${messages.app.name}` };

/**
 * Ein Unternehmen anlegen (M8, B5).
 *
 * Ohne `AppShell`, wie jede Adminseite: Der Rahmen der Anwendung zeigt
 * Firmendaten und Mandantennavigation, und beides gibt es hier nicht. Ein
 * gemeinsamer Rahmen wäre die erste Stelle, an der Mandantendaten in den
 * Adminbereich sickern.
 */
export default async function NewOrganizationPage(): Promise<ReactNode> {
  // Erste Anweisung: die Sitzungsprüfung der Verwaltung (Spec §11.2).
  await requireAdminSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <main className="mx-auto flex min-h-screen max-w-content flex-col gap-6 px-8 pb-12">
      <PageHeader
        title={messages.admin.newOrganizationHeading}
        description={messages.admin.newOrganizationIntro}
        backHref={ADMIN_PATH}
        backLabel={messages.admin.back}
      />

      <NoScriptNotice message={messages.common.noScript} />
      <NewOrganizationForm csrfToken={csrfToken} />
    </main>
  );
}
