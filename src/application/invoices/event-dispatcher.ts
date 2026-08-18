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

/**
 * Der Ausführungskontext eines Ereignisses (M8, B6).
 *
 * Bis B6 war das nur der Mandant. Das genügte für alles außer der Frage, die das
 * Protokoll eigentlich beantworten soll: **wer** hat gehandelt. Die Antwort
 * konnte der Handler nicht geben — sie stand in den Anwendungsfällen und endete
 * dort als `void actorId;`, weil es keinen Weg gab, sie weiterzureichen.
 *
 * Der Akteur gehört **nicht ins Ereignis**: Ein `InvoiceIssued` beschreibt, was
 * geschehen ist, nicht unter welchen Umständen. Er gehört in den Kontext, neben
 * den Mandanten — beides sind Angaben über die Ausführung, nicht über den
 * Vorgang. Der Typparameter von `InvoiceEventHandler` steht dafür offen; die
 * Domain kennt weder Organisationen noch Konten.
 */
export type InvoiceEventContext = {
  readonly organization: OrganizationContext;
  readonly actorId: string;
  readonly ipAddress: string | null;
};

export type InvoiceEventListener = InvoiceEventHandler<InvoiceEventContext>;

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
  context: InvoiceEventContext,
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
  /** Akteur und Herkunft stehen an jedem Eintrag gleich (NFA-COMP-01). */
  const who = {
    actorId: context.actorId.length === 0 ? null : context.actorId,
    ipAddress: context.ipAddress,
  };

  switch (event.type) {
    case 'InvoiceIssued':
      await recordAuditEntry(context.organization, {
        entityType: 'Invoice',
        entityId: event.invoiceId,
        action: 'ISSUED',
        ...who,
        details: { invoiceNumber: event.invoiceNumber, issueDate: event.issueDate },
      });
      break;
    case 'InvoicePaymentRecorded':
      await recordAuditEntry(context.organization, {
        entityType: 'Invoice',
        entityId: event.invoiceId,
        action: 'PAYMENT_RECORDED',
        ...who,
        details: { amountCents: event.amountCents, paidTotalCents: event.paidTotalCents },
      });
      break;
    case 'InvoicePaid':
      await recordAuditEntry(context.organization, {
        entityType: 'Invoice',
        entityId: event.invoiceId,
        action: 'PAID',
        ...who,
        details: { grossTotalCents: event.grossTotalCents },
      });
      break;
    case 'InvoiceCancelled':
      await recordAuditEntry(context.organization, {
        entityType: 'Invoice',
        entityId: event.invoiceId,
        action: 'CANCELLED',
        ...who,
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
