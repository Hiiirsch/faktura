import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCompanyProfileOrEmpty } from '@/application/company/company-profile';
import { listInvoiceSequences } from '@/application/invoices/invoice-numbering';
import { getAppTimeZone } from '@/application/system/display-settings';
import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  formatInvoiceNumber,
  sequenceScopeFor,
} from '@/domain/invoice/number-format';
import { todayIn } from '@/domain/time/plain-date';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { NUMBERING_SETTINGS_PATH } from '@/routes';
import { CARD_CLASS, NoScriptNotice } from '@/ui/components/form';

import { AppNav } from '../../app-nav';
import { NumberFormatForm, StartValueForm } from './numbering-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.numbering.title} · ${messages.app.name}` };

export default async function NumberingSettingsPage(): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const [company, sequences] = await Promise.all([
    getCompanyProfileOrEmpty(session.organization),
    listInvoiceSequences(session.organization),
  ]);

  const format =
    'invoiceNumberFormat' in company && typeof company.invoiceNumberFormat === 'string'
      ? company.invoiceNumberFormat
      : DEFAULT_INVOICE_NUMBER_FORMAT;

  const today = todayIn(getAppTimeZone(), new Date());
  const currentScope = sequenceScopeFor(format, today);
  const currentSequence = sequences.find((sequence) => sequence.scope === currentScope);
  const preview = formatInvoiceNumber(format, today, (currentSequence?.lastValue ?? 0) + 1);

  return (
    <>
      <AppNav currentPath={NUMBERING_SETTINGS_PATH} csrfToken={csrfToken} email={session.email} />

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{messages.numbering.heading}</h1>
          <p className="text-neutral-600 dark:text-neutral-400">{messages.numbering.intro}</p>
        </header>

        <NoScriptNotice message={messages.common.noScript} />

        <section className={CARD_CLASS}>
          <h2 className="text-lg font-medium">{messages.numbering.formatHeading}</h2>
          <NumberFormatForm format={format} csrfToken={csrfToken} />
          <p className="border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
            {messages.numbering.formatPreview}:{' '}
            <code className="rounded bg-neutral-100 px-2 py-1 font-mono dark:bg-neutral-800">
              {preview}
            </code>
          </p>
        </section>

        <section className={CARD_CLASS}>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium">{messages.numbering.statesHeading}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {messages.numbering.statesIntro}
            </p>
          </div>

          {sequences.length === 0 ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {messages.numbering.statesEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {messages.numbering.scope}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      {messages.numbering.lastValue}
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      {messages.numbering.nextValue}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sequences.map((sequence) => (
                    <tr
                      key={sequence.scope}
                      className="border-b border-neutral-100 dark:border-neutral-900"
                    >
                      <td className="py-2 pr-4 font-mono">{sequence.scope}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{sequence.lastValue}</td>
                      <td className="py-2 text-right tabular-nums">{sequence.lastValue + 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={CARD_CLASS}>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium">{messages.numbering.startValueHeading}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {messages.numbering.startValueIntro}
            </p>
          </div>
          <StartValueForm suggestedScope={currentScope} csrfToken={csrfToken} />
        </section>
      </main>
    </>
  );
}
