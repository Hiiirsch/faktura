import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { can } from '@/domain/policy/can';

import { requireSession } from '@/application/auth/require-session';
import { listCustomers } from '@/application/customers/customer-service';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { customerPath, CUSTOMERS_PATH, NEW_CUSTOMER_PATH } from '@/routes';
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { AppShell } from '../app-shell';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.customers.title} · ${messages.app.name}` };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const params = await searchParams;
  const search = typeof params.q === 'string' ? params.q : '';
  const includeArchived = params.archived === '1';

  const customers = await listCustomers(session.organization, { search, includeArchived });
  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={CUSTOMERS_PATH}>
      <PageHeader
        title={messages.customers.heading}
        description={messages.customers.intro}
        actions={
          can('create', 'customer') ? (
            <Link href={NEW_CUSTOMER_PATH} className={PRIMARY_BUTTON_CLASS}>
              {messages.customers.create}
            </Link>
          ) : undefined
        }
      />

        {/* Suche über GET: Der Filter bleibt damit als Adresse teilbar und
            im Verlauf des Browsers erhalten. */}
        <form method="get" action={CUSTOMERS_PATH} className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-64 flex-1 flex-col gap-1.5">
            <label htmlFor="q" className="text-ui font-medium">
              {messages.common.search}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={search}
              placeholder={messages.common.searchPlaceholder}
              className={INPUT_CLASS}
            />
          </div>
          {includeArchived ? <input type="hidden" name="archived" value="1" /> : null}
          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
            {messages.common.search}
          </button>
          <Link
            href={
              includeArchived
                ? `${CUSTOMERS_PATH}${search === '' ? '' : `?q=${encodeURIComponent(search)}`}`
                : `${CUSTOMERS_PATH}?archived=1${search === '' ? '' : `&q=${encodeURIComponent(search)}`}`
            }
            className={SECONDARY_BUTTON_CLASS}
          >
            {includeArchived ? messages.customers.hideArchived : messages.customers.showArchived}
          </Link>
        </form>

        {customers.length === 0 ? (
          <p className="text-ink-muted">
            {search === '' ? messages.customers.empty : messages.customers.emptyFiltered}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-ui">
              <thead>
                <tr className="border-b border-rule text-left">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {messages.customers.number}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {messages.customers.companyName}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {messages.customers.city}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {messages.customers.countryCode}
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-b border-rule"
                  >
                    <td className="py-2 pr-4 tabular-nums">
                      <Link
                        href={customerPath(customer.id)}
                        className="underline underline-offset-4"
                      >
                        {customer.customerNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      {customer.companyName ?? customer.contactName ?? messages.common.none}
                      {customer.isArchived ? (
                        <span className="ml-2 rounded-control bg-surface-sunken px-2 py-0.5 text-small">
                          {messages.customers.archivedBadge}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{customer.city}</td>
                    <td className="py-2 pr-4">{customer.countryCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </AppShell>
  );
}
