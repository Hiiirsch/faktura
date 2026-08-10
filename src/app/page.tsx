import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { checkSystemStatus } from '@/application/system/check-system-status';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { SECURITY_SETTINGS_PATH } from '@/routes';
import { formatDateTime } from '@/ui/format';

import { logoutAction } from './auth-actions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage(): Promise<ReactNode> {
  // Erste Anweisung: die Sitzungsprüfung (Spec §11.2).
  const session = await requireSession();
  const status = await checkSystemStatus();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{messages.app.name}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {messages.dashboard.signedInAs} {session.email}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={SECURITY_SETTINGS_PATH}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {messages.dashboard.securitySettings}
          </Link>

          <form action={logoutAction}>
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {messages.dashboard.logout}
            </button>
          </form>
        </div>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">{messages.status.heading}</h2>
          <span
            className={
              status.healthy
                ? 'rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-900 dark:bg-green-950 dark:text-green-200'
                : 'rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-900 dark:bg-red-950 dark:text-red-200'
            }
          >
            {status.healthy ? messages.status.healthy : messages.status.unhealthy}
          </span>
        </div>

        <dl className="flex flex-col gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-medium">{messages.status.componentDatabase}</dt>
            <dd className="text-sm">
              {status.components.database === 'UP'
                ? messages.status.stateUp
                : messages.status.stateDown}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-medium">{messages.status.checkedAt}</dt>
            <dd className="text-sm tabular-nums">
              {formatDateTime(status.checkedAt, status.timeZone)}
            </dd>
          </div>
        </dl>
      </section>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {messages.dashboard.placeholder}
      </p>
    </main>
  );
}
