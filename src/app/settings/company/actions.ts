'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { storeImageAsset } from '@/application/assets/asset-service';
import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import {
  type CompanyProfileData,
  getCompanyProfile,
  saveCompanyProfile,
  setCompanyLogo,
} from '@/application/company/company-profile';
import { deleteAsset } from '@/application/assets/asset-service';
import { isCountryCode } from '@/domain/codes/country-code';
import { isCurrencyCode } from '@/domain/codes/currency-code';
import { validateIban } from '@/domain/banking/iban';
import { isValidBic } from '@/domain/banking/iban';
import {
  MAX_PAYMENT_TERMS_DAYS,
  MIN_PAYMENT_TERMS_DAYS,
} from '@/domain/customer/payment-terms';
import { validateVatId } from '@/domain/tax/vat-id';
import { PERCENT_BASIS_POINTS } from '@/domain/invoice/totals';
import { messages } from '@/i18n/de';
import { COMPANY_SETTINGS_PATH } from '@/routes';

export type CompanyFormState =
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

const companySchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: optionalText,
  postalCode: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(100),
  countryCode: z.string().trim().length(2),
  email: optionalText,
  phone: optionalText,
  website: optionalText,
  taxNumber: optionalText,
  vatId: optionalText,
  isSmallBusiness: z.string().optional().transform((value) => value === 'on'),
  registerCourt: optionalText,
  registerNumber: optionalText,
  managingDirector: optionalText,
  bankAccountHolder: optionalText,
  iban: optionalText,
  bic: optionalText,
  bankName: optionalText,
  defaultPaymentTerms: z.coerce.number().int().min(MIN_PAYMENT_TERMS_DAYS).max(MAX_PAYMENT_TERMS_DAYS),
  // Die Oberfläche fragt Prozent ab; gespeichert wird in Basispunkten.
  defaultTaxRatePercent: z.coerce.number().int().min(0).max(100),
  defaultCurrency: z.string().trim().length(3),
  footerText: z.string().trim().max(2000).transform((value) => (value.length === 0 ? null : value)),
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

/** Fachliche Prüfungen, die über die reine Feldform hinausgehen. */
function validateBusinessRules(data: CompanyProfileData): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!isCountryCode(data.countryCode)) {
    errors.countryCode = messages.common.validationFailed;
  }
  if (!isCurrencyCode(data.defaultCurrency)) {
    errors.defaultCurrency = messages.common.validationFailed;
  }

  // FA-STAMM-02: mindestens eine der beiden Kennungen ist Pflicht.
  if (data.taxNumber === null && data.vatId === null) {
    errors.taxNumber = messages.company.taxIdentifierRequired;
    errors.vatId = messages.company.taxIdentifierRequired;
  }

  if (data.vatId !== null) {
    const result = validateVatId(data.vatId);
    if (!result.ok && result.error.kind !== 'UNSUPPORTED_COUNTRY') {
      errors.vatId = messages.customers.vatIdInvalid;
    }
  }

  // FA-STAMM-04: IBAN wird per Prüfsummenverfahren validiert.
  if (data.iban !== null) {
    const result = validateIban(data.iban);
    if (!result.ok) {
      switch (result.error.kind) {
        case 'CHECKSUM_FAILED':
          errors.iban = messages.company.ibanChecksumFailed;
          break;
        case 'WRONG_LENGTH':
          errors.iban = messages.company.ibanWrongLength
            .replace('{expected}', String(result.error.expected))
            .replace('{actual}', String(result.error.actual));
          break;
        case 'UNKNOWN_COUNTRY':
          errors.iban = messages.company.ibanUnknownCountry.replace(
            '{country}',
            result.error.countryCode,
          );
          break;
        default:
          errors.iban = messages.company.ibanInvalid;
      }
    }
  }

  if (data.bic !== null && !isValidBic(data.bic)) {
    errors.bic = messages.company.bicInvalid;
  }

  return errors;
}

export async function saveCompanyProfileAction(
  _previous: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', errors: { form: messages.common.rejected }, values: {} };
  }

  const session = await requireSessionOrThrow();
  const values = collectValues(formData);

  const parsed = companySchema.safeParse({
    ...values,
    isSmallBusiness: formData.get('isSmallBusiness') ?? undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      errors[field] = messages.common.validationFailed;
    }
    return { status: 'error', errors, values };
  }

  // Normalisierte Schreibweise speichern, nicht die Eingabe des Benutzers.
  const { defaultTaxRatePercent, ...rest } = parsed.data;
  const data: CompanyProfileData = {
    ...rest,
    defaultTaxRateBasisPoints: defaultTaxRatePercent * PERCENT_BASIS_POINTS,
    countryCode: parsed.data.countryCode.toUpperCase(),
    defaultCurrency: parsed.data.defaultCurrency.toUpperCase(),
    iban: parsed.data.iban === null ? null : parsed.data.iban.replace(/\s/g, '').toUpperCase(),
    bic: parsed.data.bic === null ? null : parsed.data.bic.replace(/\s/g, '').toUpperCase(),
    vatId: parsed.data.vatId === null ? null : parsed.data.vatId.replace(/[\s.]/g, '').toUpperCase(),
  };

  const businessErrors = validateBusinessRules(data);
  if (Object.keys(businessErrors).length > 0) {
    return { status: 'error', errors: businessErrors, values };
  }

  const context = await readRequestContext();
  await saveCompanyProfile(session.organization, data, session.userId, context.ipAddress);

  revalidatePath(COMPANY_SETTINGS_PATH);
  return { status: 'saved' };
}

export type LogoFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'saved' }
  | { readonly status: 'error'; readonly message: string };

const LOGO_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  EMPTY: messages.company.logoEmpty,
  TOO_LARGE: messages.company.logoTooLarge,
  UNRECOGNIZED_CONTENT: messages.company.logoUnrecognized,
  TYPE_MISMATCH: messages.company.logoTypeMismatch,
  ACTIVE_CONTENT: messages.company.logoActiveContent,
};

export async function uploadLogoAction(
  _previous: LogoFormState,
  formData: FormData,
): Promise<LogoFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireSessionOrThrow();
  const file = formData.get('logo');

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: messages.company.logoEmpty };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await storeImageAsset(session.organization, bytes, file.type, file.name);

  if (!result.ok) {
    return {
      status: 'error',
      message: LOGO_ERROR_MESSAGES[result.error.kind] ?? messages.company.logoUnrecognized,
    };
  }

  const context = await readRequestContext();
  const previous = await getCompanyProfile(session.organization);

  await setCompanyLogo(session.organization, result.value.id, session.userId, context.ipAddress);

  // Das ersetzte Logo wird entfernt, damit der Speicher nicht mit
  // unerreichbaren Dateien zuwächst.
  if (previous?.logoAssetId != null) {
    await deleteAsset(session.organization, previous.logoAssetId);
  }

  revalidatePath(COMPANY_SETTINGS_PATH);
  return { status: 'saved' };
}

export async function removeLogoAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const context = await readRequestContext();

  const profile = await getCompanyProfile(session.organization);
  if (profile?.logoAssetId == null) {
    return;
  }

  await setCompanyLogo(session.organization, null, session.userId, context.ipAddress);
  await deleteAsset(session.organization, profile.logoAssetId);

  revalidatePath(COMPANY_SETTINGS_PATH);
}
