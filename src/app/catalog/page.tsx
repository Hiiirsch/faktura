import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCatalogItem, listCatalogItems } from '@/application/catalog/catalog-service';
import { cents } from '@/domain/money/money';
import { messages, unitLabels } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { CATALOG_PATH } from '@/routes';
import {
  FOCUS_RING,
  NoScriptNotice,
  QUIET_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';
import { type Column, DataTable } from '@/ui/components/table';
import { formatMoney, formatPercent, formatUnit } from '@/ui/format';

import { AppShell } from '../app-shell';
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
  const columns: readonly Column<(typeof items)[number]>[] = [
    {
      key: 'name',
      header: messages.catalog.name,
      cell: (item) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`${CATALOG_PATH}?edit=${item.id}${includeArchived ? '&archived=1' : ''}`}
            className={`text-accent ${FOCUS_RING}`}
          >
            {item.name}
          </Link>
          {item.isArchived ? (
            <span className="rounded-control bg-surface-sunken px-2 py-0.5 text-small text-ink-muted">
              {messages.customers.archivedBadge}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'unitPrice',
      header: messages.catalog.unitPrice,
      numeric: true,
      cell: (item) => formatMoney(cents(item.unitPriceCents)),
    },
    {
      key: 'unit',
      header: messages.catalog.unitCode,
      cell: (item) => (isKnownUnit(item.unitCode) ? formatUnit(item.unitCode) : item.unitCode),
    },
    {
      key: 'taxRate',
      header: messages.catalog.taxRate,
      numeric: true,
      cell: (item) => formatPercent(item.taxRateBasisPoints),
    },
  ];

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={CATALOG_PATH}>
      <PageHeader title={messages.catalog.heading} description={messages.catalog.intro} />

        <NoScriptNotice message={messages.common.noScript} />

        <CatalogForm item={editItem ?? undefined} csrfToken={csrfToken} />

        <section className={SECTION_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-section font-medium">{messages.catalog.heading}</h2>
            <Link
              href={includeArchived ? CATALOG_PATH : `${CATALOG_PATH}?archived=1`}
              className={SECONDARY_BUTTON_CLASS}
            >
              {includeArchived ? messages.customers.hideArchived : messages.catalog.showArchived}
            </Link>
          </div>

          {items.length === 0 ? (
            <p className="text-ui text-ink-muted">
              {messages.catalog.empty}
            </p>
          ) : (
            /* Dieselbe Tabelle wie in den übrigen Listen (seit M6.1). */
            <DataTable
              columns={columns}
              rows={items}
              rowKey={(item) => item.id}
              caption={messages.catalog.heading}
              actionsLabel={messages.catalog.archive}
              actions={(item) => (
                <form action={setCatalogItemArchivedAction}>
                  <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                  <input type="hidden" name="id" value={item.id} />
                  <input
                    type="hidden"
                    name="isArchived"
                    value={item.isArchived ? 'false' : 'true'}
                  />
                  <button type="submit" className={QUIET_BUTTON_CLASS}>
                    {item.isArchived ? messages.catalog.unarchive : messages.catalog.archive}
                  </button>
                </form>
              )}
            />
          )}
        </section>
    </AppShell>
  );
}
