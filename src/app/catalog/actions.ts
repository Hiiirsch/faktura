'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import {
  createCatalogItem,
  setCatalogItemArchived,
  updateCatalogItem,
} from '@/application/catalog/catalog-service';
import { isUnitCode } from '@/domain/codes/unit-code';
import { type Cents, parseCents } from '@/domain/money/money';
import { PERCENT_BASIS_POINTS } from '@/domain/invoice/totals';
import { messages } from '@/i18n/de';
import { CATALOG_PATH } from '@/routes';
import { parseGermanDecimal } from '@/ui/format';

export type CatalogFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'saved' }
  | {
      readonly status: 'error';
      readonly errors: Readonly<Record<string, string>>;
      readonly values: Readonly<Record<string, string>>;
    };

const catalogSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).transform((value) => (value.length === 0 ? null : value)),
  unitCode: z.string().trim().min(1).max(8),
  // Die Oberfläche fragt Prozent ab; gespeichert wird in Basispunkten.
  taxRatePercent: z.coerce.number().int().min(0).max(100),
});

function collectValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && key !== 'csrfToken' && !key.startsWith('$')) {
      values[key] = value;
    }
  }
  return values;
}

function parseCatalogForm(formData: FormData):
  | {
      ok: true;
      data: {
        name: string;
        description: string | null;
        unitPriceCents: Cents;
        unitCode: string;
        taxRateBasisPoints: number;
      };
    }
  | { ok: false; state: CatalogFormState } {
  const values = collectValues(formData);
  const parsed = catalogSchema.safeParse(values);
  const errors: Record<string, string> = {};

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors[issue.path.join('.')] =
        issue.path[0] === 'taxRatePercent'
          ? messages.catalog.taxRateInvalid
          : messages.common.validationFailed;
    }
  }

  // Deutsche Eingabe in die kanonische Form, dann in der Domain in Cent.
  const priceCents = parseCents(parseGermanDecimal(values.unitPrice ?? ''));
  if (!priceCents.ok) {
    errors.unitPrice = messages.catalog.unitPriceInvalid;
  }

  if (parsed.success && !isUnitCode(parsed.data.unitCode)) {
    errors.unitCode = messages.common.validationFailed;
  }

  if (!parsed.success || !priceCents.ok || Object.keys(errors).length > 0) {
    return { ok: false, state: { status: 'error', errors, values } };
  }

  const { taxRatePercent, ...rest } = parsed.data;
  return {
    ok: true,
    data: {
      ...rest,
      unitPriceCents: priceCents.value,
      taxRateBasisPoints: taxRatePercent * PERCENT_BASIS_POINTS,
    },
  };
}

export async function createCatalogItemAction(
  _previous: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', errors: { form: messages.common.rejected }, values: {} };
  }

  const session = await requireSessionOrThrow();
  const parsed = parseCatalogForm(formData);
  if (!parsed.ok) {
    return parsed.state;
  }

  const context = await readRequestContext();
  await createCatalogItem(session.organization, parsed.data, session.userId, context.ipAddress);

  revalidatePath(CATALOG_PATH);
  return { status: 'saved' };
}

export async function updateCatalogItemAction(
  _previous: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', errors: { form: messages.common.rejected }, values: {} };
  }

  const session = await requireSessionOrThrow();

  const id = z.string().trim().min(1).max(64).safeParse(formData.get('id'));
  if (!id.success) {
    return { status: 'error', errors: { form: messages.common.validationFailed }, values: {} };
  }

  const parsed = parseCatalogForm(formData);
  if (!parsed.ok) {
    return parsed.state;
  }

  const context = await readRequestContext();
  await updateCatalogItem(
    session.organization,
    id.data,
    parsed.data,
    session.userId,
    context.ipAddress,
  );

  revalidatePath(CATALOG_PATH);
  return { status: 'saved' };
}

export async function setCatalogItemArchivedAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const id = z.string().trim().min(1).max(64).safeParse(formData.get('id'));
  if (!id.success) {
    return;
  }

  const context = await readRequestContext();
  await setCatalogItemArchived(
    session.organization,
    id.data,
    formData.get('isArchived') === 'true',
    session.userId,
    context.ipAddress,
  );

  revalidatePath(CATALOG_PATH);
}
