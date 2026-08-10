/**
 * Firmenstammdaten (FA-STAMM-01 bis -09).
 *
 * Das Profil ist ein Singleton mit der Kennung 1. Der Zugriff läuft
 * ausschließlich über diese Datei — `upsert` mit fester Kennung ist die einzige
 * Schreiboperation, und die Datenbank setzt zusätzlich eine CHECK-Bedingung
 * durch.
 */
import { DEFAULT_COUNTRY_CODE } from '@/domain/codes/country-code';
import { DEFAULT_CURRENCY_CODE } from '@/domain/codes/currency-code';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { getPrismaClient } from '@/infrastructure/db/prisma';

export const COMPANY_PROFILE_ID = 1;

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
  readonly defaultTaxRate: number;
  readonly defaultCurrency: string;
  readonly footerText: string | null;
};

export type CompanyProfile = CompanyProfileData & {
  readonly id: number;
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
  defaultTaxRate: 19,
  defaultCurrency: DEFAULT_CURRENCY_CODE,
  footerText: null,
};

export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  return getPrismaClient().companyProfile.findUnique({ where: { id: COMPANY_PROFILE_ID } });
}

/** Liefert das gespeicherte Profil oder die leere Vorbelegung für das Formular. */
export async function getCompanyProfileOrEmpty(): Promise<CompanyProfileData> {
  return (await getCompanyProfile()) ?? EMPTY_COMPANY_PROFILE;
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
  data: CompanyProfileData,
  actorId: string,
  ipAddress: string | null,
): Promise<CompanyProfile> {
  const prisma = getPrismaClient();
  const before = await getCompanyProfile();

  const saved = await prisma.companyProfile.upsert({
    where: { id: COMPANY_PROFILE_ID },
    create: { id: COMPANY_PROFILE_ID, ...data },
    update: data,
  });

  const changed = changedFieldNames(before, data);
  if (changed.length > 0) {
    await recordAuditEntry({
      entityType: 'CompanyProfile',
      entityId: String(COMPANY_PROFILE_ID),
      action: before === null ? 'CREATED' : 'UPDATED',
      actorId,
      ipAddress,
      details: { changedFields: changed.join(',') },
    });
  }

  return saved;
}

export async function setCompanyLogo(
  assetId: string | null,
  actorId: string,
  ipAddress: string | null,
): Promise<void> {
  await getPrismaClient().companyProfile.update({
    where: { id: COMPANY_PROFILE_ID },
    data: { logoAssetId: assetId },
  });

  await recordAuditEntry({
    entityType: 'CompanyProfile',
    entityId: String(COMPANY_PROFILE_ID),
    action: 'UPDATED',
    actorId,
    ipAddress,
    details: { changedFields: 'logoAssetId' },
  });
}
