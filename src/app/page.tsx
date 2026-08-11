import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCompanyProfile } from '@/application/company/company-profile';
import { checkSystemStatus } from '@/application/system/check-system-status';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { COMPANY_SETTINGS_PATH, DASHBOARD_PATH } from '@/routes';
import { CARD_CLASS, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { formatDateTime } from '@/ui/format';

import { AppNav } from './app-nav';

export const dynamic = 'force-dynamic';

export default async function DashboardPage(): Promise<ReactNode> {
  // Erste Anweisung: die Sitzungsprüfung (Spec §11.2).
  const session = await requireSession();
  const [status, company] = await Promise.all([
    checkSystemStatus(),
    getCompanyProfile(session.organization),
  ]);
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <>
      <AppNav currentPath={DASHBOARD_PATH} csrfToken={csrfToken} email={session.email} />

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{messages.dashboard.heading}</h1>
          <p className="text-neutral-600 dark:text-neutral-400">{messages.dashboard.placeholder}</p>
        </header>

        {company === null ? (
          <section className={CARD_CLASS}>
            <h2 className="text-lg font-medium">{messages.company.heading}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {messages.company.intro}
            </p>
            <div>
              <Link href={COMPANY_SETTINGS_PATH} className={SECONDARY_BUTTON_CLASS}>
                {messages.company.heading}
              </Link>
            </div>
          </section>
        ) : null}

        <section className={CARD_CLASS}>
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
      </main>
    </>
  );
}
