/**
 * Eine Mahnung ausstellen (M15, FA-MAHN-01 bis -07).
 *
 * **Die Beträge werden eingefroren.** Was auf der Mahnung steht, galt am Tag
 * ihrer Ausstellung. Zahlt der Kunde danach eine Teilsumme, ändert das den
 * verschickten Brief nicht — die Zeile ist unveränderlich, der Trigger weist
 * jedes `UPDATE` ab. Dieselbe Zusage wie beim festgeschriebenen Beleg, aus
 * demselben Grund: Ein Dokument, das sich nachträglich ändert, ist kein
 * Dokument.
 *
 * **Das PDF entsteht sofort, aber sein Fehlschlag wirft die Mahnung nicht um.**
 * Genau wie beim Festschreiben seit M12 (FA-PDF-13): Die Nummer ist vergeben,
 * die Mahnung gilt, das PDF entsteht dann beim Abruf. Eine Mahnung, die an
 * einem Renderer scheitert, wäre der schlechtere Fehler.
 *
 * **Mahnen ist ein eigenes Recht** (`invoice.remind`) und nicht Teil von
 * `invoice.issue`: Wer Rechnungen schreibt, muss nicht mahnen dürfen, und wer
 * mahnt, schreibt keine Rechnungen.
 */
import type { Authorized } from '@/application/auth/authorize';
import {
  formatInvoiceNumber,
  REMINDER_SEQUENCE_PREFIX,
  sequenceScopeFor,
} from '@/domain/invoice/number-format';
import { isInvoiceStatus, outstandingAmount } from '@/domain/invoice/status';
import { cents } from '@/domain/money/money';
import {
  feeForLevel,
  isReminderLevel,
  nextReminderLevel,
  refusalForReminder,
  reminderAmounts,
  reminderDueDate,
  type ReminderLevel,
  type ReminderRefusal,
} from '@/domain/reminder/dunning';
import { err, ok, type Result } from '@/domain/shared/result';
import { parsePlainDate, todayIn } from '@/domain/time/plain-date';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { getEnv } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import { runInTransaction } from '@/infrastructure/repositories/client';
import { findCompanyProfile } from '@/infrastructure/repositories/company-repository';
import { findInvoiceWithLinesAndPayments } from '@/infrastructure/repositories/invoice-repository';
import { incrementSequence } from '@/infrastructure/repositories/number-sequence-repository';
import {
  createReminder,
  highestReminderLevel,
  type Reminder,
} from '@/infrastructure/repositories/reminder-repository';

import { storeReminderPdf } from './render-reminder';

export type CreateReminderError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NO_COMPANY_PROFILE' }
  /** Der Beleg darf nicht gemahnt werden; der Grund steht daneben. */
  | { readonly kind: 'REFUSED'; readonly refusal: ReminderRefusal };

export type CreatedReminder = {
  readonly reminder: Reminder;
  /**
   * Ob das PDF entstanden ist.
   *
   * `false` heißt nicht „fehlgeschlagen" im Sinne der Handlung: Die Mahnung
   * gilt, das PDF entsteht beim ersten Abruf. Die Oberfläche kann es trotzdem
   * sagen wollen.
   */
  readonly pdfCreated: boolean;
};

export async function createInvoiceReminder(
  context: Authorized<'invoice.remind' | 'invoice.read'>,
  invoiceId: string,
  actorId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<CreatedReminder, CreateReminderError>> {
  const invoice = await findInvoiceWithLinesAndPayments(context, invoiceId);
  if (invoice === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const company = await findCompanyProfile(context);
  if (company === null) {
    return err({ kind: 'NO_COMPANY_PROFILE' });
  }

  const today = todayIn(getEnv().APP_TIMEZONE, now);
  const dueDate = invoice.dueDate === null ? null : parsePlainDate(invoice.dueDate);
  const outstanding = outstandingAmount(
    cents(invoice.grossTotalCents),
    cents(invoice.paidTotalCents),
  );

  const previousRaw = await highestReminderLevel(context, invoiceId);
  const previousLevel =
    previousRaw !== null && isReminderLevel(previousRaw) ? previousRaw : null;

  /*
   * `status` und `documentType` sind in SQLite Zeichenketten (NFA-ARCH-09); die
   * Aufzählung liegt in der Domäne. Geprüft statt behauptet: Ein unbekannter
   * Wert wird zu `DRAFT` und damit abgewiesen — die sichere Richtung. Ein
   * `as`-Cast an dieser Stelle wäre eine Behauptung über den Inhalt der
   * Datenbank.
   */
  const refusal = refusalForReminder(
    {
      documentType: invoice.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE',
      status: isInvoiceStatus(invoice.status) ? invoice.status : 'DRAFT',
      dueDate: dueDate !== null && dueDate.ok ? dueDate.value : null,
      outstandingCents: outstanding,
    },
    previousLevel,
    today,
  );

  if (refusal !== null) {
    return err({ kind: 'REFUSED', refusal });
  }

  const level = nextReminderLevel(previousLevel);
  if (level === null) {
    // Unerreichbar: `refusalForReminder` hat die letzte Stufe bereits
    // abgewiesen. Die Prüfung steht trotzdem, weil sonst der Typ eine
    // Möglichkeit offenließe, die niemand behandelt.
    return err({ kind: 'REFUSED', refusal: { kind: 'LAST_LEVEL_REACHED' } });
  }

  const amounts = reminderAmounts(
    outstanding,
    feeForLevel(
      {
        level1Cents: cents(company.reminderFee1Cents),
        level2Cents: cents(company.reminderFee2Cents),
        level3Cents: cents(company.reminderFee3Cents),
      },
      level,
    ),
  );

  const reminder = await runInTransaction(async (handle) => {
    /*
     * Nummer und Zeile entstehen in **einer** Transaktion — dieselbe Regel wie
     * beim Festschreiben (FA-NUM-03). Das `increment` läuft atomar in der
     * Datenbank; zwei nebenläufige Mahnläufe können dieselbe Nummer nicht
     * bekommen.
     */
    const scope = sequenceScopeFor(
      company.reminderNumberFormat,
      today,
      REMINDER_SEQUENCE_PREFIX,
    );
    const sequenceValue = await incrementSequence(context, scope, handle);
    const number = formatInvoiceNumber(company.reminderNumberFormat, today, sequenceValue);

    return createReminder(
      context,
      {
        invoiceId,
        number,
        level,
        issueDate: today,
        dueDate: reminderDueDate(today, company.reminderPaymentTerms),
        outstandingCents: amounts.outstandingCents,
        feeCents: amounts.feeCents,
        totalCents: amounts.totalCents,
        createdById: actorId,
      },
      handle,
    );
  });

  await recordAuditEntry(context, {
    entityType: 'Reminder',
    entityId: reminder.id,
    action: 'REMINDED',
    actorId,
    ipAddress,
    details: {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      number: reminder.number,
      level,
      totalCents: amounts.totalCents,
    },
  });

  logger.info('reminder.created', { reminderId: reminder.id, invoiceId, level });

  /*
   * Das PDF danach und außerhalb der Transaktion: Es startet einen Browser, und
   * ein Browserstart gehört nicht in eine offene Schreibtransaktion auf der
   * einzigen SQLite-Verbindung.
   */
  const pdfCreated = await storeReminderPdf(context, reminder.id)
    .then((result) => result.ok)
    .catch((error: unknown) => {
      logger.error('reminder.artifact_not_created', { reminderId: reminder.id, error });
      return false;
    });

  return ok({ reminder, pdfCreated });
}

export type { ReminderLevel };
