import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCompanyProfile } from '@/application/company/company-profile';
import { checkSystemStatus } from '@/application/system/check-system-status';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { COMPANY_SETTINGS_PATH, DASHBOARD_PATH } from '@/routes';
import { SECTION_CLASS, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';
import { formatDateTime } from '@/ui/format';

import { AppShell } from './app-shell';

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
    <AppShell session={session} csrfToken={csrfToken} currentPath={DASHBOARD_PATH}>
      <PageHeader
        title={messages.dashboard.heading}
        description={messages.dashboard.placeholder}
      />

        {company === null ? (
          <section className={SECTION_CLASS}>
            <h2 className="text-section font-medium">{messages.company.heading}</h2>
            <p className="text-ui text-ink-muted">
              {messages.company.intro}
            </p>
            <div>
              <Link href={COMPANY_SETTINGS_PATH} className={SECONDARY_BUTTON_CLASS}>
                {messages.company.heading}
              </Link>
            </div>
          </section>
        ) : null}

        <section className={SECTION_CLASS}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-section font-medium">{messages.status.heading}</h2>
            <span
              className={
                status.healthy
                  ? 'rounded-control bg-moss-wash px-3 py-1 text-ui font-medium text-ink'
                  : 'rounded-control bg-ocker-wash px-3 py-1 text-ui font-medium text-ink'
              }
            >
              {status.healthy ? messages.status.healthy : messages.status.unhealthy}
            </span>
          </div>

          <dl className="flex flex-col gap-3 border-t border-rule pt-4">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-medium">{messages.status.componentDatabase}</dt>
              <dd className="text-ui">
                {status.components.database === 'UP'
                  ? messages.status.stateUp
                  : messages.status.stateDown}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-medium">{messages.status.checkedAt}</dt>
              <dd className="text-ui tabular-nums">
                {formatDateTime(status.checkedAt, status.timeZone)}
              </dd>
            </div>
          </dl>
        </section>
    </AppShell>
  );
}
