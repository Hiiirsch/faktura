/**
 * Vollständigkeitsprüfung vor dem Festschreiben (FA-RECH-12, Spec §6).
 *
 * Nach dem Festschreiben ist der Beleg unveränderlich — eine fehlerhafte
 * Rechnung lässt sich dann nur noch stornieren, nicht korrigieren. Deshalb
 * wird hier alles geprüft, was danach nicht mehr zu heilen wäre.
 *
 * Zurückgegeben werden **alle** Verstöße, nicht nur der erste: Wer eine
 * Rechnung abschließen will, soll nicht nacheinander auf drei Fehler stoßen.
 */
import { requiresZeroRate, type TaxCategoryCode } from '../codes/tax-category';
import type { Cents } from '../money/money';
import { comparePlainDates, type PlainDate } from '../time/plain-date';
import type { TaxScheme } from '../tax/tax-scheme';

import { type BuyerViolation, type DraftBuyer, validateBuyer } from './buyer';

export type IssueCandidateLine = {
  readonly name: string;
  readonly quantityScaled: number;
  readonly unitPriceCents: Cents;
  readonly taxRateBasisPoints: number;
  readonly taxCategory: TaxCategoryCode;
};

export type IssueCandidate = {
  /** Der Empfänger — aus den Stammdaten oder am Beleg erfasst (M5.7). */
  readonly buyer: DraftBuyer;
  readonly issueDate: PlainDate | null;
  readonly serviceDateFrom: PlainDate | null;
  readonly serviceDateTo: PlainDate | null;
  readonly dueDate: PlainDate | null;
  readonly taxScheme: TaxScheme;
  readonly lines: readonly IssueCandidateLine[];
  /** Steuernummer oder USt-IdNr des eigenen Unternehmens. */
  readonly sellerHasTaxIdentifier: boolean;
  /** Bei Reverse Charge müssen beide USt-IdNr vorliegen (FA-PFL-09). */
  readonly sellerVatId: string | null;
  readonly buyerVatId: string | null;
};

export type CompletenessViolation =
  | BuyerViolation
  | { readonly kind: 'NO_LINES' }
  | { readonly kind: 'LINE_WITHOUT_NAME'; readonly position: number }
  | { readonly kind: 'NO_ISSUE_DATE' }
  | { readonly kind: 'NO_SERVICE_DATE' }
  | { readonly kind: 'NO_DUE_DATE' }
  | { readonly kind: 'DUE_BEFORE_ISSUE' }
  | { readonly kind: 'SERVICE_PERIOD_REVERSED' }
  | { readonly kind: 'NO_TAX_IDENTIFIER' }
  | { readonly kind: 'MISSING_VAT_IDS_FOR_REVERSE_CHARGE' }
  | { readonly kind: 'TAX_RATE_CONTRADICTS_CATEGORY'; readonly position: number };

export function validateForIssue(candidate: IssueCandidate): readonly CompletenessViolation[] {
  const violations: CompletenessViolation[] = [];

  // §14 UStG verlangt Name und Anschrift des Empfängers — gleich, ob er aus
  // den Stammdaten kommt oder am Beleg steht (FA-PFL-01).
  violations.push(...validateBuyer(candidate.buyer));

  if (candidate.lines.length === 0) {
    violations.push({ kind: 'NO_LINES' });
  }

  candidate.lines.forEach((line, index) => {
    if (line.name.trim().length === 0) {
      violations.push({ kind: 'LINE_WITHOUT_NAME', position: index + 1 });
    }
    // Doppelte Absicherung: Die Berechnung wirft bei diesem Widerspruch, aber
    // hier entsteht daraus eine verständliche Meldung statt eines Absturzes.
    if (requiresZeroRate(line.taxCategory) && line.taxRateBasisPoints !== 0) {
      violations.push({ kind: 'TAX_RATE_CONTRADICTS_CATEGORY', position: index + 1 });
    }
  });

  if (candidate.issueDate === null) {
    violations.push({ kind: 'NO_ISSUE_DATE' });
  }
  if (candidate.dueDate === null) {
    violations.push({ kind: 'NO_DUE_DATE' });
  }
  // BT-72: Leistungsdatum oder -zeitraum ist Pflichtangabe.
  if (candidate.serviceDateFrom === null) {
    violations.push({ kind: 'NO_SERVICE_DATE' });
  }

  if (
    candidate.issueDate !== null &&
    candidate.dueDate !== null &&
    comparePlainDates(candidate.dueDate, candidate.issueDate) < 0
  ) {
    violations.push({ kind: 'DUE_BEFORE_ISSUE' });
  }

  if (
    candidate.serviceDateFrom !== null &&
    candidate.serviceDateTo !== null &&
    comparePlainDates(candidate.serviceDateTo, candidate.serviceDateFrom) < 0
  ) {
    violations.push({ kind: 'SERVICE_PERIOD_REVERSED' });
  }

  if (!candidate.sellerHasTaxIdentifier) {
    violations.push({ kind: 'NO_TAX_IDENTIFIER' });
  }

  // Ohne beide Nummern ist der Beleg bei Reverse Charge nicht ordnungsgemäß.
  if (
    candidate.taxScheme === 'REVERSE_CHARGE' &&
    (candidate.sellerVatId === null || candidate.buyerVatId === null)
  ) {
    violations.push({ kind: 'MISSING_VAT_IDS_FOR_REVERSE_CHARGE' });
  }

  return violations;
}

export function isReadyToIssue(candidate: IssueCandidate): boolean {
  return validateForIssue(candidate).length === 0;
}
