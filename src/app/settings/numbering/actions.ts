'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import {
  setInvoiceNumberFormat,
  setPdfFileNamePattern,
} from '@/application/company/company-profile';
import { setSequenceStartValue } from '@/application/invoices/invoice-numbering';
import { parseNumberFormat } from '@/domain/invoice/number-format';
import { isValidFileNamePattern } from '@/domain/document/file-name';
import { messages } from '@/i18n/de';
import { NUMBERING_SETTINGS_PATH } from '@/routes';

export type NumberingFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'saved' }
  | { readonly status: 'error'; readonly message: string };

const formatSchema = z.string().trim().min(1).max(64);
const scopeSchema = z.string().trim().min(1).max(64);
const startValueSchema = z.coerce.number().int().min(0).max(1_000_000_000);

export async function saveNumberFormatAction(
  _previous: NumberingFormState,
  formData: FormData,
): Promise<NumberingFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();
  const parsedInput = formatSchema.safeParse(formData.get('format'));
  if (!parsedInput.success) {
    return { status: 'error', message: messages.numbering.formatInvalid };
  }

  const parsed = parseNumberFormat(parsedInput.data);
  if (!parsed.ok) {
    switch (parsed.error.kind) {
      case 'MISSING_SEQUENCE':
        return { status: 'error', message: messages.numbering.formatMissingSequence };
      case 'MULTIPLE_SEQUENCES':
        return { status: 'error', message: messages.numbering.formatMultipleSequences };
      case 'UNKNOWN_PLACEHOLDER':
        return {
          status: 'error',
          message: messages.numbering.formatUnknownPlaceholder.replace(
            '{placeholder}',
            parsed.error.placeholder,
          ),
        };
      case 'INVALID_SEQUENCE_WIDTH':
        return {
          status: 'error',
          message: messages.numbering.formatInvalidWidth
            .replace('{min}', String(parsed.error.min))
            .replace('{max}', String(parsed.error.max)),
        };
      default:
        return { status: 'error', message: messages.numbering.formatInvalid };
    }
  }

  const context = await readRequestContext();
  await setInvoiceNumberFormat(
    session.organization,
    parsed.value.format,
    session.userId,
    context.ipAddress,
  );

  revalidatePath(NUMBERING_SETTINGS_PATH);
  return { status: 'saved' };
}

export async function saveFileNamePatternAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const value = formData.get('pdfFileNamePattern');
  const pattern = typeof value === 'string' ? value.trim() : '';

  if (!isValidFileNamePattern(pattern)) {
    return;
  }

  const context = await readRequestContext();
  await setPdfFileNamePattern(session.organization, pattern, session.userId, context.ipAddress);

  revalidatePath(NUMBERING_SETTINGS_PATH);
}

export async function setStartValueAction(
  _previous: NumberingFormState,
  formData: FormData,
): Promise<NumberingFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();

  const scope = scopeSchema.safeParse(formData.get('scope'));
  const startValue = startValueSchema.safeParse(formData.get('startValue'));

  if (!scope.success || !startValue.success) {
    return { status: 'error', message: messages.numbering.startValueInvalid };
  }

  const result = await setSequenceStartValue(session.organization, scope.data, startValue.data);
  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.error.kind === 'ALREADY_IN_USE'
          ? messages.numbering.startValueInUse.replace(
              '{lastValue}',
              String(result.error.lastValue),
            )
          : messages.numbering.startValueInvalid,
    };
  }

  revalidatePath(NUMBERING_SETTINGS_PATH);
  return { status: 'saved' };
}
