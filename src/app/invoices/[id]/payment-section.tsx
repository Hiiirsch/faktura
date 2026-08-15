import type { ReactNode } from 'react';

import type { CurrencyCode } from '@/domain/codes/currency-code';

import { cents } from '@/domain/money/money';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { DateField } from '@/ui/components/date-field';
import { ConfirmDialog } from '@/ui/components/dialog';
import {
  SECTION_CLASS,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/ui/components/form';
import { formatAmount, formatMoney } from '@/ui/format';

import { addPaymentAction, markPaidAction, removePaymentAction } from '../actions';
import { formatPlainDateDe } from '@/domain/format/de';

export type PaymentRow = {
  readonly id: string;
  readonly amountCents: number;
  readonly paidAt: string;
  readonly method: string | null;
  readonly note: string | null;
};

/**
 * Zahlungen erfassen, einsehen und zurücknehmen (FA-STAT-03, -06, -07).
 *
 * Die Schnellaktion erfasst den **Restbetrag**, nicht den Gesamtbetrag — bei
 * einer teilbezahlten Rechnung entstünde sonst eine Überzahlung.
 */
export function PaymentSection({
  invoiceId,
  csrfToken,
  currency,
  outstandingCents,
  today,
  payments,
}: {
  readonly invoiceId: string;
  readonly csrfToken: string;
  readonly currency: CurrencyCode;
  readonly outstandingCents: number;
  readonly today: string;
  readonly payments: readonly PaymentRow[];
}): ReactNode {
  return (
    <section className={SECTION_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-section font-medium">{messages.invoices.paymentsHeading}</h2>
        <span className="text-ui tabular-nums">
          {messages.invoices.outstanding}: {formatMoney(cents(outstandingCents), currency)}
        </span>
      </div>

      {payments.length === 0 ? (
        <p className="text-ui text-ink-muted">
          {messages.invoices.paymentsEmpty}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-ui">
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className="py-2 pr-4 font-medium">{messages.invoices.paymentDate}</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">{messages.invoices.paymentAmount}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{messages.invoices.paymentMethod}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{messages.invoices.paymentNote}</th>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">{messages.invoices.paymentRemove}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-rule">
                  <td className="py-2 pr-4 tabular-nums">{formatPlainDateDe(payment.paidAt)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatMoney(cents(payment.amountCents), currency)}
                  </td>
                  <td className="py-2 pr-4">{payment.method ?? messages.common.none}</td>
                  <td className="py-2 pr-4">{payment.note ?? messages.common.none}</td>
                  <td className="py-2 text-right">
                    <form action={removePaymentAction}>
                      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                      <input type="hidden" name="invoiceId" value={invoiceId} />
                      <input type="hidden" name="paymentId" value={payment.id} />
                      <ConfirmDialog
                        title={messages.invoices.paymentRemoveTitle}
                        message={messages.invoices.paymentRemoveConfirm}
                        confirmLabel={messages.invoices.paymentRemove}
                        tone="danger"
                        trigger={
                          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                            {messages.invoices.paymentRemove}
                          </button>
                        }
                      />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {outstandingCents <= 0 ? (
        <p className="text-ui text-ink-muted">
          {messages.invoices.nothingOutstanding}
        </p>
      ) : (
        <div className="flex flex-col gap-4 border-t border-rule pt-4">
          <form action={addPaymentAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <input type="hidden" name="invoiceId" value={invoiceId} />

            <label className="flex flex-col gap-1.5">
              <span className="text-ui font-medium">{messages.invoices.paymentAmount}</span>
              <input
                name="amount"
                inputMode="decimal"
                required
                defaultValue={formatAmount(cents(outstandingCents))}
                className={`${INPUT_CLASS} w-32 text-right tabular-nums`}
              />
            </label>
            <DateField
              name="paidAt"
              label={messages.invoices.paymentDate}
              defaultValue={today}
              required
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-ui font-medium">{messages.invoices.paymentMethod}</span>
              <input name="method" className={INPUT_CLASS} />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1.5">
              <span className="text-ui font-medium">{messages.invoices.paymentNote}</span>
              <input name="note" className={INPUT_CLASS} />
            </label>

            <button type="submit" className={PRIMARY_BUTTON_CLASS}>
              {messages.invoices.paymentAdd}
            </button>
          </form>

          <form action={markPaidAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="paidAt" value={today} />
            <ConfirmDialog
              title={messages.invoices.markPaidTitle}
              message={messages.invoices.markPaidHint}
              confirmLabel={messages.invoices.markPaid}
              trigger={
                <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                  {messages.invoices.markPaid}
                </button>
              }
            />
            <span className="text-ui text-ink-muted">
              {messages.invoices.markPaidHint}
            </span>
          </form>
        </div>
      )}
    </section>
  );
}
