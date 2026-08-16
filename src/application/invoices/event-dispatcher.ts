/**
 * Verteilung der Domain-Ereignisse (NFA-ARCH-08, Spec §3.3).
 *
 * In V1 hängt genau ein Handler daran: das Protokoll. Später kommen
 * E-Mail-Versand, Mahnläufe und Buchhaltungsexport hinzu — durch Registrieren
 * eines weiteren Handlers, ohne Änderung an der Kernlogik.
 *
 * Ein fehlschlagender Handler darf den auslösenden Vorgang nicht kippen: Eine
 * festgeschriebene Rechnung bleibt festgeschrieben, auch wenn eine
 * nachgelagerte Benachrichtigung scheitert. Fehler landen im Serverlog.
 */
import type { InvoiceEvent, InvoiceEventHandler } from '@/domain/invoice/events';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';
import { logger } from '@/infrastructure/logging/logger';

/** In dieser Anwendung ist der Ausführungskontext eines Ereignisses der Mandant. */
export type InvoiceEventListener = InvoiceEventHandler<OrganizationContext>;

const handlers: InvoiceEventListener[] = [];

export function registerInvoiceEventHandler(handler: InvoiceEventListener): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
  };
}

export function registeredHandlerCount(): number {
  return handlers.length;
}

export async function dispatchInvoiceEvent(
  context: OrganizationContext,
  event: InvoiceEvent,
): Promise<void> {
  for (const handler of handlers) {
    try {
      await handler(event, context);
    } catch (error) {
      logger.error('event.handler_failed', { eventType: event.type, error });
    }
  }
}

/** Schreibt jedes Ereignis ins Protokoll (NFA-COMP-01, FA-STAT-11). */
export const auditLogEventHandler: InvoiceEventListener = async (event, context) => {
  switch (event.type) {
    case 'InvoiceIssued':
      await recordAuditEntry(context, {
        entityType: 'Invoice',
        entityId: event.invoiceId,
        action: 'ISSUED',
        details: { invoiceNumber: event.invoiceNumber, issueDate: event.issueDate },
      });
      break;
    case 'InvoicePaymentRecorded':
      await recordAuditEntry(context, {
        entityType: 'Invoice',
        entityId: event.invoiceId,
        action: 'PAYMENT_RECORDED',
        details: { amountCents: event.amountCents, paidTotalCents: event.paidTotalCents },
      });
      break;
    case 'InvoicePaid':
      await recordAuditEntry(context, {
        entityType: 'Invoice',
        entityId: event.invoiceId,
        action: 'PAID',
        details: { grossTotalCents: event.grossTotalCents },
      });
      break;
    case 'InvoiceCancelled':
      await recordAuditEntry(context, {
        entityType: 'Invoice',
        entityId: event.invoiceId,
        action: 'CANCELLED',
        details: { creditNoteNumber: event.creditNoteNumber },
      });
      break;
  }
};

let auditHandlerRegistered = false;

/** Meldet den Protokoll-Handler einmalig an. */
export function ensureDefaultHandlers(): void {
  if (!auditHandlerRegistered) {
    registerInvoiceEventHandler(auditLogEventHandler);
    auditHandlerRegistered = true;
  }
}
