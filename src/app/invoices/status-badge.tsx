import type { ReactNode } from 'react';

import type { InvoiceStatus } from '@/domain/invoice/status';
import { messages } from '@/i18n/de';

const TONE: Readonly<Record<InvoiceStatus, string>> = {
  DRAFT: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  ISSUED: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  PAID: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
  CANCELLED: 'bg-neutral-200 text-neutral-700 line-through dark:bg-neutral-700 dark:text-neutral-300',
};

const LABEL: Readonly<Record<InvoiceStatus, string>> = {
  DRAFT: messages.invoices.statusDRAFT,
  ISSUED: messages.invoices.statusISSUED,
  PARTIALLY_PAID: messages.invoices.statusPARTIALLY_PAID,
  PAID: messages.invoices.statusPAID,
  CANCELLED: messages.invoices.statusCANCELLED,
};

/**
 * Statuskennzeichnung. Überfälligkeit ist ein abgeleiteter Zustand und wird
 * neben dem Status angezeigt, nicht an seiner Stelle (FA-STAT-02).
 */
export function InvoiceStatusBadge({
  status,
  isOverdue,
}: {
  readonly status: InvoiceStatus;
  readonly isOverdue: boolean;
}): ReactNode {
  return (
    <span className="flex flex-wrap gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[status]}`}>
        {LABEL[status]}
      </span>
      {isOverdue ? (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950 dark:text-red-200">
          {messages.invoices.overdue}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Formatiert einen Kalendertag `YYYY-MM-DD` als `TT.MM.JJJJ` (NFA-QUAL-08).
 *
 * Reine Umstellung der Bestandteile, ohne `Date` und ohne Zeitzone — der Wert
 * ist bereits ein Kalendertag und darf beim Anzeigen nicht verschoben werden.
 */
export function formatGermanDate(value: string | null): string {
  if (value === null || value.length !== 10) {
    return messages.common.none;
  }
  return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`;
}
