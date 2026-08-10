/**
 * Umsatzrelevanz eines Belegs (FA-DASH-04, Grundlage für FA-DASH-01 bis -03).
 *
 * Die eine Stelle, an der entschieden wird, was in eine Umsatz- oder
 * Forderungskennzahl einfließt. FA-DASH-09 verlangt ohnehin eine einzige
 * zentrale Auswertungsfunktion — das hier ist ihr Kern.
 *
 * Zur Behandlung von Gutschriften: Beim Storno wechselt das Original auf
 * `CANCELLED` und scheidet damit aus. Zählte die Gutschrift zusätzlich mit,
 * fehlte der Betrag ein zweites Mal — bei einer stornierten Rechnung über
 * 10.000 € wären das 10.000 € zu wenig Jahresumsatz. Gutschriften bleiben
 * deshalb außen vor.
 *
 * Ihre Beträge werden positiv geführt, nicht negativ: EN 16931 unterscheidet
 * Rechnung und Gutschrift über den Belegtyp, nicht über das Vorzeichen. So
 * kann ein negativer Betrag auch nicht versehentlich in eine Summe geraten,
 * die ihn nicht erwartet.
 */
import type { DocumentType } from '../document/document-type';
import type { InvoiceStatus } from './status';

export type RevenueRelevance = {
  readonly documentType: DocumentType;
  readonly status: InvoiceStatus;
};

export function countsTowardRevenue(document: RevenueRelevance): boolean {
  if (document.documentType !== 'INVOICE') {
    return false;
  }
  return (
    document.status === 'ISSUED' ||
    document.status === 'PARTIALLY_PAID' ||
    document.status === 'PAID'
  );
}

/** Belege, die als offene Forderung zählen (FA-DASH-01). */
export function countsTowardReceivables(document: RevenueRelevance): boolean {
  if (document.documentType !== 'INVOICE') {
    return false;
  }
  return document.status === 'ISSUED' || document.status === 'PARTIALLY_PAID';
}
