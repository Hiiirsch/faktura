import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { CUSTOMERS_PATH } from '@/routes';
import { NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { AppShell } from '../../app-shell';
import { CustomerForm } from '../customer-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.customers.createHeading} · ${messages.app.name}` };

export default async function NewCustomerPage(): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={CUSTOMERS_PATH}>
      <PageHeader
        title={messages.customers.createHeading}
        description={messages.customers.numberHint}
        actions={
          <Link href={CUSTOMERS_PATH} className={SECONDARY_BUTTON_CLASS}>
            {messages.common.back}
          </Link>
        }
      />

        <NoScriptNotice message={messages.common.noScript} />

        <CustomerForm csrfToken={csrfToken} />
    </AppShell>
  );
}
