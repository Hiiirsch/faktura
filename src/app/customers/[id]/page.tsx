import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCompanyProfileOrEmpty } from '@/application/company/company-profile';
import { getCustomer } from '@/application/customers/customer-service';
import { listInvoicesForCustomer } from '@/application/invoices/invoice-queries';
import { cents } from '@/domain/money/money';
import type { CountryCode } from '@/domain/codes/country-code';
import { resolvePaymentTerms } from '@/domain/customer/payment-terms';
import { determineTaxScheme } from '@/domain/tax/tax-scheme';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { CUSTOMERS_PATH, invoicePath } from '@/routes';
import { CARD_CLASS, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { formatMoney } from '@/ui/format';

import { formatGermanDate, InvoiceStatusBadge } from '../../invoices/status-badge';

import { AppNav } from '../../app-nav';
import { setCustomerArchivedAction } from '../actions';
import { CustomerForm } from '../customer-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.customers.editHeading} · ${messages.app.name}` };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const { id } = await params;
  const customer = await getCustomer(session.organization, id);
  if (customer === null) {
    notFound();
  }

  const [company, invoices] = await Promise.all([
    getCompanyProfileOrEmpty(session.organization),
    listInvoicesForCustomer(session.organization, id),
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

  return (
    <>
      <AppNav currentPath={CUSTOMERS_PATH} csrfToken={csrfToken} email={session.email} />

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href={CUSTOMERS_PATH}
              className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
            >
              {messages.common.back}
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">
              {customer.companyName ?? customer.contactName ?? customer.customerNumber}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {messages.customers.number}: <span className="tabular-nums">{customer.customerNumber}</span>
              {customer.isArchived ? ` · ${messages.customers.archivedBadge}` : ''}
            </p>
          </div>
        </header>

        <section className={CARD_CLASS}>
          <h2 className="text-lg font-medium">{messages.customers.taxSchemeHeading}</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-neutral-600 dark:text-neutral-400">
                {messages.customers.taxSchemeHint}
              </dt>
              <dd className="font-medium">{messages.taxScheme[taxScheme]}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-neutral-600 dark:text-neutral-400">
                {messages.customers.paymentTerms}
              </dt>
              <dd className="font-medium tabular-nums">{effectivePaymentTerms}</dd>
            </div>
          </dl>
        </section>

        <NoScriptNotice message={messages.common.noScript} />

        <CustomerForm customer={customer} csrfToken={csrfToken} />

        <section className={CARD_CLASS}>
          <h2 className="text-lg font-medium">{messages.customers.invoicesHeading}</h2>

          {invoices.length === 0 ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {messages.customers.invoicesEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
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
                      className="border-b border-neutral-100 dark:border-neutral-900"
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
                        {formatGermanDate(invoice.issueDate)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatMoney(cents(invoice.grossTotalCents), invoice.currency as 'EUR')}
                      </td>
                      <td className="py-2">
                        <InvoiceStatusBadge
                          status={invoice.status}
                          isOverdue={invoice.isOverdue}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={CARD_CLASS}>
          <h2 className="text-lg font-medium">
            {customer.isArchived ? messages.customers.unarchive : messages.customers.archive}
          </h2>
          {/* NFA-COMP-04: Die Erklärung steht an der Stelle des Löschversuchs. */}
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {messages.customers.archiveExplanation}
          </p>
          <form action={setCustomerArchivedAction}>
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <input type="hidden" name="id" value={customer.id} />
            <input type="hidden" name="isArchived" value={customer.isArchived ? 'false' : 'true'} />
            <button type="submit" className={SECONDARY_BUTTON_CLASS}>
              {customer.isArchived ? messages.customers.unarchive : messages.customers.archive}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
