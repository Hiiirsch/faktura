import type { ReactNode } from 'react';

import { checkSystemStatus } from '@/application/system/check-system-status';
import { messages } from '@/i18n/de';
import { formatDateTime } from '@/ui/format';

// Der Zustand wird bei jedem Aufruf frisch ermittelt, nicht aus dem Cache.
export const dynamic = 'force-dynamic';

export default async function StatusPage(): Promise<ReactNode> {
  const status = await checkSystemStatus();
  const databaseUp = status.components.database === 'UP';

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{messages.app.name}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{messages.app.description}</p>
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

        <p className="text-sm text-neutral-600 dark:text-neutral-400">{messages.status.intro}</p>

        <dl className="flex flex-col gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="flex flex-col">
              <span className="font-medium">{messages.status.componentDatabase}</span>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                {messages.status.componentDatabaseDescription}
              </span>
            </dt>
            <dd className="text-sm font-medium">
              {databaseUp ? messages.status.stateUp : messages.status.stateDown}
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
  );
}
