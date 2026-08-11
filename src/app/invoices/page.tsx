import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { listCustomers } from '@/application/customers/customer-service';
import {
  listInvoices,
  today,
  type InvoiceListEntry,
  type InvoiceListFilter,
} from '@/application/invoices/invoice-queries';
import type { CurrencyCode } from '@/domain/codes/currency-code';
import { formatMoneyDe, formatPlainDateDe } from '@/domain/format/de';
import { isInvoiceStatus } from '@/domain/invoice/status';
import { cents } from '@/domain/money/money';
import { can } from '@/domain/policy/can';
import { daysBetween, plainDate } from '@/domain/time/plain-date';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { INVOICES_PATH, invoicePath, NEW_INVOICE_PATH } from '@/routes';
import {
  FOCUS_RING,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/ui/components/form';
import { EmptyState, PageHeader } from '@/ui/components/page';
import { InvoiceStatusField } from '@/ui/components/status-field';
import { DataTable, type Column } from '@/ui/components/table';

import { AppShell } from '../app-shell';

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

/**
 * Die Statusauswahl als Reiterleiste (§4.2).
 *
 * Als Links statt als Auswahlfeld: Die gewählte Sicht bleibt teilbar, steht im
 * Verlauf und ist ohne JavaScript bedienbar. „Überfällig" steht mit in der
 * Reihe, obwohl es kein Status ist — es ist die Sicht, die man am häufigsten
 * sucht.
 */
const STATUS_TABS = [
  { value: '', label: messages.invoices.filterAll },
  { value: 'DRAFT', label: messages.invoices.statusDRAFT },
  { value: 'ISSUED', label: messages.invoices.statusISSUED },
  { value: 'OVERDUE', label: messages.invoices.filterOverdue },
  { value: 'PAID', label: messages.invoices.statusPAID },
  { value: 'CANCELLED', label: messages.invoices.statusCANCELLED },
] as const;

function StatusTabs({ current }: { readonly current: string }): ReactNode {
  return (
    <nav aria-label={messages.invoices.filterStatus} className="flex flex-wrap gap-1">
      {STATUS_TABS.map((tab) => {
        const isActive = current === tab.value;
        const href = tab.value === '' ? INVOICES_PATH : `${INVOICES_PATH}?status=${tab.value}`;

        return (
          <Link
            key={tab.value || 'all'}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={
              `rounded-control px-3 py-2 text-ui transition-colors duration-(--duration-state) ${FOCUS_RING} ` +
              (isActive
                ? 'bg-accent-wash font-medium text-ink'
                : 'text-ink-muted hover:text-ink')
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
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

  const [invoices, customers] = await Promise.all([
    listInvoices(session.organization, filter),
    listCustomers(session.organization),
  ]);

  const currentStatus = typeof params.status === 'string' ? params.status : '';
  const currentSort = filter.sort ?? 'issueDate';
  const currentDirection = filter.direction ?? 'desc';
  const reference = today();

  /**
   * Tage seit der Fälligkeit. Nur für den Nachsatz am Status gedacht —
   * Überfälligkeit selbst wird abgeleitet und nie gespeichert (FA-STAT-02).
   */
  function daysOverdue(invoice: InvoiceListEntry): number | null {
    if (!invoice.isOverdue || invoice.dueDate === null) {
      return null;
    }
    return daysBetween(plainDate(invoice.dueDate), reference);
  }

  const columns: readonly Column<InvoiceListEntry>[] = [
    {
      key: 'number',
      header: messages.invoices.number,
      numeric: true,
      cell: (invoice) => (
        <span className="flex items-center justify-end gap-2">
          {invoice.documentType === 'CREDIT_NOTE' ? (
            <span className="font-sans text-label uppercase text-ink-muted">
              {messages.invoices.creditNote}
            </span>
          ) : null}
          <Link href={invoicePath(invoice.id)} className={`text-accent ${FOCUS_RING}`}>
            {/* Entwürfe zeigen einen Gedankenstrich, keinen Platzhaltertext (§4.2). */}
            {invoice.invoiceNumber ?? messages.common.none}
          </Link>
        </span>
      ),
    },
    {
      key: 'customer',
      header: messages.invoices.customer,
      cell: (invoice) => invoice.customerName,
    },
    {
      key: 'issueDate',
      header: messages.invoices.issueDate,
      numeric: true,
      cell: (invoice) => formatPlainDateDe(invoice.issueDate),
    },
    {
      key: 'dueDate',
      header: messages.invoices.dueDate,
      numeric: true,
      cell: (invoice) => formatPlainDateDe(invoice.dueDate),
    },
    {
      key: 'gross',
      header: messages.invoices.gross,
      numeric: true,
      cell: (invoice) =>
        formatMoneyDe(cents(invoice.grossTotalCents), invoice.currency as CurrencyCode),
    },
    {
      key: 'status',
      header: messages.invoices.filterStatus,
      cell: (invoice) => (
        <InvoiceStatusField
          status={invoice.status}
          isOverdue={invoice.isOverdue}
          daysOverdue={daysOverdue(invoice)}
          paidTotalCents={cents(invoice.paidTotalCents)}
          grossTotalCents={cents(invoice.grossTotalCents)}
          currency={invoice.currency as CurrencyCode}
        />
      ),
    },
    {
      // Im Schema angelegt, in V1 ausgeblendet — eingeblendet ab zwei
      // Mitgliedern (FA-UI-16, §7).
      key: 'createdBy',
      header: messages.invoices.createdBy,
      hidden: true,
      cell: () => messages.common.none,
    },
  ];

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={INVOICES_PATH}>
      <PageHeader
        title={messages.invoices.heading}
        actions={
          can('create', 'invoice') ? (
            <Link href={NEW_INVOICE_PATH} className={PRIMARY_BUTTON_CLASS}>
              {messages.invoices.create}
            </Link>
          ) : undefined
        }
      />

      <StatusTabs current={currentStatus} />

      {/* Filter über GET: Die Auswahl bleibt teilbar und im Verlauf erhalten. */}
      <form
        method="get"
        action={INVOICES_PATH}
        className="flex flex-wrap items-end gap-3 border-t border-rule pt-6"
      >
        <input type="hidden" name="status" value={currentStatus} />

        <label className="flex min-w-48 flex-1 flex-col gap-2">
          <span className="text-label font-semibold uppercase text-ink-muted">
            {messages.common.search}
          </span>
          <input
            type="search"
            name="q"
            defaultValue={filter.search ?? ''}
            placeholder={messages.common.searchPlaceholder}
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-label font-semibold uppercase text-ink-muted">
            {messages.invoices.filterCustomer}
          </span>
          <select name="customerId" defaultValue={filter.customerId ?? ''} className={INPUT_CLASS}>
            <option value="">{messages.invoices.filterAll}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName ?? customer.contactName ?? customer.customerNumber}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-label font-semibold uppercase text-ink-muted">
            {messages.invoices.filterFrom}
          </span>
          <input type="date" name="from" defaultValue={filter.from ?? ''} className={INPUT_CLASS} />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-label font-semibold uppercase text-ink-muted">
            {messages.invoices.filterTo}
          </span>
          <input type="date" name="to" defaultValue={filter.to ?? ''} className={INPUT_CLASS} />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-label font-semibold uppercase text-ink-muted">
            {messages.invoices.sortBy}
          </span>
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
        <EmptyState
          message={
            Object.keys(filter).length === 0
              ? messages.invoices.empty
              : messages.invoices.emptyFiltered
          }
          action={
            Object.keys(filter).length === 0 ? (
              <Link href={NEW_INVOICE_PATH} className={PRIMARY_BUTTON_CLASS}>
                {messages.invoices.create}
              </Link>
            ) : (
              <Link href={INVOICES_PATH} className={SECONDARY_BUTTON_CLASS}>
                {messages.common.reset}
              </Link>
            )
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={invoices}
          rowKey={(invoice) => invoice.id}
          caption={messages.invoices.heading}
        />
      )}
    </AppShell>
  );
}
