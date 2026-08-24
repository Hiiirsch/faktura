import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { formatPlainDateDe } from '@/domain/format/de';


import { authorizeOptional, requirePermission } from '@/application/auth/authorize';
import { getCompanyProfileOrEmpty } from '@/application/company/company-profile';
import { getCustomer } from '@/application/customers/customer-service';
import {
  listInvoicesForCustomer,
  today,
  type InvoiceListEntry,
} from '@/application/invoices/invoice-queries';
import type { CurrencyCode } from '@/domain/codes/currency-code';
import { cents } from '@/domain/money/money';
import { daysBetween, plainDate } from '@/domain/time/plain-date';
import type { CountryCode } from '@/domain/codes/country-code';
import { resolvePaymentTerms } from '@/domain/customer/payment-terms';
import { determineTaxScheme } from '@/domain/tax/tax-scheme';
import { can } from '@/domain/policy/can';
import { messages } from '@/i18n/de';
import { InvoiceStatusField } from '@/ui/components/status-field';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { CUSTOMERS_PATH, invoicePath } from '@/routes';
import { SECTION_CLASS, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { formatMoney } from '@/ui/format';


import { AppShell } from '../../app-shell';
import { setCustomerArchivedAction } from '../actions';
import { CustomerForm } from '../customer-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.customers.editHeading} · ${messages.app.name}` };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const session = await requirePermission('customer.read', 'companyProfile.read');
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const { id } = await params;
  const customer = await getCustomer(session.organization, id);
  if (customer === null) {
    notFound();
  }

  /*
   * Die Belege des Kunden nur mit `invoice.read` (M8).
   *
   * Ein Konto der Stammdatenpflege sieht die Kundenseite, aber keine Belege —
   * nicht: keine Kundenseite. Deshalb `authorizeOptional` und ein leerer
   * Abschnitt statt einer verweigerten Seite.
   */
  const readInvoices = authorizeOptional(session, 'invoice.read');

  const [company, invoices] = await Promise.all([
    getCompanyProfileOrEmpty(session.organization),
    readInvoices === null ? [] : listInvoicesForCustomer(readInvoices, id),
  ]);

  // Vorschlag für neue Rechnungen an diesen Kunden (FA-STAMM-03).
  const taxScheme = determineTaxScheme({
    sellerIsSmallBusiness: company.isSmallBusiness,
    sellerCountry: company.countryCode as CountryCode,
    buyerCountry: customer.countryCode as CountryCode,
    buyerHasVatId: customer.vatId !== null,
  });

  const effectivePaymentTerms = resolvePaymentTerms(
    customer.paymentTerms,
    company.defaultPaymentTerms,
  );
  const reference = today();

  /** Tage seit der Fälligkeit — nur für den Nachsatz am Status (FA-UI-06). */
  function daysOverdue(invoice: InvoiceListEntry): number | null {
    if (!invoice.isOverdue || invoice.dueDate === null) {
      return null;
    }
    return daysBetween(plainDate(invoice.dueDate), reference);
  }

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={CUSTOMERS_PATH}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href={CUSTOMERS_PATH}
              className="text-ui text-ink-muted underline underline-offset-4"
            >
              {messages.common.back}
            </Link>
            <h1 className="text-title font-semibold text-ink">
              {customer.companyName ?? customer.contactName ?? customer.customerNumber}
            </h1>
            <p className="text-ui text-ink-muted">
              {messages.customers.number}: <span className="tabular-nums">{customer.customerNumber}</span>
              {customer.isArchived ? ` · ${messages.customers.archivedBadge}` : ''}
            </p>
          </div>
        </header>

        <section className={SECTION_CLASS}>
          <h2 className="text-section font-medium">{messages.customers.taxSchemeHeading}</h2>
          <dl className="flex flex-col gap-2 text-ui">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-muted">
                {messages.customers.taxSchemeHint}
              </dt>
              <dd className="font-medium">{messages.taxScheme[taxScheme]}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-muted">
                {messages.customers.paymentTerms}
              </dt>
              <dd className="font-medium tabular-nums">{effectivePaymentTerms}</dd>
            </div>
          </dl>
        </section>

        <NoScriptNotice message={messages.common.noScript} />

        <CustomerForm customer={customer} csrfToken={csrfToken} />

        <section className={SECTION_CLASS}>
          <h2 className="text-section font-medium">{messages.customers.invoicesHeading}</h2>

          {invoices.length === 0 ? (
            <p className="text-ui text-ink-muted">
              {messages.customers.invoicesEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-ui">
                <thead>
                  <tr className="border-b border-rule text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {messages.invoices.number}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {messages.invoices.issueDate}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      {messages.invoices.gross}
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      {messages.invoices.filterStatus}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="border-b border-rule"
                    >
                      <td className="py-2 pr-4 tabular-nums">
                        <Link
                          href={invoicePath(invoice.id)}
                          className="underline underline-offset-4"
                        >
                          {invoice.invoiceNumber ?? messages.invoices.noNumber}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {formatPlainDateDe(invoice.issueDate)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatMoney(cents(invoice.grossTotalCents), invoice.currency as 'EUR')}
                      </td>
                      <td className="py-2">
                        <InvoiceStatusField
                          status={invoice.status}
                          documentType={invoice.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE'}
                          isOverdue={invoice.isOverdue}
                          daysOverdue={daysOverdue(invoice)}
                          paidTotalCents={cents(invoice.paidTotalCents)}
                          grossTotalCents={cents(invoice.grossTotalCents)}
                          currency={invoice.currency as CurrencyCode}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={SECTION_CLASS}>
          <h2 className="text-section font-medium">
            {customer.isArchived ? messages.customers.unarchive : messages.customers.archive}
          </h2>
          {/* NFA-COMP-04: Die Erklärung steht an der Stelle des Löschversuchs. */}
          <p className="text-ui text-ink-muted">
            {messages.customers.archiveExplanation}
          </p>
          {/* Auch das Archivieren verlangt ein Recht (M12, FA-UI-14). */}
          {!can(session.actor, 'archive', 'customer') ? null : (
          <form action={setCustomerArchivedAction}>
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <input type="hidden" name="id" value={customer.id} />
            <input type="hidden" name="isArchived" value={customer.isArchived ? 'false' : 'true'} />
            <button type="submit" className={SECONDARY_BUTTON_CLASS}>
              {customer.isArchived ? messages.customers.unarchive : messages.customers.archive}
            </button>
          </form>
          )}
        </section>
    </AppShell>
  );
}
