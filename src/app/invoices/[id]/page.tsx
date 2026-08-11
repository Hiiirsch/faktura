import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { loadInvoiceDetail } from '@/application/invoices/invoice-queries';
import { getAppTimeZone } from '@/application/system/display-settings';
import { isTaxCategoryCode } from '@/domain/codes/tax-category';
import { isUnitCode } from '@/domain/codes/unit-code';
import { PERCENT_BASIS_POINTS } from '@/domain/invoice/totals';
import { outstandingAmount } from '@/domain/invoice/status';
import { cents } from '@/domain/money/money';
import { quantityFromScaled } from '@/domain/quantity/quantity';
import { isTaxScheme } from '@/domain/tax/tax-scheme';
import { todayIn } from '@/domain/time/plain-date';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { customerPath, INVOICES_PATH, invoicePath } from '@/routes';
import { ConfirmButton } from '@/ui/components/confirm-button';
import { CARD_CLASS, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { formatMoney, formatPercent, formatQuantity, formatUnit } from '@/ui/format';

import { AppNav } from '../../app-nav';
import { cancelInvoiceAction, deleteDraftAction, duplicateInvoiceAction } from '../actions';
import { loadEditorContext } from '../editor-data';
import { InvoiceEditor } from '../invoice-editor';
import { PaymentSection } from './payment-section';
import { formatGermanDate, InvoiceStatusBadge } from '../status-badge';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.invoices.viewHeading} · ${messages.app.name}` };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const { id } = await params;
  const invoice = await loadInvoiceDetail(id);
  if (invoice === null) {
    notFound();
  }

  const isDraft = invoice.status === 'DRAFT';
  const currency = invoice.currency as 'EUR';
  const outstanding = outstandingAmount(
    cents(invoice.grossTotalCents),
    cents(invoice.paidTotalCents),
  );

  const title = invoice.invoiceNumber ?? messages.invoices.noNumber;

  return (
    <>
      <AppNav currentPath={INVOICES_PATH} csrfToken={csrfToken} email={session.email} />

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href={INVOICES_PATH}
              className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
            >
              {messages.common.back}
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">
              {invoice.documentType === 'CREDIT_NOTE'
                ? `${messages.invoices.creditNote} ${title}`
                : title}
            </h1>
            <InvoiceStatusBadge status={invoice.status} isOverdue={invoice.isOverdue} />
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={duplicateInvoiceAction}>
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                {messages.invoices.duplicate}
              </button>
            </form>

            {isDraft ? (
              <form action={deleteDraftAction}>
                <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <ConfirmButton message={messages.invoices.deleteConfirm}>
                  {messages.invoices.deleteDraft}
                </ConfirmButton>
              </form>
            ) : null}
          </div>
        </header>

        {isDraft ? (
          <DraftEditor invoiceId={invoice.id} csrfToken={csrfToken} invoice={invoice} />
        ) : (
          <IssuedView invoice={invoice} currency={currency} csrfToken={csrfToken} />
        )}

        {isDraft || invoice.documentType === 'CREDIT_NOTE' ? null : (
          <PaymentSection
            invoiceId={invoice.id}
            csrfToken={csrfToken}
            currency={currency}
            outstandingCents={outstanding}
            today={todayIn(getAppTimeZone(), new Date())}
            payments={invoice.payments.map((payment) => ({
              id: payment.id,
              amountCents: payment.amountCents,
              paidAt: payment.paidAt,
              method: payment.method,
              note: payment.note,
            }))}
          />
        )}

        {invoice.status === 'ISSUED' ||
        invoice.status === 'PARTIALLY_PAID' ||
        invoice.status === 'PAID' ? (
          <section className={CARD_CLASS}>
            <h2 className="text-lg font-medium">{messages.invoices.cancelConfirmTitle}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {messages.invoices.cancelConfirm}
            </p>
            <form action={cancelInvoiceAction} className="flex flex-col gap-3">
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <label className="flex flex-col gap-1.5 sm:max-w-lg">
                <span className="text-sm font-medium">{messages.invoices.cancelReason}</span>
                <input
                  name="reason"
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {messages.invoices.cancelReasonHint}
                </span>
              </label>
              <div>
                <ConfirmButton message={messages.invoices.cancelConfirm}>
                  {messages.invoices.cancelInvoice}
                </ConfirmButton>
              </div>
            </form>
          </section>
        ) : null}

        {invoice.cancelledBy.length > 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {messages.invoices.cancelledBy}:{' '}
            {invoice.cancelledBy.map((entry) => (
              <Link
                key={entry.id}
                href={invoicePath(entry.id)}
                className="underline underline-offset-4"
              >
                {entry.invoiceNumber}
              </Link>
            ))}
          </p>
        ) : null}

        {invoice.precedingInvoice === null ? null : (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {messages.invoices.cancels}:{' '}
            <Link
              href={invoicePath(invoice.precedingInvoice.id)}
              className="underline underline-offset-4"
            >
              {invoice.precedingInvoice.invoiceNumber}
            </Link>
          </p>
        )}
      </main>
    </>
  );
}

async function DraftEditor({
  invoiceId,
  csrfToken,
  invoice,
}: {
  readonly invoiceId: string;
  readonly csrfToken: string;
  readonly invoice: NonNullable<Awaited<ReturnType<typeof loadInvoiceDetail>>>;
}): Promise<ReactNode> {
  const context = await loadEditorContext();

  return (
    <>
      <NoScriptNotice message={messages.common.noScript} />
      <InvoiceEditor
        initial={{
          invoiceId,
          customerId: invoice.customerId,
          taxScheme: isTaxScheme(invoice.taxScheme) ? invoice.taxScheme : 'STANDARD',
          currency: invoice.currency,
          issueDate: invoice.issueDate ?? '',
          serviceDateFrom: invoice.serviceDateFrom ?? '',
          serviceDateTo: invoice.serviceDateTo ?? '',
          dueDate: invoice.dueDate ?? '',
          introText: invoice.introText ?? '',
          outroText: invoice.outroText ?? '',
          purchaseOrderRef: invoice.purchaseOrderRef ?? '',
          lines: invoice.lines.map((line, index) => ({
            key: `existing-${String(index)}`,
            name: line.name,
            description: line.description ?? '',
            quantity: formatQuantity(quantityFromScaled(line.quantityScaled)),
            unitCode: isUnitCode(line.unitCode) ? line.unitCode : 'C62',
            unitPrice: (line.unitPriceCents / 100).toFixed(2).replace('.', ','),
            taxRate: String(line.taxRateBasisPoints / PERCENT_BASIS_POINTS),
            discount: String(line.discountBasisPoints / PERCENT_BASIS_POINTS),
            taxCategory: isTaxCategoryCode(line.taxCategory) ? line.taxCategory : 'S',
          })),
        }}
        customers={context.customers}
        catalog={context.catalog}
        defaultTaxRatePercent={context.defaultTaxRatePercent}
        csrfToken={csrfToken}
      />
    </>
  );
}

function IssuedView({
  invoice,
  currency,
}: {
  readonly invoice: NonNullable<Awaited<ReturnType<typeof loadInvoiceDetail>>>;
  readonly currency: 'EUR';
  readonly csrfToken: string;
}): ReactNode {
  const seller = invoice.sellerSnapshot;
  const buyer = invoice.buyerSnapshot;

  return (
    <>
      <p className="rounded-md border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        {messages.invoices.frozenHint}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-medium">{messages.invoices.sellerHeading}</h2>
          {seller === null ? (
            <p className="text-sm">{messages.common.none}</p>
          ) : (
            <address className="text-sm not-italic leading-6">
              {seller.name}
              <br />
              {seller.addressLine1}
              <br />
              {seller.postalCode} {seller.city}
              <br />
              {seller.taxNumber === null ? null : <>Steuernummer: {seller.taxNumber}<br /></>}
              {seller.vatId === null ? null : <>USt-IdNr: {seller.vatId}<br /></>}
              {seller.iban === null ? null : <>IBAN: {seller.iban}</>}
            </address>
          )}
        </section>

        <section className={CARD_CLASS}>
          <h2 className="text-lg font-medium">{messages.invoices.buyerHeading}</h2>
          {buyer === null ? (
            <p className="text-sm">{messages.common.none}</p>
          ) : (
            <address className="text-sm not-italic leading-6">
              {buyer.name}
              <br />
              {buyer.addressLine1}
              <br />
              {buyer.postalCode} {buyer.city}
              <br />
              {messages.customers.number}:{' '}
              <Link href={customerPath(invoice.customerId)} className="underline underline-offset-4">
                {buyer.customerNumber}
              </Link>
              {buyer.vatId === null ? null : <><br />USt-IdNr: {buyer.vatId}</>}
            </address>
          )}
        </section>
      </div>

      <section className={CARD_CLASS}>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.issueDate}</dt>
            <dd className="tabular-nums">{formatGermanDate(invoice.issueDate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.dueDate}</dt>
            <dd className="tabular-nums">{formatGermanDate(invoice.dueDate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.serviceDateFrom}</dt>
            <dd className="tabular-nums">{formatGermanDate(invoice.serviceDateFrom)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.taxScheme}</dt>
            <dd>
              {isTaxScheme(invoice.taxScheme) ? messages.taxScheme[invoice.taxScheme] : invoice.taxScheme}
            </dd>
          </div>
        </dl>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="text-lg font-medium">{messages.invoices.linesHeading}</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                <th scope="col" className="py-2 pr-3 font-medium">{messages.invoices.linePosition}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{messages.invoices.lineName}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{messages.invoices.lineQuantity}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{messages.invoices.lineUnitPrice}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{messages.invoices.lineTaxRate}</th>
                <th scope="col" className="py-2 text-right font-medium">{messages.invoices.lineNet}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2 pr-3 tabular-nums">{line.position}</td>
                  <td className="py-2 pr-3">
                    {line.name}
                    {line.description === null ? null : (
                      <span className="block text-neutral-600 dark:text-neutral-400">
                        {line.description}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatQuantity(quantityFromScaled(line.quantityScaled))}{' '}
                    {isUnitCode(line.unitCode) ? formatUnit(line.unitCode) : line.unitCode}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatMoney(cents(line.unitPriceCents), currency)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatPercent(line.taxRateBasisPoints)} ({line.taxCategory})
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMoney(cents(line.lineNetCents), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="flex flex-col gap-2 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.net}</dt>
            <dd className="tabular-nums">{formatMoney(cents(invoice.netTotalCents), currency)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.tax}</dt>
            <dd className="tabular-nums">{formatMoney(cents(invoice.taxTotalCents), currency)}</dd>
          </div>
          <div className="flex justify-between gap-4 font-medium">
            <dt>{messages.invoices.gross}</dt>
            <dd className="tabular-nums">{formatMoney(cents(invoice.grossTotalCents), currency)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
