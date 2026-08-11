/**
 * Firmenstammdaten (FA-STAMM-01 bis -09).
 *
 * Genau ein Profil je Organisation. Die Eindeutigkeit liegt seit M5.5a im
 * eindeutigen Index auf `organizationId`, nicht mehr in einer CHECK-Bedingung
 * auf einer festen Kennung — die schärfere Zusage, weil sie auch bei mehreren
 * Organisationen trägt.
 */
import { DEFAULT_COUNTRY_CODE } from '@/domain/codes/country-code';
import { DEFAULT_CURRENCY_CODE } from '@/domain/codes/currency-code';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import {
  findCompanyProfile,
  setCompanyLogoAsset,
  upsertCompanyProfile,
} from '@/infrastructure/repositories/company-repository';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';

export type CompanyProfileData = {
  readonly legalName: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly taxNumber: string | null;
  readonly vatId: string | null;
  readonly isSmallBusiness: boolean;
  readonly registerCourt: string | null;
  readonly registerNumber: string | null;
  readonly managingDirector: string | null;
  readonly bankAccountHolder: string | null;
  readonly iban: string | null;
  readonly bic: string | null;
  readonly bankName: string | null;
  readonly defaultPaymentTerms: number;
  /** Basispunkte: 1900 = 19 %. */
  readonly defaultTaxRateBasisPoints: number;
  readonly defaultCurrency: string;
  readonly footerText: string | null;
};

export type CompanyProfile = CompanyProfileData & {
  readonly id: string;
  readonly logoAssetId: string | null;
  readonly invoiceNumberFormat: string;
  readonly updatedAt: Date;
};

/** Vorbelegung, solange noch nichts erfasst wurde. */
export const EMPTY_COMPANY_PROFILE: CompanyProfileData = {
  legalName: '',
  addressLine1: '',
  addressLine2: null,
  postalCode: '',
  city: '',
  countryCode: DEFAULT_COUNTRY_CODE,
  email: null,
  phone: null,
  website: null,
  taxNumber: null,
  vatId: null,
  isSmallBusiness: false,
  registerCourt: null,
  registerNumber: null,
  managingDirector: null,
  bankAccountHolder: null,
  iban: null,
  bic: null,
  bankName: null,
  defaultPaymentTerms: 14,
  defaultTaxRateBasisPoints: 1900,
  defaultCurrency: DEFAULT_CURRENCY_CODE,
  footerText: null,
};

export async function getCompanyProfile(
  context: OrganizationContext,
): Promise<CompanyProfile | null> {
  return findCompanyProfile(context);
}

/** Liefert das gespeicherte Profil oder die leere Vorbelegung für das Formular. */
export async function getCompanyProfileOrEmpty(
  context: OrganizationContext,
): Promise<CompanyProfileData> {
  return (await getCompanyProfile(context)) ?? EMPTY_COMPANY_PROFILE;
}

/**
 * Ermittelt die geänderten Felder für das Protokoll (FA-STAMM-09).
 *
 * Protokolliert werden die Feldnamen, nicht die Werte: Bankverbindung und
 * Steuernummer gehören nicht in ein Protokoll, das später eingesehen oder
 * exportiert wird (NFA-BETR-10).
 */
function changedFieldNames(
  before: CompanyProfileData | null,
  after: CompanyProfileData,
): readonly string[] {
  if (before === null) {
    return ['*'];
  }

  const keys = Object.keys(after) as (keyof CompanyProfileData)[];
  return keys.filter((key) => before[key] !== after[key]).map(String);
}

export async function saveCompanyProfile(
  context: OrganizationContext,
  data: CompanyProfileData,
  actorId: string,
  ipAddress: string | null,
): Promise<CompanyProfile> {
  const before = await getCompanyProfile(context);

  const saved = await upsertCompanyProfile(context, data, data);

  const changed = changedFieldNames(before, data);
  if (changed.length > 0) {
    await recordAuditEntry(context, {
      entityType: 'CompanyProfile',
      entityId: saved.id,
      action: before === null ? 'CREATED' : 'UPDATED',
      actorId,
      ipAddress,
      details: { changedFields: changed.join(',') },
    });
  }

  return saved;
}

/** Ändert das Nummernformat (FA-NUM-01). Wirkt nur auf künftige Belege. */
export async function setInvoiceNumberFormat(
  context: OrganizationContext,
  format: string,
  actorId: string,
  ipAddress: string | null,
): Promise<void> {
  const saved = await upsertCompanyProfile(
    context,
    { ...EMPTY_COMPANY_PROFILE, invoiceNumberFormat: format },
    { invoiceNumberFormat: format },
  );

  await recordAuditEntry(context, {
    entityType: 'CompanyProfile',
    entityId: saved.id,
    action: 'UPDATED',
    actorId,
    ipAddress,
    details: { changedFields: 'invoiceNumberFormat', invoiceNumberFormat: format },
  });
}

export async function setCompanyLogo(
  context: OrganizationContext,
  assetId: string | null,
  actorId: string,
  ipAddress: string | null,
): Promise<void> {
  await setCompanyLogoAsset(context, assetId);

  await recordAuditEntry(context, {
    entityType: 'CompanyProfile',
    entityId: context.organizationId,
    action: 'UPDATED',
    actorId,
    ipAddress,
    details: { changedFields: 'logoAssetId' },
  });
}
