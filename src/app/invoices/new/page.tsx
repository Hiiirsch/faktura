import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { COMPANY_SETTINGS_PATH, CUSTOMERS_PATH, INVOICES_PATH } from '@/routes';
import { Alert, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';

import { AppNav } from '../../app-nav';
import { loadEditorContext } from '../editor-data';
import { InvoiceEditor } from '../invoice-editor';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.invoices.createHeading} · ${messages.app.name}` };

export default async function NewInvoicePage(): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  const context = await loadEditorContext();

  const first = context.customers[0];

  return (
    <>
      <AppNav currentPath={INVOICES_PATH} csrfToken={csrfToken} email={session.email} />

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <Link
            href={INVOICES_PATH}
            className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
          >
            {messages.common.back}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            {messages.invoices.createHeading}
          </h1>
        </header>

        {!context.hasCompanyProfile ? (
          <Alert tone="error">
            <span className="flex flex-wrap items-center gap-3">
              {messages.invoices.noCompanyProfile}
              <Link href={COMPANY_SETTINGS_PATH} className={SECONDARY_BUTTON_CLASS}>
                {messages.company.heading}
              </Link>
            </span>
          </Alert>
        ) : null}

        {first === undefined ? (
          <Alert tone="error">
            <span className="flex flex-wrap items-center gap-3">
              {messages.invoices.noCustomers}
              <Link href={CUSTOMERS_PATH} className={SECONDARY_BUTTON_CLASS}>
                {messages.customers.create}
              </Link>
            </span>
          </Alert>
        ) : (
          <>
            <NoScriptNotice message={messages.common.noScript} />
            <InvoiceEditor
              initial={{
                invoiceId: null,
                customerId: first.id,
                taxScheme: context.suggestedTaxScheme,
                currency: context.defaultCurrency,
                issueDate: context.today,
                serviceDateFrom: context.today,
                serviceDateTo: '',
                dueDate: context.suggestedDueDate,
                introText: '',
                outroText: '',
                purchaseOrderRef: '',
                // Die erste Position legt der Editor selbst an — `emptyLine`
                // lebt in der Client-Komponente und ist vom Server nicht
                // aufrufbar.
                lines: [],
              }}
              customers={context.customers}
              catalog={context.catalog}
              defaultTaxRatePercent={context.defaultTaxRatePercent}
              csrfToken={csrfToken}
            />
          </>
        )}
      </main>
    </>
  );
}
