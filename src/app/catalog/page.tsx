import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCatalogItem, listCatalogItems } from '@/application/catalog/catalog-service';
import { cents } from '@/domain/money/money';
import { messages, unitLabels } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { CATALOG_PATH } from '@/routes';
import { CARD_CLASS, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { formatMoney, formatPercent, formatUnit } from '@/ui/format';

import { AppNav } from '../app-nav';
import { setCatalogItemArchivedAction } from './actions';
import { CatalogForm } from './catalog-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.catalog.title} · ${messages.app.name}` };

function isKnownUnit(code: string): code is keyof typeof unitLabels {
  return code in unitLabels;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const params = await searchParams;
  const includeArchived = params.archived === '1';
  const editId = typeof params.edit === 'string' ? params.edit : null;

  const [items, editItem] = await Promise.all([
    listCatalogItems(session.organization, includeArchived),
    editId === null ? Promise.resolve(null) : getCatalogItem(session.organization, editId),
  ]);

  return (
    <>
      <AppNav currentPath={CATALOG_PATH} csrfToken={csrfToken} email={session.email} />

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{messages.catalog.heading}</h1>
          <p className="text-neutral-600 dark:text-neutral-400">{messages.catalog.intro}</p>
        </header>

        <NoScriptNotice message={messages.common.noScript} />

        <CatalogForm item={editItem ?? undefined} csrfToken={csrfToken} />

        <section className={CARD_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">{messages.catalog.heading}</h2>
            <Link
              href={includeArchived ? CATALOG_PATH : `${CATALOG_PATH}?archived=1`}
              className={SECONDARY_BUTTON_CLASS}
            >
              {includeArchived ? messages.customers.hideArchived : messages.catalog.showArchived}
            </Link>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {messages.catalog.empty}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {messages.catalog.name}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      {messages.catalog.unitPrice}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {messages.catalog.unitCode}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      {messages.catalog.taxRate}
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      <span className="sr-only">{messages.catalog.archive}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-neutral-100 dark:border-neutral-900">
                      <td className="py-2 pr-4">
                        <Link
                          href={`${CATALOG_PATH}?edit=${item.id}${includeArchived ? '&archived=1' : ''}`}
                          className="underline underline-offset-4"
                        >
                          {item.name}
                        </Link>
                        {item.isArchived ? (
                          <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                            {messages.customers.archivedBadge}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatMoney(cents(item.unitPriceCents))}
                      </td>
                      <td className="py-2 pr-4">
                        {isKnownUnit(item.unitCode) ? formatUnit(item.unitCode) : item.unitCode}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatPercent(item.taxRateBasisPoints)}
                      </td>
                      <td className="py-2 text-right">
                        <form action={setCatalogItemArchivedAction}>
                          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                          <input type="hidden" name="id" value={item.id} />
                          <input
                            type="hidden"
                            name="isArchived"
                            value={item.isArchived ? 'false' : 'true'}
                          />
                          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                            {item.isArchived ? messages.catalog.unarchive : messages.catalog.archive}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
