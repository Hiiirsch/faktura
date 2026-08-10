import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCompanyProfileOrEmpty } from '@/application/company/company-profile';
import { getCustomer } from '@/application/customers/customer-service';
import type { CountryCode } from '@/domain/codes/country-code';
import { resolvePaymentTerms } from '@/domain/customer/payment-terms';
import { determineTaxScheme } from '@/domain/tax/tax-scheme';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { CUSTOMERS_PATH } from '@/routes';
import { CARD_CLASS, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';

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
  const customer = await getCustomer(id);
  if (customer === null) {
    notFound();
  }

  const company = await getCompanyProfileOrEmpty();

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
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {messages.customers.invoicesPending}
          </p>
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
