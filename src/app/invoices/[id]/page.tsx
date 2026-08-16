import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { formatPlainDateDe } from '@/domain/format/de';

import { requireSession } from '@/application/auth/require-session';
import { loadInvoiceDetail, today } from '@/application/invoices/invoice-queries';
import { getAppTimeZone } from '@/application/system/display-settings';
import { isTaxCategoryCode } from '@/domain/codes/tax-category';
import { isUnitCode } from '@/domain/codes/unit-code';
import { PERCENT_BASIS_POINTS } from '@/domain/invoice/totals';
import { outstandingAmount } from '@/domain/invoice/status';
import type { CurrencyCode } from '@/domain/codes/currency-code';
import { cents } from '@/domain/money/money';
import { daysBetween, plainDate } from '@/domain/time/plain-date';
import { quantityFromScaled } from '@/domain/quantity/quantity';
import { isTaxScheme } from '@/domain/tax/tax-scheme';
import { todayIn } from '@/domain/time/plain-date';
import { messages } from '@/i18n/de';
import { InvoiceStatusField } from '@/ui/components/status-field';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import {
  customerPath,
  INVOICES_PATH,
  invoicePath,
  invoicePdfEmbedPath,
  invoicePdfPath,
} from '@/routes';
import { ConfirmDialog } from '@/ui/components/dialog';
import { SECTION_CLASS, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';
import { formatMoney, formatPercent, formatQuantity, formatUnit } from '@/ui/format';

import { AppShell } from '../../app-shell';
import { cancelInvoiceAction, deleteDraftAction, duplicateInvoiceAction } from '../actions';
import type { OrganizationContext } from '@/application/auth/session-service';

import { editorBuyerOf, loadEditorContext } from '../editor-data';
import { InvoiceEditor } from '../invoice-editor';
import { PaymentSection } from './payment-section';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.invoices.viewHeading} · ${messages.app.name}` };

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const { id } = await params;
  // Gesetzt von der Festschreib-Aktion, die hierher umleitet.
  const justIssued = (await searchParams).festgeschrieben === '1';
  const invoice = await loadInvoiceDetail(session.organization, id);
  if (invoice === null) {
    notFound();
  }

  const isDraft = invoice.status === 'DRAFT';
  const currency = invoice.currency as CurrencyCode;

  /** Tage seit der Fälligkeit — nur für den Nachsatz am Status (FA-UI-06). */
  const daysOverdue =
    invoice.isOverdue && invoice.dueDate !== null
      ? daysBetween(plainDate(invoice.dueDate), today())
      : null;
  const outstanding = outstandingAmount(
    cents(invoice.grossTotalCents),
    cents(invoice.paidTotalCents),
  );

  const title = invoice.invoiceNumber ?? messages.invoices.noNumber;
  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={INVOICES_PATH}>
        <PageHeader
          title={
            invoice.documentType === 'CREDIT_NOTE'
              ? `${messages.invoices.creditNote} ${title}`
              : title
          }
          /*
            Der eine inszenierte Moment (§2.4, FA-UI-07): Die eben vergebene
            Nummer wird eingestempelt. Der Anlass steht in der Adresse, weil
            der Editor mit dem Festschreiben verschwindet — ein Zustand im
            Editor wäre in demselben Durchlauf weg, in dem er entsteht.
            `prefers-reduced-motion` schaltet die Bewegung in `globals.css` ab.
          */
          titleClassName={justIssued ? 'stamp-in' : ''}
          backHref={INVOICES_PATH}
          backLabel={messages.invoices.heading}
          meta={
            <InvoiceStatusField
              status={invoice.status}
              isOverdue={invoice.isOverdue}
              daysOverdue={daysOverdue}
              paidTotalCents={cents(invoice.paidTotalCents)}
              grossTotalCents={cents(invoice.grossTotalCents)}
              currency={invoice.currency as CurrencyCode}
            />
          }
          actions={
            <>
            {/* Download des Belegs (FA-PDF-01); ein Entwurf wird dabei sichtbar
                als solcher gekennzeichnet (FA-PDF-03). */}
            <a
              href={invoicePdfPath(invoice.id)}
              className={SECONDARY_BUTTON_CLASS}
              download
            >
              {messages.templates.downloadPdf}
            </a>

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
                <ConfirmDialog
                  title={messages.invoices.deleteConfirmTitle}
                  message={messages.invoices.deleteConfirm}
                  confirmLabel={messages.invoices.deleteDraft}
                  tone="danger"
                  trigger={
                    <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                      {messages.invoices.deleteDraft}
                    </button>
                  }
                />
              </form>
            ) : null}
            </>
          }
        />

        {/*
          Zweispaltig (§4.3): links das Formular, rechts das Blatt.

          Das Blatt bleibt beim Scrollen stehen — man arbeitet an der linken
          Spalte und sieht rechts, was dabei entsteht. Untereinander gestellt
          hatte die Vorschau denselben Nutzen wie ein Ausdruck im Nebenzimmer.

          Unter 1024 px klappt die Anordnung auf eine Spalte, das Blatt nach
          unten: Auf einem schmalen Gerät nebeneinander wären beide zu schmal
          für ihren Zweck (§3).
        */}
        <div className="grid gap-8 lg:grid-cols-[minmax(30rem,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            {isDraft ? (
              <DraftEditor
                invoiceId={invoice.id}
                csrfToken={csrfToken}
                invoice={invoice}
                organization={session.organization}
              />
            ) : (
              <IssuedView invoice={invoice} currency={currency} csrfToken={csrfToken} />
            )}
          </div>

          {/*
          Das Blatt: die einzige erhabene Fläche der Anwendung, eckig und weiß
          (Frontend-Entwurf §1, FA-UI-02).

          Eingebettet wird **das PDF selbst**, nicht eine HTML-Nachbildung. Die
          hatte einen Fehler, der sich nicht beheben ließ: `@page`-Ränder gelten
          nur beim Drucken, am Bildschirm lief der Inhalt randlos über die volle
          Breite. Was hier steht, ist dieselbe Datei, die der Download liefert
          (FA-PDF-02).

          Kein `sandbox`: Der eingebaute Betrachter des Browsers ist eine eigene
          gekapselte Anwendung und startet darunter nicht.
        */}
          <section className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6">
            <h2 className="text-section font-semibold text-ink">{messages.templates.preview}</h2>
            <div className="bg-sheet shadow-sheet">
              <iframe
                src={invoicePdfEmbedPath(invoice.id)}
                title={messages.templates.previewFrame}
                className="h-sheet-view w-full border-0"
              />
            </div>
          </section>
        </div>

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
          <section className={SECTION_CLASS}>
            <h2 className="text-section font-medium">{messages.invoices.cancelConfirmTitle}</h2>
            {/*
              Warum es kein Löschen gibt, steht an der Stelle, an der jemand
              danach sucht (NFA-COMP-04).
            */}
            <p className="max-w-form text-ui text-ink-muted">
              {messages.invoices.noDeleteExplanation}
            </p>
            <p className="max-w-form text-ui text-ink-muted">
              {messages.invoices.cancelConfirm}
            </p>
            <form action={cancelInvoiceAction} className="flex flex-col gap-3">
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <label className="flex max-w-form flex-col gap-1.5">
                <span className="text-ui font-medium">{messages.invoices.cancelReason}</span>
                <input
                  name="reason"
                  className="w-full rounded-control border border-rule bg-surface px-3 py-2"
                />
                <span className="text-ui text-ink-muted">
                  {messages.invoices.cancelReasonHint}
                </span>
              </label>
              <div>
                <ConfirmDialog
                  title={messages.invoices.cancelConfirmTitle}
                  message={messages.invoices.cancelConfirm}
                  confirmLabel={messages.invoices.cancelInvoice}
                  tone="danger"
                  trigger={
                    <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                      {messages.invoices.cancelInvoice}
                    </button>
                  }
                />
              </div>
            </form>
          </section>
        ) : null}

        {invoice.cancelledBy.length > 0 ? (
          <p className="text-ui text-ink-muted">
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
          <p className="text-ui text-ink-muted">
            {messages.invoices.cancels}:{' '}
            <Link
              href={invoicePath(invoice.precedingInvoice.id)}
              className="underline underline-offset-4"
            >
              {invoice.precedingInvoice.invoiceNumber}
            </Link>
          </p>
        )}
    </AppShell>
  );
}

async function DraftEditor({
  invoiceId,
  csrfToken,
  invoice,
  organization,
}: {
  readonly invoiceId: string;
  readonly csrfToken: string;
  readonly invoice: NonNullable<Awaited<ReturnType<typeof loadInvoiceDetail>>>;
  readonly organization: OrganizationContext;
}): Promise<ReactNode> {
  const context = await loadEditorContext(organization);

  return (
    <>
      <NoScriptNotice message={messages.common.noScript} />
      <InvoiceEditor
        initial={{
          invoiceId,
          buyer: editorBuyerOf(invoice),
          templateId: invoice.templateId ?? '',
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
        templates={context.templates}
        defaultTaxRatePercent={context.defaultTaxRatePercent}
        defaultPaymentTerms={context.defaultPaymentTerms}
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
  readonly currency: CurrencyCode;
  readonly csrfToken: string;
}): ReactNode {
  const seller = invoice.sellerSnapshot;
  const buyer = invoice.buyerSnapshot;

  return (
    <>
      <p className="rounded-control border border-rule bg-surface-sunken px-4 py-3 text-ui text-ink-muted">
        {messages.invoices.frozenHint}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className={SECTION_CLASS}>
          <h2 className="text-section font-medium">{messages.invoices.sellerHeading}</h2>
          {seller === null ? (
            <p className="text-ui">{messages.common.none}</p>
          ) : (
            <address className="text-ui not-italic leading-6">
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

        <section className={SECTION_CLASS}>
          <h2 className="text-section font-medium">{messages.invoices.buyerHeading}</h2>
          {buyer === null ? (
            <p className="text-ui">{messages.common.none}</p>
          ) : (
            <address className="text-ui not-italic leading-6">
              {buyer.name}
              <br />
              {buyer.addressLine1}
              <br />
              {buyer.postalCode} {buyer.city}
              <br />
              {/*
                Der Verweis in die Stammdaten steht nur, wenn es dort etwas
                gibt: Ein Beleg an einen freien Empfänger hat keine
                Kundennummer, und ein Verweis ins Leere ist schlimmer als
                keiner (M5.7).
              */}
              {invoice.customerId === null || buyer.customerNumber === null ? null : (
                <>
                  {messages.customers.number}:{' '}
                  <Link
                    href={customerPath(invoice.customerId)}
                    className="underline underline-offset-4"
                  >
                    {buyer.customerNumber}
                  </Link>
                </>
              )}
              {buyer.vatId === null ? null : <><br />USt-IdNr: {buyer.vatId}</>}
            </address>
          )}
        </section>
      </div>

      <section className={SECTION_CLASS}>
        <dl className="grid gap-2 text-ui sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.issueDate}</dt>
            <dd className="tabular-nums">{formatPlainDateDe(invoice.issueDate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.dueDate}</dt>
            <dd className="tabular-nums">{formatPlainDateDe(invoice.dueDate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.serviceDateFrom}</dt>
            <dd className="tabular-nums">{formatPlainDateDe(invoice.serviceDateFrom)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.taxScheme}</dt>
            <dd>
              {isTaxScheme(invoice.taxScheme) ? messages.taxScheme[invoice.taxScheme] : invoice.taxScheme}
            </dd>
          </div>
        </dl>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-medium">{messages.invoices.linesHeading}</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-ui">
            <thead>
              <tr className="border-b border-rule text-left">
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
                <tr key={line.id} className="border-b border-rule">
                  <td className="py-2 pr-3 tabular-nums">{line.position}</td>
                  <td className="py-2 pr-3">
                    {line.name}
                    {line.description === null ? null : (
                      <span className="block text-ink-muted">
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

        <dl className="flex flex-col gap-2 border-t border-rule pt-3 text-ui">
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
