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
import { SECTION_CLASS, NoScriptNotice } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { AppShell } from '../../app-shell';
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
    <AppShell session={session} csrfToken={csrfToken} currentPath={NUMBERING_SETTINGS_PATH}>
      <PageHeader title={messages.numbering.heading} description={messages.numbering.intro} />

        <NoScriptNotice message={messages.common.noScript} />

        <section className={SECTION_CLASS}>
          <h2 className="text-section font-medium">{messages.numbering.formatHeading}</h2>
          <NumberFormatForm format={format} csrfToken={csrfToken} />
          <p className="border-t border-rule pt-4 text-ui">
            {messages.numbering.formatPreview}:{' '}
            <code className="rounded-control bg-surface-sunken px-2 py-1 font-mono">
              {preview}
            </code>
          </p>
        </section>

        <section className={SECTION_CLASS}>
          <div className="flex flex-col gap-1">
            <h2 className="text-section font-medium">{messages.numbering.statesHeading}</h2>
            <p className="text-ui text-ink-muted">
              {messages.numbering.statesIntro}
            </p>
          </div>

          {sequences.length === 0 ? (
            <p className="text-ui text-ink-muted">
              {messages.numbering.statesEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-ui">
                <thead>
                  <tr className="border-b border-rule text-left">
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
                      className="border-b border-rule"
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

        <section className={SECTION_CLASS}>
          <div className="flex flex-col gap-1">
            <h2 className="text-section font-medium">{messages.numbering.startValueHeading}</h2>
            <p className="text-ui text-ink-muted">
              {messages.numbering.startValueIntro}
            </p>
          </div>
          <StartValueForm suggestedScope={currentScope} csrfToken={csrfToken} />
        </section>
    </AppShell>
  );
}
