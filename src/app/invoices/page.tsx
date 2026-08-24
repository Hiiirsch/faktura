import { BanknoteArrowUp, Ban, Copy, Download, Pencil } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { authorizeOptional, requirePermission } from '@/application/auth/authorize';
import { listCustomers } from '@/application/customers/customer-service';
import { countMembers } from '@/application/members/member-service';
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
import { acceptsPayments, canBeCancelled } from '@/domain/invoice/status';
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
  const session = await requirePermission('invoice.read');
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const params = await searchParams;
  const filter = readFilter(params);

  /*
   * Der Kundenfilter hängt an `customer.read` — die Liste selbst nicht (M8).
   *
   * Ein Konto, das nur Belege lesen darf, käme sonst nicht in die
   * Rechnungsliste, weil eine Auswahlliste im Filterkopf ein Recht verlangt,
   * das mit den Belegen nichts zu tun hat. Ohne das Recht entfällt der Filter,
   * nicht die Seite.
   */
  const readCustomers = authorizeOptional(session, 'customer.read');

  /*
   * Wie viele Konten das Unternehmen führt — allein für die Sichtbarkeit der
   * Spalte „Erstellt von" (FA-UI-16).
   *
   * `countMembers` hängt an `invoice.read`, dem Recht, das auch diese Seite
   * verlangt: Der Urheber eines Belegs ist innerhalb eines Unternehmens keine
   * geschützte Auskunft, er steht in derselben Zeile wie der Beleg selbst.
   */
  const memberCount = await countMembers(session.organization);

  const [invoices, customers] = await Promise.all([
    listInvoices(session.organization, filter),
    readCustomers === null ? [] : listCustomers(readCustomers),
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
    /*
     * Was der Beleg zulässt, entscheidet die Domäne (M12) — nicht der Status
     * allein. Sonst bekäme eine **Stornorechnung** dieselben Aktionen wie eine
     * offene Rechnung: stornieren und bezahlt markieren, beides vom Server
     * abgewiesen und sichtbar folgenlos.
     */
    const documentType = invoice.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE';
    const payable =
      acceptsPayments(invoice.status, documentType) &&
      (invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID');
    const cancellable = canBeCancelled(invoice.status, documentType);
    const isIssued = invoice.invoiceNumber !== null;

    return (
      <>
        {/*
          Entwurf bearbeiten (M11, B4, FA-UI-27).

          Die Belegseite zeigt für Entwürfe seit M4 den Editor — aus der Liste
          führte nur die Belegnummer dorthin, und ein Entwurf hat keine. Wer
          einen Entwurf weiterschreiben wollte, musste raten, dass die Zeile
          anklickbar ist.

          Ein `IconLink`, kein Knopf: Es wird nichts verändert, nur navigiert.
        */}
        {invoice.status === 'DRAFT' && can(session.actor, 'update', 'invoice') ? (
          <IconLink
            icon={Pencil}
            label={messages.invoices.actionEdit}
            href={invoicePath(invoice.id)}
          />
        ) : null}

        {payable && can(session.actor, 'recordPayment', 'invoice') ? (
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

        {cancellable && can(session.actor, 'cancel', 'invoice') ? (
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
          documentType={invoice.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE'}
          isOverdue={invoice.isOverdue}
          daysOverdue={daysOverdue(invoice)}
          paidTotalCents={cents(invoice.paidTotalCents)}
          grossTotalCents={cents(invoice.grossTotalCents)}
          currency={invoice.currency as CurrencyCode}
        />
      ),
    },
    {
      /*
       * „Erstellt von" — seit M8 gefüllt und **bedingt sichtbar** (FA-UI-16, §7).
       *
       * Sie erscheint erst, wenn das Unternehmen mehr als ein Konto führt. In
       * einem Einpersonenbetrieb stünde in jeder Zeile derselbe Name: eine
       * Spalte, die nichts unterscheidet, kostet Breite und trägt nichts.
       *
       * Bestandsbelege aus der Zeit vor M8 zeigen einen Gedankenstrich. Sie
       * nachträglich aus dem Protokoll zuzuschreiben hieße raten.
       */
      key: 'createdBy',
      header: messages.invoices.createdBy,
      hidden: memberCount < 2,
      fit: true,
      cell: (invoice) =>
        /*
          Drei Fälle, nicht zwei: ein Name, ein unkenntlich gemachtes Konto, und
          gar kein Urheber. Der mittlere ist neu (M10) — er darf nicht wie der
          letzte aussehen, denn der Beleg **hat** einen Urheber.
        */
        invoice.createdByAnonymized
          ? messages.invoices.createdByAnonymized
          : (invoice.createdByName ?? messages.common.none),
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

        {readCustomers === null ? null : (
          <label className="flex flex-col gap-1.5">
            <span className="text-ui font-medium text-ink">
              {messages.invoices.filterCustomer}
            </span>
            <select
              name="customerId"
              defaultValue={filter.customerId ?? ''}
              className={INPUT_CLASS}
            >
              <option value="">{messages.invoices.filterAll}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName ?? customer.contactName ?? customer.customerNumber}
                </option>
              ))}
            </select>
          </label>
        )}

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
              /*
               * Wofür die Zeile in Frage kommt (M12).
               *
               * `draft` lässt sich löschen, `payable` als bezahlt markieren.
               * Eine **Stornorechnung** ist beides nicht: Sie ist ausgestellt
               * und fordert nichts — auf sie wird nicht gezahlt.
               */
              kindOf: (invoice) =>
                invoice.status === 'DRAFT'
                  ? 'draft'
                  : invoice.documentType === 'CREDIT_NOTE'
                    ? 'credit-note'
                    : 'payable',
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
