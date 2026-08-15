/**
 * Das kanonische, ausgabeneutrale Dokumentmodell (NFA-ARCH-02, -03, Spec §3.1).
 *
 * Zwischen Datenbank und Ausgabe steht **ein** Modell, aus dem alle Formate
 * entstehen:
 *
 *     DB ──► buildInvoiceDocument() ──► InvoiceDocument ──┬──► HTML ──► PDF
 *                                                          └──► [V2] ZUGFeRD-XML
 *
 * Es enthält alle Felder, die EN 16931 verlangt — auch solche, die das heutige
 * HTML-Template ignoriert. Nur so lässt sich die E-Rechnung später ergänzen,
 * ohne die Daten nachträglich zu erheben; die betroffenen Felder sind mit ihrer
 * BT-/BG-Nummer aus der Norm gekennzeichnet.
 *
 * Beträge bleiben ganzzahlige Cent, Mengen skalierte Ganzzahlen, Codes
 * normiert. Formatierung ist Sache der Ausgabe — ein XML-Mapper braucht die
 * Rohwerte, kein „1.234,56 €".
 */
import type { CurrencyCode } from '../codes/currency-code';
import type { TaxCategoryCode } from '../codes/tax-category';
import type { UnitCode } from '../codes/unit-code';
import type { Cents } from '../money/money';
import type { PlainDate } from '../time/plain-date';
import type { DocumentType } from './document-type';

/** Anschrift einer Partei — BG-4 (Verkäufer) beziehungsweise BG-7 (Käufer). */
export type DocumentAddress = {
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly postalCode: string;
  readonly city: string;
  /** ISO 3166-1 alpha-2, nie ein Klartext-Ländername. */
  readonly countryCode: string;
};

export type DocumentSeller = {
  readonly name: string;
  readonly address: DocumentAddress;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  /** BT-31. */
  readonly vatId: string | null;
  /** BT-32, nationale Steuernummer. */
  readonly taxNumber: string | null;
  readonly registerCourt: string | null;
  readonly registerNumber: string | null;
  readonly managingDirector: string | null;
  readonly bankAccountHolder: string | null;
  /** BT-84. */
  readonly iban: string | null;
  /** BT-86. */
  readonly bic: string | null;
  readonly bankName: string | null;
  readonly isSmallBusiness: boolean;
};

export type DocumentBuyer = {
  readonly name: string;
  readonly contactName: string | null;
  readonly address: DocumentAddress;
  /**
   * Freier Anschriftenblock, Zeile für Zeile — gesetzt, wenn der Empfänger
   * nicht in Felder passte (M5.7). Wo er steht, tritt er auf dem Beleg an die
   * Stelle von `address`; die Vorlage entscheidet anhand seines Vorhandenseins.
   */
  readonly addressBlock: readonly string[] | null;
  readonly email: string | null;
  readonly phone: string | null;
  /** BT-48. */
  readonly vatId: string | null;
  /** `null` bei einem Empfänger ohne Stammdatensatz. */
  readonly customerNumber: string | null;
  /** BT-10, Leitweg-ID bei öffentlichen Auftraggebern. */
  readonly buyerReference: string | null;
};

export type DocumentLine = {
  /** BT-126. */
  readonly position: number;
  /** BT-153. */
  readonly name: string;
  /** BT-154. */
  readonly description: string | null;
  /** BT-129, skaliert mit 10^4. */
  readonly quantityScaled: number;
  /** BT-130, UN/ECE Rec 20. */
  readonly unitCode: UnitCode;
  /** Deutsche Bezeichnung der Einheit — Bequemlichkeit für Vorlagen. */
  readonly unitLabel: string;
  /** BT-146. */
  readonly unitPriceCents: Cents;
  /** BT-147, in Basispunkten. */
  readonly discountBasisPoints: number;
  /** BT-152, in Basispunkten: 1900 = 19 %. */
  readonly taxRateBasisPoints: number;
  /** BT-151, UNTDID 5305. */
  readonly taxCategory: TaxCategoryCode;
  readonly taxCategoryLabel: string;
  /** BT-131. */
  readonly lineNetCents: Cents;
};

/** Eine Zeile der Steueraufstellung — BG-23. */
export type DocumentTaxGroup = {
  /** BT-119. */
  readonly taxRateBasisPoints: number;
  /** BT-118. */
  readonly taxCategory: TaxCategoryCode;
  readonly taxCategoryLabel: string;
  /** BT-116. */
  readonly netCents: Cents;
  /** BT-117. */
  readonly taxCents: Cents;
};

export type DocumentTotals = {
  /** BT-109. */
  readonly netCents: Cents;
  /** BT-110. */
  readonly taxCents: Cents;
  /** BT-112. */
  readonly grossCents: Cents;
  /** BT-113. */
  readonly paidCents: Cents;
  /** BT-115. */
  readonly outstandingCents: Cents;
};

/** Bezug auf den stornierten Beleg — BT-25 und BT-26. */
export type PrecedingDocument = {
  readonly invoiceNumber: string;
  readonly issueDate: PlainDate | null;
};

export type InvoiceDocument = {
  readonly documentType: DocumentType;
  readonly documentTypeLabel: string;
  /** BT-1. Leer, solange der Beleg Entwurf ist. */
  readonly invoiceNumber: string | null;
  /** BT-2. */
  readonly issueDate: PlainDate | null;
  /** BT-72. */
  readonly serviceDateFrom: PlainDate | null;
  readonly serviceDateTo: PlainDate | null;
  /** BT-9. */
  readonly dueDate: PlainDate | null;
  /** BT-5. */
  readonly currency: CurrencyCode;
  /** BT-13. */
  readonly purchaseOrderRef: string | null;

  readonly seller: DocumentSeller;
  readonly buyer: DocumentBuyer;

  readonly lines: readonly DocumentLine[];
  readonly taxBreakdown: readonly DocumentTaxGroup[];
  readonly totals: DocumentTotals;

  readonly preceding: PrecedingDocument | null;

  readonly introText: string | null;
  readonly outroText: string | null;
  readonly footerText: string | null;

  /**
   * Pflichthinweise, automatisch ermittelt: Kleinunternehmerregelung,
   * Steuerschuldnerschaft des Leistungsempfängers, Ausfuhr, Stornobezug
   * (FA-CALC-05, -06; FA-PFL-08, -09, -11).
   */
  readonly notices: readonly string[];

  /**
   * Ein Entwurf hat keine Nummer und darf nicht wie ein gültiger Beleg
   * aussehen — die Vorlage kennzeichnet ihn sichtbar (FA-PDF-03).
   */
  readonly isDraft: boolean;
};
