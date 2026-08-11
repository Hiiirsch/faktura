/**
 * Pflichthinweise auf dem Beleg
 * (FA-CALC-05, -06; FA-PFL-08, -09, -11; Spec §5).
 *
 * Reine Ableitung aus dem Beleg — kein Freitext, den jemand vergessen könnte.
 * Genau dafür trägt die Rechnung ein eigenes `taxScheme`: Aus den Positionen
 * allein ließen sich die Hinweise nicht bestimmen, etwa bei einem Beleg ohne
 * Positionen oder mit gemischten Kategorien.
 *
 * Die Formulierungen geben den üblichen Stand wieder und ersetzen keine
 * steuerliche Beratung — der Anforderungskatalog weist im Vorspann darauf hin.
 */
import type { DocumentType } from './document-type';
import type { TaxScheme } from '../tax/tax-scheme';

export type NoticeInput = {
  readonly documentType: DocumentType;
  readonly taxScheme: TaxScheme;
  /** USt-IdNr des Ausstellers — bei Reverse Charge auszuweisen. */
  readonly sellerVatId: string | null;
  /** USt-IdNr des Empfängers — bei Reverse Charge auszuweisen. */
  readonly buyerVatId: string | null;
  /** Nummer der stornierten Rechnung, falls dies ein Storno ist. */
  readonly precedingInvoiceNumber: string | null;
};

const SMALL_BUSINESS =
  'Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).';

const REVERSE_CHARGE =
  'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge). ' +
  'Die Umsatzsteuer schuldet der Leistungsempfänger.';

const EXPORT = 'Steuerfreie Ausfuhrlieferung.';

export function buildNotices(input: NoticeInput): readonly string[] {
  const notices: string[] = [];

  switch (input.taxScheme) {
    case 'SMALL_BUSINESS':
      notices.push(SMALL_BUSINESS);
      break;
    case 'REVERSE_CHARGE':
      notices.push(REVERSE_CHARGE);
      // FA-PFL-09: Bei Reverse Charge sind beide Nummern auszuweisen. Der
      // Hinweis nennt sie ausdrücklich, damit sie auch dann auf dem Beleg
      // stehen, wenn die Vorlage sie an keiner anderen Stelle ausgibt.
      if (input.sellerVatId !== null && input.buyerVatId !== null) {
        notices.push(
          `USt-IdNr. Aussteller: ${input.sellerVatId} · ` +
            `USt-IdNr. Leistungsempfänger: ${input.buyerVatId}`,
        );
      }
      break;
    case 'EXPORT':
      notices.push(EXPORT);
      break;
    case 'STANDARD':
      break;
  }

  // FA-PFL-11: Ein Stornodokument nennt die Nummer der stornierten Rechnung.
  if (input.documentType === 'CREDIT_NOTE' && input.precedingInvoiceNumber !== null) {
    notices.push(`Storno zur Rechnung ${input.precedingInvoiceNumber}.`);
  }

  return notices;
}

/** Zahlungshinweis aus Fälligkeit und Bankverbindung (FA-PFL-10). */
export function buildPaymentTermsNotice(
  dueDate: string | null,
  isCreditNote: boolean,
): string | null {
  if (isCreditNote) {
    // Eine Gutschrift ist nicht zahlbar; ein Zahlungsziel wäre irreführend.
    return null;
  }
  if (dueDate === null) {
    return null;
  }
  return `Zahlbar ohne Abzug bis zum ${dueDate.slice(8, 10)}.${dueDate.slice(5, 7)}.${dueDate.slice(0, 4)}.`;
}
