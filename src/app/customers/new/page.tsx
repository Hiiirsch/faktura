import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { CUSTOMERS_PATH } from '@/routes';
import { NoScriptNotice } from '@/ui/components/form';

import { AppNav } from '../../app-nav';
import { CustomerForm } from '../customer-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.customers.createHeading} · ${messages.app.name}` };

export default async function NewCustomerPage(): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <>
      <AppNav currentPath={CUSTOMERS_PATH} csrfToken={csrfToken} email={session.email} />

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <Link
            href={CUSTOMERS_PATH}
            className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
          >
            {messages.common.back}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            {messages.customers.createHeading}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {messages.customers.numberHint}
          </p>
        </header>

        <NoScriptNotice message={messages.common.noScript} />

        <CustomerForm csrfToken={csrfToken} />
      </main>
    </>
  );
}
