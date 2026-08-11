'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import {
  createCustomer,
  type CustomerData,
  setCustomerArchived,
  updateCustomer,
} from '@/application/customers/customer-service';
import { isCountryCode } from '@/domain/codes/country-code';
import {
  MAX_PAYMENT_TERMS_DAYS,
  MIN_PAYMENT_TERMS_DAYS,
} from '@/domain/customer/payment-terms';
import { validateVatId } from '@/domain/tax/vat-id';
import { messages } from '@/i18n/de';
import { customerPath, CUSTOMERS_PATH } from '@/routes';

export type CustomerFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'saved' }
  | {
      readonly status: 'error';
      readonly errors: Readonly<Record<string, string>>;
      readonly values: Readonly<Record<string, string>>;
    };

const optionalText = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value.length === 0 ? null : value));

const customerSchema = z.object({
  companyName: optionalText,
  contactName: optionalText,
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: optionalText,
  postalCode: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(100),
  countryCode: z.string().trim().length(2),
  email: optionalText,
  phone: optionalText,
  vatId: optionalText,
  buyerReference: optionalText,
  paymentTerms: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : Number(value)))
    .refine(
      (value) =>
        value === null ||
        (Number.isSafeInteger(value) &&
          value >= MIN_PAYMENT_TERMS_DAYS &&
          value <= MAX_PAYMENT_TERMS_DAYS),
      { message: 'PAYMENT_TERMS' },
    ),
  notes: z.string().trim().max(2000).transform((value) => (value.length === 0 ? null : value)),
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

function validateBusinessRules(data: CustomerData): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!isCountryCode(data.countryCode)) {
    errors.countryCode = messages.common.validationFailed;
  }

  // Ein Kunde ohne jeden Namen wäre in der Liste nicht auffindbar und auf der
  // Rechnung keine gültige Empfängerangabe.
  if (data.companyName === null && data.contactName === null) {
    errors.companyName = messages.customers.nameRequired;
    errors.contactName = messages.customers.nameRequired;
  }

  if (data.vatId !== null) {
    const result = validateVatId(data.vatId, data.countryCode);
    if (!result.ok) {
      switch (result.error.kind) {
        case 'COUNTRY_MISMATCH':
          errors.vatId = messages.customers.vatIdCountryMismatch
            .replace('{actual}', result.error.actual)
            .replace('{expected}', result.error.expected);
          break;
        case 'UNSUPPORTED_COUNTRY':
          // Für Länder ohne hinterlegtes Muster wird die Nummer übernommen —
          // eine Ablehnung wäre hier falsch, das Format ist schlicht unbekannt.
          break;
        default:
          errors.vatId = messages.customers.vatIdInvalid;
      }
    }
  }

  return errors;
}

function parseCustomerForm(
  formData: FormData,
): { ok: true; data: CustomerData } | { ok: false; state: CustomerFormState } {
  const values = collectValues(formData);
  const parsed = customerSchema.safeParse(values);

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      errors[field] =
        issue.message === 'PAYMENT_TERMS'
          ? messages.customers.paymentTermsInvalid
          : messages.common.validationFailed;
    }
    return { ok: false, state: { status: 'error', errors, values } };
  }

  const data: CustomerData = {
    ...parsed.data,
    countryCode: parsed.data.countryCode.toUpperCase(),
    vatId: parsed.data.vatId === null ? null : parsed.data.vatId.replace(/[\s.]/g, '').toUpperCase(),
  };

  const businessErrors = validateBusinessRules(data);
  if (Object.keys(businessErrors).length > 0) {
    return { ok: false, state: { status: 'error', errors: businessErrors, values } };
  }

  return { ok: true, data };
}

export async function createCustomerAction(
  _previous: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', errors: { form: messages.common.rejected }, values: {} };
  }

  const session = await requireSessionOrThrow();
  const parsed = parseCustomerForm(formData);
  if (!parsed.ok) {
    return parsed.state;
  }

  const context = await readRequestContext();
  const customer = await createCustomer(
    session.organization,
    parsed.data,
    session.userId,
    context.ipAddress,
  );

  revalidatePath(CUSTOMERS_PATH);
  redirect(customerPath(customer.id));
}

export async function updateCustomerAction(
  _previous: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
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

  const parsed = parseCustomerForm(formData);
  if (!parsed.ok) {
    return parsed.state;
  }

  const context = await readRequestContext();
  await updateCustomer(
    session.organization,
    id.data,
    parsed.data,
    session.userId,
    context.ipAddress,
  );

  revalidatePath(CUSTOMERS_PATH);
  revalidatePath(customerPath(id.data));
  return { status: 'saved' };
}

export async function setCustomerArchivedAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const id = z.string().trim().min(1).max(64).safeParse(formData.get('id'));
  if (!id.success) {
    return;
  }

  const context = await readRequestContext();
  await setCustomerArchived(
    session.organization,
    id.data,
    formData.get('isArchived') === 'true',
    session.userId,
    context.ipAddress,
  );

  revalidatePath(CUSTOMERS_PATH);
  revalidatePath(customerPath(id.data));
}
