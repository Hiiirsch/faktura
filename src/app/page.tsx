import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCompanyProfile } from '@/application/company/company-profile';
import { listInvoices, today } from '@/application/invoices/invoice-queries';
import { checkSystemStatus } from '@/application/system/check-system-status';
import { formatMoneyDe } from '@/domain/format/de';
import { countsTowardReceivables, countsTowardRevenue } from '@/domain/invoice/revenue';
import { cents, subtractCents, sumCents, ZERO_CENTS } from '@/domain/money/money';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { COMPANY_SETTINGS_PATH, DASHBOARD_PATH } from '@/routes';
import { SECTION_CLASS, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { MetricRow, type Metric } from '@/ui/components/metric';
import { PageHeader } from '@/ui/components/page';
import { formatDateTime } from '@/ui/format';

import { AppShell } from './app-shell';

export const dynamic = 'force-dynamic';

export default async function DashboardPage(): Promise<ReactNode> {
  // Erste Anweisung: die Sitzungsprüfung (Spec §11.2).
  const session = await requireSession();
  const [status, company, invoices] = await Promise.all([
    checkSystemStatus(),
    getCompanyProfile(session.organization),
    listInvoices(session.organization),
  ]);
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  /*
   * Die vier Kennzahlen (§4.1).
   *
   * Gerechnet wird hier aus der Liste, die ohnehin geladen wird — die
   * ausgewiesene Auswertungsfunktion `getDashboardMetrics()` samt Diagramm und
   * Fristenlisten gehört zu M6 (FA-DASH-01 bis -11) und wird hier **nicht**
   * vorweggenommen. Was hier entsteht, ist die Fläche: Ohne sie ließe sich die
   * tragende These des Entwurfs — „die Zahl ist die Überschrift" — gar nicht
   * beurteilen, weil sie nie zu sehen war.
   *
   * Was von der Auswertung schon gilt, gilt an der richtigen Stelle: Welcher
   * Beleg zählt, entscheidet `src/domain/invoice/revenue.ts` und nicht diese
   * Seite. Gutschriften bleiben damit außen vor.
   */
  const reference = today();
  const receivables = invoices.filter(countsTowardReceivables);
  const overdue = receivables.filter((invoice) => invoice.isOverdue);
  const revenue = invoices.filter(countsTowardRevenue);

  const outstandingOf = (entries: readonly (typeof invoices)[number][]) =>
    sumCents(
      entries.map((invoice) =>
        subtractCents(cents(invoice.grossTotalCents), cents(invoice.paidTotalCents)),
      ),
    );

  const netIn = (prefix: string) =>
    sumCents(
      revenue
        .filter((invoice) => invoice.issueDate?.startsWith(prefix) === true)
        .map((invoice) => cents(invoice.netTotalCents)),
    );

  const month = reference.slice(0, 7);
  const year = reference.slice(0, 4);

  const metrics: readonly Metric[] = [
    {
      label: messages.dashboard.metricOutstanding,
      value: formatMoneyDe(receivables.length === 0 ? ZERO_CENTS : outstandingOf(receivables)),
    },
    {
      label: messages.dashboard.metricOverdue,
      value: formatMoneyDe(overdue.length === 0 ? ZERO_CENTS : outstandingOf(overdue)),
      note:
        overdue.length === 1
          ? messages.dashboard.metricInvoiceOne
          : messages.dashboard.metricInvoices.replace('{count}', String(overdue.length)),
    },
    {
      label: messages.dashboard.metricRevenueMonth,
      value: formatMoneyDe(netIn(month)),
      note: messages.dashboard.metricNet,
    },
    {
      label: messages.dashboard.metricRevenueYear.replace('{year}', year),
      value: formatMoneyDe(netIn(year)),
      note: messages.dashboard.metricNet,
    },
  ];

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={DASHBOARD_PATH}>
      <PageHeader title={messages.dashboard.heading} />

      <MetricRow metrics={metrics} />

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
