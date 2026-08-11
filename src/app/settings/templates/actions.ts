'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import {
  createTemplateFrom,
  deleteTemplate,
  getTemplate,
  makeDefault,
  readTemplateUpload,
  updateTemplateFrom,
} from '@/application/templates/template-service';
import type { TemplateUploadError } from '@/domain/rendering/template-upload';
import { messages } from '@/i18n/de';
import { TEMPLATE_SETTINGS_PATH, templatePath } from '@/routes';

const idSchema = z.string().trim().min(1).max(64);

const templateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length === 0 ? null : value)),
  htmlSource: z.string().max(2_000_000),
  cssSource: z.string().max(2_000_000),
  marginTopMm: z.coerce.number().int().min(0).max(50),
  marginRightMm: z.coerce.number().int().min(0).max(50),
  marginBottomMm: z.coerce.number().int().min(0).max(50),
  marginLeftMm: z.coerce.number().int().min(0).max(50),
});

export type TemplateFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'saved' }
  | { readonly status: 'error'; readonly message: string };

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function describeUploadError(error: TemplateUploadError): string {
  switch (error.kind) {
    case 'EMPTY':
      return messages.templates.uploadEmpty;
    case 'TOO_LARGE':
      return messages.templates.uploadTooLarge;
    case 'UNKNOWN_TYPE':
      return messages.templates.uploadUnknownType;
    case 'MISSING_ENTRIES':
      return messages.templates.uploadMissingEntries;
    case 'UNSAFE_ENTRY':
      return messages.templates.uploadUnsafeEntry;
    case 'NOT_UTF8':
      return messages.templates.uploadNotUtf8;
  }
}

function fields(formData: FormData): Record<string, unknown> {
  return {
    name: readText(formData, 'name'),
    description: readText(formData, 'description'),
    htmlSource: readText(formData, 'htmlSource'),
    cssSource: readText(formData, 'cssSource'),
    marginTopMm: readText(formData, 'marginTopMm'),
    marginRightMm: readText(formData, 'marginRightMm'),
    marginBottomMm: readText(formData, 'marginBottomMm'),
    marginLeftMm: readText(formData, 'marginLeftMm'),
  };
}

export async function createTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();
  const parsed = templateSchema.safeParse(fields(formData));

  if (!parsed.success) {
    return { status: 'error', message: messages.common.validationFailed };
  }

  const context = await readRequestContext();
  const result = await createTemplateFrom(
    session.organization,
    parsed.data,
    session.userId,
    context.ipAddress,
  );

  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.error.kind === 'NAME_TAKEN'
          ? messages.templates.nameTaken
          : messages.templates.marginInvalid,
    };
  }

  revalidatePath(TEMPLATE_SETTINGS_PATH);
  redirect(templatePath(result.value.id));
}

export async function updateTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();
  const id = idSchema.safeParse(formData.get('templateId'));
  const parsed = templateSchema.safeParse(fields(formData));

  if (!id.success || !parsed.success) {
    return { status: 'error', message: messages.common.validationFailed };
  }

  const context = await readRequestContext();
  const result = await updateTemplateFrom(
    session.organization,
    id.data,
    parsed.data,
    session.userId,
    context.ipAddress,
  );

  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.error.kind === 'NAME_TAKEN'
          ? messages.templates.nameTaken
          : result.error.kind === 'NOT_FOUND'
            ? messages.templates.notFound
            : messages.templates.marginInvalid,
    };
  }

  revalidatePath(templatePath(id.data));
  revalidatePath(TEMPLATE_SETTINGS_PATH);
  return { status: 'saved' };
}

export async function makeDefaultAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const id = idSchema.safeParse(formData.get('templateId'));
  if (!id.success) {
    return;
  }

  const context = await readRequestContext();
  await makeDefault(session.organization, id.data, session.userId, context.ipAddress);

  revalidatePath(TEMPLATE_SETTINGS_PATH);
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const id = idSchema.safeParse(formData.get('templateId'));
  if (!id.success) {
    return;
  }

  const context = await readRequestContext();
  const result = await deleteTemplate(
    session.organization,
    id.data,
    session.userId,
    context.ipAddress,
  );

  revalidatePath(TEMPLATE_SETTINGS_PATH);

  if (result.ok) {
    redirect(TEMPLATE_SETTINGS_PATH);
  }
}

/**
 * Übernimmt eine hochgeladene Vorlage (FA-TPL-01).
 *
 * Eine `.css`-Datei allein ersetzt den Stil der bearbeiteten Vorlage, eine
 * `.html`-Datei deren Markup, ein ZIP beides. Wer nur das Stylesheet tauschen
 * will, soll nicht das ganze Archiv neu bauen müssen.
 */
export async function uploadTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();
  const id = idSchema.safeParse(formData.get('templateId'));
  const file = formData.get('file');

  if (!id.success) {
    return { status: 'error', message: messages.templates.notFound };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: messages.templates.uploadEmpty };
  }

  const existing = await getTemplate(session.organization, id.data);
  if (existing === null) {
    return { status: 'error', message: messages.templates.notFound };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const read = readTemplateUpload(bytes, file.name);

  if (!read.ok) {
    return { status: 'error', message: describeUploadError(read.error) };
  }

  const context = await readRequestContext();
  const result = await updateTemplateFrom(
    session.organization,
    id.data,
    {
      name: existing.name,
      description: existing.description,
      htmlSource: read.htmlSource ?? existing.htmlSource,
      cssSource: read.cssSource ?? existing.cssSource,
      marginTopMm: existing.marginTopMm,
      marginRightMm: existing.marginRightMm,
      marginBottomMm: existing.marginBottomMm,
      marginLeftMm: existing.marginLeftMm,
    },
    session.userId,
    context.ipAddress,
  );

  if (!result.ok) {
    return { status: 'error', message: messages.templates.notFound };
  }

  revalidatePath(templatePath(id.data));
  return { status: 'saved' };
}
