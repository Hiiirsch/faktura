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
  upsertCompanyProfile,
} from '@/infrastructure/repositories/company-repository';
import type { Authorized } from '@/application/auth/authorize';

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
  /** Briefpapier: eine einseitige A4-PDF unter dem Beleg (M12, FA-TPL-11). */
  readonly letterheadAssetId: string | null;
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
  context: Authorized<'companyProfile.read'>,
): Promise<CompanyProfile | null> {
  return findCompanyProfile(context);
}

/** Liefert das gespeicherte Profil oder die leere Vorbelegung für das Formular. */
export async function getCompanyProfileOrEmpty(
  context: Authorized<'companyProfile.read'>,
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

/**
 * Verlangt **beide** Rechte, weil das Protokoll die geänderten Felder nennt: Um
 * einen Unterschied zu bilden, muss der vorige Stand gelesen werden. Kein
 * Zugeständnis im Betrieb — `companyProfile.read` ist ein Grundrecht.
 */
export async function saveCompanyProfile(
  context: Authorized<'companyProfile.read' | 'companyProfile.update'>,
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
  context: Authorized<'numbering.update'>,
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

/** Ändert das Dateinamenmuster erzeugter PDFs (FA-PDF-09). */
export async function setPdfFileNamePattern(
  context: Authorized<'numbering.update'>,
  pattern: string,
  actorId: string,
  ipAddress: string | null,
): Promise<void> {
  const saved = await upsertCompanyProfile(
    context,
    { ...EMPTY_COMPANY_PROFILE, pdfFileNamePattern: pattern },
    { pdfFileNamePattern: pattern },
  );

  await recordAuditEntry(context, {
    entityType: 'CompanyProfile',
    entityId: saved.id,
    action: 'UPDATED',
    actorId,
    ipAddress,
    details: { changedFields: 'pdfFileNamePattern', pdfFileNamePattern: pattern },
  });
}

export async function setCompanyLogo(
  context: Authorized<'companyProfile.update'>,
  assetId: string | null,
  actorId: string,
  ipAddress: string | null,
): Promise<void> {
  /*
   * **Anlegen oder ändern — nicht nur ändern.**
   *
   * Bis hierher war das ein `update`, und das setzte voraus, dass die Zeile
   * schon existiert. Wer das Logo **vor** den Firmendaten hochlud, bekam eine
   * Datenbankausnahme statt einer Meldung: Datei und `Asset`-Zeile waren da
   * bereits geschrieben, die Verknüpfung nie. Zurück blieben eine wortlose
   * Fehlermeldung und eine verwaiste Datei.
   *
   * Eine Reihenfolge, die niemand kennt, ist keine Regel, sondern eine Falle.
   * Der `upsert` nimmt sie weg: Ein Logo lässt sich zuerst hochladen, die
   * Firmendaten folgen später. Die leere Zeile, die dabei entsteht, ist
   * gleichbedeutend mit gar keiner — `requireCompanyProfile()` liefert für beide
   * `EMPTY_COMPANY_PROFILE`.
   */
  await upsertCompanyProfile(
    context,
    { ...EMPTY_COMPANY_PROFILE, logoAssetId: assetId },
    { logoAssetId: assetId },
  );

  await recordAuditEntry(context, {
    entityType: 'CompanyProfile',
    entityId: context.organizationId,
    action: 'UPDATED',
    actorId,
    ipAddress,
    details: { changedFields: 'logoAssetId' },
  });
}

/**
 * Verknüpft oder entfernt das Briefpapier (M12, FA-TPL-11).
 *
 * `upsert` aus demselben Grund wie beim Logo: Wer das Briefpapier hochlädt,
 * bevor er die Firmendaten erfasst hat, soll keine Datenbankausnahme sehen.
 */
export async function setCompanyLetterhead(
  context: Authorized<'companyProfile.update'>,
  assetId: string | null,
  actorId: string,
  ipAddress: string | null,
): Promise<void> {
  await upsertCompanyProfile(
    context,
    { ...EMPTY_COMPANY_PROFILE, letterheadAssetId: assetId },
    { letterheadAssetId: assetId },
  );

  await recordAuditEntry(context, {
    entityType: 'CompanyProfile',
    entityId: context.organizationId,
    action: 'UPDATED',
    actorId,
    ipAddress,
    details: { changedFields: 'letterheadAssetId' },
  });
}
