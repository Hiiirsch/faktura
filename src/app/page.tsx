import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { authorize, authorizeOptional } from '@/application/auth/authorize';
import { requireSession } from '@/application/auth/require-session';
import { getCompanyProfile } from '@/application/company/company-profile';
import {
  type DashboardInvoice,
  getDashboardMetrics,
} from '@/application/dashboard/dashboard-metrics';
import type { CurrencyCode } from '@/domain/codes/currency-code';
import { can } from '@/domain/policy/can';
import { formatMoneyDe } from '@/domain/format/de';
import { cents } from '@/domain/money/money';
import { daysBetween, plainDate } from '@/domain/time/plain-date';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import {
  COMPANY_SETTINGS_PATH,
  DASHBOARD_PATH,
  INVOICES_PATH,
  invoicePath,
  NEW_INVOICE_PATH,
} from '@/routes';
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, SECTION_CLASS } from '@/ui/components/form';
import { MetricRow, type Metric } from '@/ui/components/metric';
import { EmptyState, PageHeader } from '@/ui/components/page';
import { RevenueChart } from '@/ui/components/revenue-chart';
import { InvoiceStatusField } from '@/ui/components/status-field';

import { AppShell } from './app-shell';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.dashboard.heading} · ${messages.app.name}` };

/**
 * Ein Abschnitt der Übersicht.
 *
 * Überschrift links, Bezugsgröße rechts — „letzte 12 Monate", „laufendes
 * Jahr". Der Entwurf verlangt, dass die Bezugsgröße beschriftet ist
 * (FA-DASH-10); sie gehört an den Abschnitt, nicht an jede einzelne Zahl.
 */
function Panel({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className={SECTION_CLASS}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section font-semibold text-ink">{title}</h2>
        {note === undefined ? null : <span className="text-small text-ink-muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * Eine Belegzeile der Fristenlisten.
 *
 * Nummer, Empfänger, Betrag, Frist — mehr nicht. Die Übersicht ist kein
 * zweiter Zugang zur Rechnungsliste, sondern beantwortet eine Frage: Wer
 * schuldet was, und bis wann.
 */
function InvoiceRow({
  invoice,
  note,
}: {
  readonly invoice: DashboardInvoice;
  readonly note: string;
}): ReactNode {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-2 last:border-b-0">
      <span className="flex min-w-0 flex-col">
        <Link href={invoicePath(invoice.id)} className="font-mono text-data text-accent">
          {invoice.invoiceNumber ?? messages.common.none}
        </Link>
        <span className="truncate text-small text-ink-muted">{invoice.customerName}</span>
      </span>
      <span className="flex flex-col items-end">
        <span className="font-mono text-data text-ink">
          {formatMoneyDe(invoice.outstandingCents, invoice.currency as CurrencyCode)}
        </span>
        <span className="text-small text-ink-muted">{note}</span>
      </span>
    </li>
  );
}

export default async function DashboardPage(): Promise<ReactNode> {
  // Erste Anweisung: die Sitzungsprüfung (Spec §11.2).
  const session = await requireSession();

  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  const company = await getCompanyProfile(authorize(session, 'companyProfile.read'));

  /*
   * Diese Seite ist die Startseite **jedes** Kontos, aber sie besteht aus
   * Belegzahlen (M8).
   *
   * Ohne `invoice.read` bleibt deshalb nichts zu zeigen — und eine Umleitung
   * wäre hier falsch: Sie ginge auf einen Bereich, für den dasselbe gelten
   * könnte, und im schlechtesten Fall im Kreis. Also die Schale mit einem
   * benannten Leerzustand.
   */
  const readInvoices = authorizeOptional(session, 'invoice.read');
  if (readInvoices === null) {
    return (
      <AppShell session={session} csrfToken={csrfToken} currentPath={DASHBOARD_PATH}>
        <PageHeader title={messages.dashboard.heading} />
        <EmptyState message={messages.dashboard.noInvoiceAccess} />
      </AppShell>
    );
  }

  /*
   * Eine Auswertungsfunktion für die ganze Seite (FA-DASH-09).
   *
   * Diese Seite rechnet **nichts**. Sie formatiert und ordnet an; jede Zahl
   * kommt aus `getDashboardMetrics()`. Der Grund steht dort: Eine zweite
   * Stelle, die „Umsatz" ausrechnet, ist eine zweite Auslegung davon, was
   * Umsatz ist.
   */
  const metrics = await getDashboardMetrics(readInvoices);

  const year = metrics.today.slice(0, 4);
  const currentMonth = metrics.today.slice(0, 7);

  const overdueCount = metrics.receivables.overdueCount;
  const tiles: readonly Metric[] = [
    {
      label: messages.dashboard.metricOutstanding,
      value: formatMoneyDe(metrics.receivables.openCents),
    },
    {
      label: messages.dashboard.metricOverdue,
      value: formatMoneyDe(metrics.receivables.overdueCents),
      note:
        overdueCount === 1
          ? messages.dashboard.metricInvoiceOne
          : messages.dashboard.metricInvoices.replace('{count}', String(overdueCount)),
    },
    {
      label: messages.dashboard.metricRevenueMonth,
      value: formatMoneyDe(metrics.revenueMonthCents),
      note: messages.dashboard.metricNet,
    },
    {
      label: messages.dashboard.metricRevenueYear.replace('{year}', year),
      value: formatMoneyDe(metrics.revenueYearCents),
      note: messages.dashboard.metricNet,
    },
  ];

  /** Wie viele Tage es noch bis zur Fälligkeit sind. */
  const daysUntilDue = (invoice: DashboardInvoice): number =>
    invoice.dueDate === null ? 0 : daysBetween(plainDate(metrics.today), plainDate(invoice.dueDate));

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={DASHBOARD_PATH}>
      <PageHeader
        title={messages.dashboard.heading}
        actions={
          can(session.actor, 'create', 'invoice') ? (
            <Link href={NEW_INVOICE_PATH} className={PRIMARY_BUTTON_CLASS}>
              {messages.invoices.create}
            </Link>
          ) : null
        }
      />

      {company === null ? (
        <section className={SECTION_CLASS}>
          <h2 className="text-section font-semibold text-ink">{messages.company.heading}</h2>
          <p className="text-ui text-ink-muted">{messages.company.intro}</p>
          <div>
            <Link href={COMPANY_SETTINGS_PATH} className={SECONDARY_BUTTON_CLASS}>
              {messages.company.heading}
            </Link>
          </div>
        </section>
      ) : null}

      {/* Die Zahl ist die Überschrift (§1) — sie steht vor allem anderen. */}
      <MetricRow metrics={tiles} />

      {!metrics.hasInvoices ? (
        <EmptyState
          message={messages.dashboard.empty}
          action={
            can(session.actor, 'create', 'invoice') ? (
              <Link href={NEW_INVOICE_PATH} className={PRIMARY_BUTTON_CLASS}>
                {messages.invoices.create}
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <Panel
            title={messages.dashboard.chartHeading}
            note={messages.dashboard.chartPeriod}
          >
            <RevenueChart bars={metrics.monthly} currentMonth={currentMonth} />
          </Panel>

          {/*
            Die beiden Fristenlisten nebeneinander: Sie beantworten dieselbe
            Frage in zwei Richtungen — was ist liegengeblieben, was kommt.
          */}
          <div className="grid gap-8 lg:grid-cols-2">
            <Panel title={messages.dashboard.overdueHeading}>
              {metrics.overdue.length === 0 ? (
                <p className="text-small text-ink-muted">{messages.dashboard.overdueEmpty}</p>
              ) : (
                <ul className="flex flex-col">
                  {metrics.overdue.slice(0, 5).map((invoice) => (
                    <InvoiceRow
                      key={invoice.id}
                      invoice={invoice}
                      note={messages.dashboard.overdueSince.replace(
                        '{days}',
                        String(invoice.daysOverdue),
                      )}
                    />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={messages.dashboard.dueSoonHeading}>
              {metrics.dueSoon.length === 0 ? (
                <p className="text-small text-ink-muted">{messages.dashboard.dueSoonEmpty}</p>
              ) : (
                <ul className="flex flex-col">
                  {metrics.dueSoon.slice(0, 5).map((invoice) => {
                    const days = daysUntilDue(invoice);
                    return (
                      <InvoiceRow
                        key={invoice.id}
                        invoice={invoice}
                        note={
                          days === 0
                            ? messages.dashboard.dueToday
                            : messages.dashboard.dueIn.replace('{days}', String(days))
                        }
                      />
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Zuletzt bearbeitet, mit Statuskennzeichnung (FA-DASH-08). */}
            <Panel title={messages.dashboard.recentHeading}>
              <ul className="flex flex-col">
                {metrics.recent.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule py-2 last:border-b-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <Link
                        href={invoicePath(invoice.id)}
                        className="font-mono text-data text-accent"
                      >
                        {invoice.invoiceNumber ?? messages.common.none}
                      </Link>
                      <span className="truncate text-small text-ink-muted">
                        {invoice.customerName}
                      </span>
                    </span>
                    <InvoiceStatusField
                      status={invoice.status}
                      isOverdue={invoice.daysOverdue > 0}
                      daysOverdue={invoice.daysOverdue === 0 ? null : invoice.daysOverdue}
                      paidTotalCents={cents(invoice.paidTotalCents)}
                      grossTotalCents={cents(invoice.grossTotalCents)}
                      currency={invoice.currency as CurrencyCode}
                    />
                  </li>
                ))}
              </ul>
              <div>
                <Link href={INVOICES_PATH} className={SECONDARY_BUTTON_CLASS}>
                  {messages.invoices.heading}
                </Link>
              </div>
            </Panel>

            {/* Umsatzstärkste Kunden (FA-DASH-11, KANN). */}
            <Panel
              title={messages.dashboard.topCustomersHeading}
              note={messages.dashboard.topCustomersPeriod}
            >
              {metrics.topCustomers.length === 0 ? (
                <p className="text-small text-ink-muted">
                  {messages.dashboard.topCustomersEmpty}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {metrics.topCustomers.map((entry) => (
                    <li
                      key={entry.customerName}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule py-2 last:border-b-0"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-ui text-ink">{entry.customerName}</span>
                        <span className="text-small text-ink-muted">
                          {entry.invoiceCount === 1
                            ? messages.dashboard.invoiceCountOne
                            : messages.dashboard.invoiceCount.replace(
                                '{count}',
                                String(entry.invoiceCount),
                              )}
                        </span>
                      </span>
                      <span className="font-mono text-data text-ink">
                        {formatMoneyDe(entry.netCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </AppShell>
  );
}
