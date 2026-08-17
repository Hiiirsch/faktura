import { BanknoteArrowUp, Copy, Download, Ban } from 'lucide-react';
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
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { INVOICES_PATH, invoicePath, invoicePdfPath, NEW_INVOICE_PATH } from '@/routes';
import {
  FOCUS_RING,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/ui/components/form';
import { DateField } from '@/ui/components/date-field';
import { ConfirmDialog } from '@/ui/components/dialog';
import { IconButton, IconLink } from '@/ui/components/icon';
import { EmptyState, PageHeader } from '@/ui/components/page';
import { PendingBar } from '@/ui/components/progress-bar';
import { Toast } from '@/ui/components/toast';
import { InvoiceStatusField } from '@/ui/components/status-field';
import { DataTable, type Column } from '@/ui/components/table';

import { AppShell } from '../app-shell';

import {
  type ListNotice,
  quickCancelAction,
  quickDuplicateAction,
  quickMarkPaidAction,
} from './actions';
import { SelectionBar } from './selection-bar';

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

/**
 * Die Meldung nach einer Schnellaktion (FA-UI-18).
 *
 * Sie kommt aus der Adresse, nicht aus einem Zustandsspeicher — die Begründung
 * steht im Kopf von `src/ui/components/toast.tsx`. Ein unbekannter Schlüssel
 * ergibt keine Meldung statt einer erfundenen.
 */
function noticeFor(key: string | undefined, count: string | undefined): string | null {
  const amount = count ?? '0';

  switch (key as ListNotice) {
    case 'paid':
      return messages.invoices.noticePaid;
    case 'paidMany':
      return messages.invoices.noticePaidMany.replace('{count}', amount);
    case 'cancelled':
      return messages.invoices.noticeCancelled;
    case 'duplicated':
      return messages.invoices.noticeDuplicated;
    case 'draftsDeleted':
      return messages.invoices.noticeDraftsDeleted.replace('{count}', amount);
    default:
      return null;
  }
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

  const notice = noticeFor(
    typeof params.erledigt === 'string' ? params.erledigt : undefined,
    typeof params.anzahl === 'string' ? params.anzahl : undefined,
  );

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

  /**
   * Die Aktionen einer Zeile (FA-UI-19).
   *
   * Welche erscheinen, entscheidet der Zustand des Belegs zusammen mit `can()`
   * (FA-UI-14): Ein Entwurf hat nichts zu stornieren und nichts zu bezahlen,
   * ein stornierter Beleg auch nicht. Sichtbar werden sie bei Hover und bei
   * Tastaturfokus in der Zeile.
   *
   * Alle liegen im selben Formular — verschachtelte Formulare erlaubt HTML
   * nicht. Welche Zeile gemeint ist, sagt `name`/`value` des Absenders, welche
   * Handlung sein `formAction`.
   */
  function rowActions(invoice: InvoiceListEntry): ReactNode {
    const isOpen = invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID';
    const isIssued = invoice.invoiceNumber !== null;

    return (
      <>
        {isOpen && can(session.actor, 'recordPayment', 'invoice') ? (
          <IconButton
            icon={BanknoteArrowUp}
            label={messages.invoices.actionMarkPaid}
            formAction={quickMarkPaidAction.bind(null, invoice.id)}
          />
        ) : null}

        {isIssued ? (
          <IconLink
            icon={Download}
            label={messages.invoices.actionDownload}
            href={invoicePdfPath(invoice.id)}
          />
        ) : null}

        {can(session.actor, 'duplicate', 'invoice') ? (
          <IconButton
            icon={Copy}
            label={messages.invoices.actionDuplicate}
            formAction={quickDuplicateAction.bind(null, invoice.id)}
          />
        ) : null}

        {isOpen && can(session.actor, 'cancel', 'invoice') ? (
          <ConfirmDialog
            title={messages.invoices.cancelConfirmTitle}
            message={messages.invoices.cancelConfirm}
            confirmLabel={messages.invoices.cancelInvoice}
            formAction={quickCancelAction.bind(null, invoice.id)}
            tone="danger"
            trigger={
              <IconButton
                icon={Ban}
                label={messages.invoices.actionCancel}
                tone="danger"
                formAction={quickCancelAction.bind(null, invoice.id)}
              />
            }
          />
        ) : null}
      </>
    );
  }

  const columns: readonly Column<InvoiceListEntry>[] = [
    {
      key: 'number',
      header: messages.invoices.number,
      numeric: true,
      fit: true,
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
          can(session.actor, 'create', 'invoice') ? (
            <Link href={NEW_INVOICE_PATH} className={PRIMARY_BUTTON_CLASS}>
              {messages.invoices.create}
            </Link>
          ) : undefined
        }
      />

      <StatusTabs current={currentStatus} />

      {/* Filter über GET: Die Auswahl bleibt teilbar und im Verlauf erhalten. */}
      {/*
        Die Filterzeile trägt dieselben Beschriftungen wie jedes andere
        Formular. Vorher standen hier Versalien in Kleingröße neben den
        normalen Feldbeschriftungen des Datumsfelds — nebeneinander sah das
        aus wie zwei Formulare, die versehentlich in einer Zeile gelandet sind.
      */}
      <form
        method="get"
        action={INVOICES_PATH}
        className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-rule pt-6"
      >
        <input type="hidden" name="status" value={currentStatus} />

        <label className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">
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

        <label className="flex flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">
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

        <DateField
          name="from"
          label={messages.invoices.filterFrom}
          defaultValue={filter.from ?? ''}
        />
        <DateField name="to" label={messages.invoices.filterTo} defaultValue={filter.to ?? ''} />

        <label className="flex flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">
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
        /*
         * Ein Formular um die ganze Tabelle: Es trägt die Kästchen der
         * Mehrfachauswahl und dient zugleich als Absender der Zeilenaktionen.
         * `group` ist der Anker, an dem die Auswahlleiste in CSS erkennt, dass
         * etwas gewählt ist (FA-UI-20).
         */
        <form className="group flex flex-col gap-4">
          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
          <PendingBar />
          <SelectionBar />

          <DataTable
            columns={columns}
            rows={invoices}
            rowKey={(invoice) => invoice.id}
            caption={messages.invoices.heading}
            selection={{
              name: 'invoiceIds',
              label: messages.invoices.selectRow,
              // Ein stornierter Beleg wird weder bezahlt noch gelöscht.
              selectable: (invoice) => invoice.status !== 'CANCELLED',
            }}
            actions={rowActions}
            actionsLabel={messages.invoices.rowActions}
          />
        </form>
      )}

      {notice === null ? null : <Toast message={notice} />}
    </AppShell>
  );
}
