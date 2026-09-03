/**
 * Der Weg von der Mahnung zur Datei (M15, FA-MAHN-06).
 *
 * **Dieselbe Kette wie beim Beleg**, und das ist der Punkt: dieselbe Schrift,
 * dasselbe Briefpapier, derselbe Seitenstempel, dieselbe Ablage mit SHA-256.
 * Eine Mahnung ist ein Brief desselben Absenders und soll aussehen wie einer.
 *
 * Was sie **nicht** teilt, ist die Vorlage: Sie kommt aus dem Modul und nicht
 * aus `Template` (siehe `infrastructure/templates/reminder-template.ts`).
 */
import type { Authorized } from '@/application/auth/authorize';
import { buildInvoiceDocument } from '@/application/documents/build-invoice-document';
import { formatPlainDateDe } from '@/domain/format/de';
import { cents } from '@/domain/money/money';
import { DEFAULT_PAGE_GEOMETRY } from '@/domain/rendering/contracts';
import { isReminderLevel } from '@/domain/reminder/dunning';
import type { ReminderDocument } from '@/domain/reminder/reminder-document';
import {
  fillOutro,
  overdueSentence,
  wordingForLevel,
} from '@/domain/reminder/reminder-texts';
import { err, ok, type Result } from '@/domain/shared/result';
import { daysBetween, parsePlainDate } from '@/domain/time/plain-date';
import { logger } from '@/infrastructure/logging/logger';
import { documentFontFaces } from '@/infrastructure/rendering/document-font';
import { liquidReminderEngine } from '@/infrastructure/rendering/liquid-engine';
import { applyPostProcessors, defaultPipeline } from '@/infrastructure/rendering/pipeline';
import {
  createReminderArtifact,
  findReminder,
  findReminderArtifact,
} from '@/infrastructure/repositories/reminder-repository';
import { readArtifact, storeArtifact } from '@/infrastructure/storage/artifact-store';
import {
  REMINDER_TEMPLATE_CSS,
  REMINDER_TEMPLATE_HTML,
} from '@/infrastructure/templates/reminder-template';

import {
  letterheadBytes,
  postProcessorsFor,
  renderOptions,
} from '../documents/render-invoice';

export type ReminderRenderError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NO_COMPANY_PROFILE' }
  | { readonly kind: 'RENDER_FAILED'; readonly message: string };

export type RenderedReminder = {
  readonly pdf: Uint8Array;
  readonly fileName: string;
  readonly sha256: string;
  /** Wie bei Belegen: abgelegt, oder ersatzweise neu gesetzt (M12). */
  readonly origin: 'stored' | 'substitute';
};

/** Der Dateiname ist die Mahnungsnummer — kurz und wiedererkennbar. */
function fileNameFor(number: string): string {
  return `${number.replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`;
}

async function buildDocument(
  context: Authorized<'invoice.read'>,
  reminderId: string,
): Promise<Result<{ document: ReminderDocument; letterheadAssetId: string | null }, ReminderRenderError>> {
  const reminder = await findReminder(context, reminderId);
  if (reminder === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  /*
   * Absender und Empfänger kommen aus dem **Belegdokument**, nicht aus einer
   * zweiten Abbildung der Firmendaten.
   *
   * Damit gilt für die Mahnung, was für den Beleg gilt: Snapshot statt
   * Gegenwart, freier Anschriftenblock, Logo, Briefpapier. Eine eigene
   * Umsetzung wäre die zweite Wahrheit, die beim ersten Sonderfall abweicht —
   * und der erste Sonderfall wäre der Kunde ohne Datensatz.
   */
  const built = await buildInvoiceDocument(context, reminder.invoiceId);
  if (!built.ok) {
    return err(
      built.error.kind === 'NOT_FOUND'
        ? { kind: 'NOT_FOUND' }
        : { kind: 'NO_COMPANY_PROFILE' },
    );
  }

  if (!isReminderLevel(reminder.level)) {
    return err({ kind: 'RENDER_FAILED', message: 'Unbekannte Mahnstufe' });
  }

  const issueDate = parsePlainDate(reminder.issueDate);
  const dueDate = parsePlainDate(reminder.dueDate);
  const invoiceIssueDate = built.document.issueDate;
  const invoiceDueDate = built.document.dueDate;

  if (!issueDate.ok || !dueDate.ok || invoiceIssueDate === null || invoiceDueDate === null) {
    return err({ kind: 'RENDER_FAILED', message: 'Unvollständige Datumsangaben' });
  }

  const wording = wordingForLevel(reminder.level);
  const overdueDays = daysBetween(invoiceDueDate, issueDate.value);

  return ok({
    letterheadAssetId: built.letterheadAssetId,
    document: {
      number: reminder.number,
      level: reminder.level,
      levelLabel: wording.label,
      issueDate: issueDate.value,
      dueDate: dueDate.value,
      currency: built.document.currency,
      seller: built.document.seller,
      buyer: built.document.buyer,
      invoice: {
        number: built.document.invoiceNumber ?? '',
        issueDate: invoiceIssueDate,
        dueDate: invoiceDueDate,
        grossTotalCents: built.document.totals.grossCents,
      },
      outstandingCents: cents(reminder.outstandingCents),
      feeCents: cents(reminder.feeCents),
      totalCents: cents(reminder.totalCents),
      introText: wording.intro,
      outroText: fillOutro(wording, formatPlainDateDe(dueDate.value)),
      overdueText: overdueSentence(Math.max(1, overdueDays)),
      footerText: built.document.footerText,
    },
  });
}

/** Setzt die Mahnung, ohne sie abzulegen. */
export async function renderReminderPdf(
  context: Authorized<'invoice.read'>,
  reminderId: string,
): Promise<Result<Uint8Array, ReminderRenderError>> {
  const prepared = await buildDocument(context, reminderId);
  if (!prepared.ok) {
    return prepared;
  }

  const fontFaces = await documentFontFaces();
  const rendered = await liquidReminderEngine.render(prepared.value.document, {
    htmlSource: REMINDER_TEMPLATE_HTML,
    cssSource: `${fontFaces}\n${REMINDER_TEMPLATE_CSS}`,
    geometry: DEFAULT_PAGE_GEOMETRY,
  });

  if (!rendered.ok) {
    return err({ kind: 'RENDER_FAILED', message: rendered.error.message });
  }

  const result = await defaultPipeline.pdfRenderer.render(
    rendered.html,
    renderOptions(DEFAULT_PAGE_GEOMETRY),
  );

  if (!result.ok) {
    return err({
      kind: 'RENDER_FAILED',
      message: result.error.kind === 'TIMEOUT' ? 'Zeitüberschreitung' : result.error.message,
    });
  }

  const letterhead = await letterheadBytes(context, prepared.value.letterheadAssetId);
  return ok(await applyPostProcessors(result.pdf, postProcessorsFor(letterhead)));
}

/**
 * Erzeugt das PDF und legt es ab — genau einmal je Mahnung.
 *
 * Liegt es schon vor, wird es gelesen. Fehlt die Datei zu einem vorhandenen
 * Artefakt, wird ersatzweise neu gesetzt und das ausdrücklich gekennzeichnet
 * (`substitute`) — dieselbe Regel wie beim Beleg seit M12: Was dabei
 * herauskommt, sieht aus wie das Original und ist es nicht.
 */
export async function storeReminderPdf(
  context: Authorized<'invoice.read'>,
  reminderId: string,
): Promise<Result<RenderedReminder, ReminderRenderError>> {
  const reminder = await findReminder(context, reminderId);
  if (reminder === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const existing = await findReminderArtifact(context, reminderId);
  if (existing !== null) {
    try {
      const bytes = await readArtifact(existing.filePath);
      return ok({
        pdf: new Uint8Array(bytes),
        fileName: existing.fileName,
        sha256: existing.sha256,
        origin: 'stored',
      });
    } catch (error) {
      logger.error('reminder.artifact_read_failed', { reminderId, error });
      const ersatz = await renderReminderPdf(context, reminderId);
      return ersatz.ok
        ? ok({
            pdf: ersatz.value,
            fileName: fileNameFor(reminder.number),
            sha256: '',
            origin: 'substitute' as const,
          })
        : ersatz;
    }
  }

  const rendered = await renderReminderPdf(context, reminderId);
  if (!rendered.ok) {
    return rendered;
  }

  const fileName = fileNameFor(reminder.number);
  const stored = await storeArtifact(reminderId, 'pdf', rendered.value);

  await createReminderArtifact(context, {
    reminderId,
    kind: 'pdf',
    filePath: stored.storagePath,
    sha256: stored.sha256,
    byteSize: stored.byteSize,
    fileName,
  });

  return ok({ pdf: rendered.value, fileName, sha256: stored.sha256, origin: 'stored' });
}
