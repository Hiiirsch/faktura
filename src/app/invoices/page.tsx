import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { listCustomers } from '@/application/customers/customer-service';
import { listInvoices, type InvoiceListFilter } from '@/application/invoices/invoice-queries';
import { getAppTimeZone } from '@/application/system/display-settings';
import { isInvoiceStatus } from '@/domain/invoice/status';
import { cents } from '@/domain/money/money';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { INVOICES_PATH, invoicePath, NEW_INVOICE_PATH } from '@/routes';
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { formatMoney } from '@/ui/format';

import { AppNav } from '../app-nav';
import { InvoiceStatusBadge, formatGermanDate } from './status-badge';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.invoices.title} · ${messages.app.name}` };

function readFilter(params: Record<string, string | string[] | undefined>): InvoiceListFilter {
  const text = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  const status = text('status');
  const sort = text('sort');
  const direction = text('direction');

  return {
    ...(status === 'OVERDUE'
      ? { status: 'OVERDUE' as const }
      : status !== undefined && isInvoiceStatus(status)
        ? { status }
        : {}),
    ...(text('customerId') === undefined ? {} : { customerId: text('customerId') as string }),
    ...(text('from') === undefined ? {} : { from: text('from') as string }),
    ...(text('to') === undefined ? {} : { to: text('to') as string }),
    ...(text('q') === undefined ? {} : { search: text('q') as string }),
    ...(sort === 'number' || sort === 'gross' || sort === 'dueDate' || sort === 'issueDate'
      ? { sort }
      : {}),
    ...(direction === 'asc' || direction === 'desc' ? { direction } : {}),
  };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const params = await searchParams;
  const filter = readFilter(params);
  const timeZone = getAppTimeZone();

  const [invoices, customers] = await Promise.all([
    listInvoices(session.organization, filter),
    listCustomers(session.organization),
  ]);

  const currentStatus = typeof params.status === 'string' ? params.status : '';
  const currentSort = filter.sort ?? 'issueDate';
  const currentDirection = filter.direction ?? 'desc';

  return (
    <>
      <AppNav currentPath={INVOICES_PATH} csrfToken={csrfToken} email={session.email} />

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{messages.invoices.heading}</h1>
            <p className="text-neutral-600 dark:text-neutral-400">{messages.invoices.intro}</p>
          </div>
          <Link href={NEW_INVOICE_PATH} className={PRIMARY_BUTTON_CLASS}>
            {messages.invoices.create}
          </Link>
        </header>

        {/* Filter über GET: Die Auswahl bleibt teilbar und im Verlauf erhalten. */}
        <form method="get" action={INVOICES_PATH} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{messages.invoices.filterStatus}</span>
            <select name="status" defaultValue={currentStatus} className={INPUT_CLASS}>
              <option value="">{messages.invoices.filterAll}</option>
              <option value="DRAFT">{messages.invoices.statusDRAFT}</option>
              <option value="ISSUED">{messages.invoices.statusISSUED}</option>
              <option value="PARTIALLY_PAID">{messages.invoices.statusPARTIALLY_PAID}</option>
              <option value="PAID">{messages.invoices.statusPAID}</option>
              <option value="CANCELLED">{messages.invoices.statusCANCELLED}</option>
              <option value="OVERDUE">{messages.invoices.filterOverdue}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{messages.invoices.filterCustomer}</span>
            <select name="customerId" defaultValue={filter.customerId ?? ''} className={INPUT_CLASS}>
              <option value="">{messages.invoices.filterAll}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName ?? customer.contactName ?? customer.customerNumber}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{messages.invoices.filterFrom}</span>
            <input type="date" name="from" defaultValue={filter.from ?? ''} className={INPUT_CLASS} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{messages.invoices.filterTo}</span>
            <input type="date" name="to" defaultValue={filter.to ?? ''} className={INPUT_CLASS} />
          </label>

          <label className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">{messages.common.search}</span>
            <input type="search" name="q" defaultValue={filter.search ?? ''} className={INPUT_CLASS} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{messages.invoices.sortBy}</span>
            <select name="sort" defaultValue={currentSort} className={INPUT_CLASS}>
              <option value="issueDate">{messages.invoices.sortIssueDate}</option>
              <option value="number">{messages.invoices.sortNumber}</option>
              <option value="gross">{messages.invoices.sortGross}</option>
              <option value="dueDate">{messages.invoices.sortDueDate}</option>
            </select>
          </label>
          <input type="hidden" name="direction" value={currentDirection} />

          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
            {messages.invoices.filterApply}
          </button>
          <Link href={INVOICES_PATH} className={SECONDARY_BUTTON_CLASS}>
            {messages.common.reset}
          </Link>
        </form>

        {invoices.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-400">
            {Object.keys(filter).length === 0
              ? messages.invoices.empty
              : messages.invoices.emptyFiltered}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                  <th scope="col" className="py-2 pr-4 font-medium">{messages.invoices.number}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{messages.invoices.customer}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{messages.invoices.issueDate}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{messages.invoices.dueDate}</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">{messages.invoices.gross}</th>
                  <th scope="col" className="py-2 font-medium">{messages.invoices.filterStatus}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-neutral-100 dark:border-neutral-900">
                    <td className="py-2 pr-4 tabular-nums">
                      <Link href={invoicePath(invoice.id)} className="underline underline-offset-4">
                        {invoice.invoiceNumber ?? messages.invoices.noNumber}
                      </Link>
                      {invoice.documentType === 'CREDIT_NOTE' ? (
                        <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                          {messages.invoices.creditNote}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{invoice.customerName}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {formatGermanDate(invoice.issueDate)}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{formatGermanDate(invoice.dueDate)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatMoney(cents(invoice.grossTotalCents), invoice.currency as 'EUR')}
                    </td>
                    <td className="py-2">
                      <InvoiceStatusBadge status={invoice.status} isOverdue={invoice.isOverdue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {messages.status.checkedAt}: {timeZone}
        </p>
      </main>
    </>
  );
}
