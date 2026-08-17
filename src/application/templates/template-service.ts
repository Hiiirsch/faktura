/**
 * Vorlagenverwaltung (FA-TPL-01 bis -03, -05, -08).
 *
 * Jede Änderung wird protokolliert, der Quelltext selbst aber nicht: Eine
 * Vorlage ist mehrere Kilobyte HTML, und das Protokoll soll nachvollziehbar
 * bleiben, nicht vollständig (NFA-BETR-10).
 */
import {
  decodeUtf8,
  type TemplateUploadError,
  validateTemplateUpload,
} from '@/domain/rendering/template-upload';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import type { Authorized } from '@/application/auth/authorize';
import {
  countTemplates,
  createTemplate,
  deleteTemplate as removeTemplate,
  findTemplate,
  findTemplateByName,
  listTemplates as queryTemplates,
  setDefaultTemplate,
  type Template,
  updateTemplate as writeTemplate,
} from '@/infrastructure/repositories/template-repository';
import {
  STARTER_TEMPLATE_CSS,
  STARTER_TEMPLATE_HTML,
} from '@/infrastructure/templates/default-template';
import { extractTemplateArchive } from '@/infrastructure/templates/template-archive';

export type { Template };

/** Startinhalt für eine neu angelegte Vorlage (Spec §8.3). */
export const STARTER_TEMPLATE = {
  htmlSource: STARTER_TEMPLATE_HTML,
  cssSource: STARTER_TEMPLATE_CSS,
} as const;

/** Ränder außerhalb dieser Spanne ergäben keinen brauchbaren Satzspiegel. */
const MIN_MARGIN_MM = 0;
const MAX_MARGIN_MM = 50;

export type TemplateGeometryInput = {
  readonly marginTopMm: number;
  readonly marginRightMm: number;
  readonly marginBottomMm: number;
  readonly marginLeftMm: number;
};

export type TemplateInput = TemplateGeometryInput & {
  readonly name: string;
  readonly description: string | null;
  readonly htmlSource: string;
  readonly cssSource: string;
};

export type TemplateError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NAME_TAKEN' }
  | { readonly kind: 'INVALID_MARGINS' }
  | { readonly kind: 'IS_DEFAULT' };

export async function listTemplates(
  context: Authorized<'template.read'>,
): Promise<readonly Template[]> {
  return queryTemplates(context);
}

export async function getTemplate(
  context: Authorized<'template.read'>,
  id: string,
): Promise<Template | null> {
  return findTemplate(context, id);
}

function marginsValid(input: TemplateGeometryInput): boolean {
  return [
    input.marginTopMm,
    input.marginRightMm,
    input.marginBottomMm,
    input.marginLeftMm,
  ].every(
    (value) => Number.isSafeInteger(value) && value >= MIN_MARGIN_MM && value <= MAX_MARGIN_MM,
  );
}

export async function createTemplateFrom(
  context: Authorized<'template.create'>,
  input: TemplateInput,
  actorId: string,
  ipAddress: string | null,
): Promise<Result<Template, TemplateError>> {
  if (!marginsValid(input)) {
    return err({ kind: 'INVALID_MARGINS' });
  }
  if ((await findTemplateByName(context, input.name)) !== null) {
    return err({ kind: 'NAME_TAKEN' });
  }

  // Die erste Vorlage einer Organisation wird ohne Zutun zur Standardvorlage —
  // sonst hätte die Organisation Vorlagen, aber keine, die verwendet wird.
  const isFirst = (await countTemplates(context)) === 0;

  const template = await createTemplate(context, {
    name: input.name,
    description: input.description,
    htmlSource: input.htmlSource,
    cssSource: input.cssSource,
    pageFormat: 'A4',
    marginTopMm: input.marginTopMm,
    marginRightMm: input.marginRightMm,
    marginBottomMm: input.marginBottomMm,
    marginLeftMm: input.marginLeftMm,
    isDefault: isFirst,
  });

  await recordAuditEntry(context, {
    entityType: 'Template',
    entityId: template.id,
    action: 'CREATED',
    actorId,
    ipAddress,
    details: { name: template.name },
  });

  return ok(template);
}

export async function updateTemplateFrom(
  context: Authorized<'template.update'>,
  id: string,
  input: TemplateInput,
  actorId: string,
  ipAddress: string | null,
): Promise<Result<Template, TemplateError>> {
  if (!marginsValid(input)) {
    return err({ kind: 'INVALID_MARGINS' });
  }

  const existing = await findTemplate(context, id);
  if (existing === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const byName = await findTemplateByName(context, input.name);
  if (byName !== null && byName.id !== id) {
    return err({ kind: 'NAME_TAKEN' });
  }

  await writeTemplate(context, id, {
    name: input.name,
    description: input.description,
    htmlSource: input.htmlSource,
    cssSource: input.cssSource,
    marginTopMm: input.marginTopMm,
    marginRightMm: input.marginRightMm,
    marginBottomMm: input.marginBottomMm,
    marginLeftMm: input.marginLeftMm,
  });

  await recordAuditEntry(context, {
    entityType: 'Template',
    entityId: id,
    action: 'UPDATED',
    actorId,
    ipAddress,
    details: { name: input.name },
  });

  const updated = await findTemplate(context, id);
  return updated === null ? err({ kind: 'NOT_FOUND' }) : ok(updated);
}

export async function makeDefault(
  context: Authorized<'template.update'>,
  id: string,
  actorId: string,
  ipAddress: string | null,
): Promise<Result<true, TemplateError>> {
  const changed = await setDefaultTemplate(context, id);
  if (!changed) {
    return err({ kind: 'NOT_FOUND' });
  }

  await recordAuditEntry(context, {
    entityType: 'Template',
    entityId: id,
    action: 'UPDATED',
    actorId,
    ipAddress,
    details: { changedFields: 'isDefault' },
  });

  return ok(true);
}

/**
 * Löscht eine Vorlage.
 *
 * Die Standardvorlage bleibt: Ohne sie hätte jeder Beleg ohne eigene Vorlage
 * keine mehr. Bereits erzeugte PDFs sind davon ohnehin nicht betroffen — sie
 * liegen als Datei vor (FA-TPL-09).
 */
export async function deleteTemplate(
  context: Authorized<'template.delete'>,
  id: string,
  actorId: string,
  ipAddress: string | null,
): Promise<Result<true, TemplateError>> {
  const existing = await findTemplate(context, id);
  if (existing === null) {
    return err({ kind: 'NOT_FOUND' });
  }
  if (existing.isDefault) {
    return err({ kind: 'IS_DEFAULT' });
  }

  await removeTemplate(context, id);

  await recordAuditEntry(context, {
    entityType: 'Template',
    entityId: id,
    action: 'DELETED',
    actorId,
    ipAddress,
    details: { name: existing.name },
  });

  return ok(true);
}

export type UploadResult =
  | { readonly ok: true; readonly htmlSource: string | null; readonly cssSource: string | null }
  | { readonly ok: false; readonly error: TemplateUploadError };

/**
 * Liest einen Upload aus (FA-TPL-01).
 *
 * Gibt die Quelltexte zurück, statt selbst eine Vorlage anzulegen: Eine
 * einzelne `.css`-Datei ersetzt nur den Stil einer bestehenden Vorlage, und
 * ob angelegt oder ersetzt wird, entscheidet der Aufrufer.
 */
export function readTemplateUpload(bytes: Uint8Array, fileName: string): UploadResult {
  const validated = validateTemplateUpload(bytes, fileName);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  if (validated.kind === 'zip') {
    const extracted = extractTemplateArchive(bytes);
    return extracted.ok
      ? { ok: true, htmlSource: extracted.value.htmlSource, cssSource: extracted.value.cssSource }
      : { ok: false, error: extracted.error };
  }

  const text = decodeUtf8(bytes);
  if (text === null) {
    return { ok: false, error: { kind: 'NOT_UTF8' } };
  }

  return validated.kind === 'html'
    ? { ok: true, htmlSource: text, cssSource: null }
    : { ok: true, htmlSource: null, cssSource: text };
}
