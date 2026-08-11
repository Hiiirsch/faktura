/**
 * Die Variablen, die einer Vorlage zur Verfügung stehen (FA-TPL-06, Spec §8.1).
 *
 * Als Daten und nicht als Fließtext in der Oberfläche: Die Liste steht neben
 * dem Aufbau des Gültigkeitsbereichs in `liquid-engine.ts`, und
 * `tests/unit/domain/template-variables.test.ts` gleicht beides ab. Eine
 * Dokumentation, die neben der Wirklichkeit herläuft, ist schlimmer als keine
 * — sie kostet den Leser Zeit und endet in einer leeren Stelle im Beleg.
 */

export type TemplateVariableGroup =
  | 'seller'
  | 'buyer'
  | 'invoice'
  | 'lines'
  | 'taxBreakdown'
  | 'totals'
  | 'notices'
  | 'filters';

export type TemplateVariable = {
  readonly group: TemplateVariableGroup;
  /** Wie es in der Vorlage geschrieben wird. */
  readonly expression: string;
  readonly description: string;
};

export const TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
  // ── Aussteller ────────────────────────────────────────────────────────────
  { group: 'seller', expression: 'seller.name', description: 'Firmenname' },
  { group: 'seller', expression: 'seller.address.addressLine1', description: 'Straße und Hausnummer' },
  { group: 'seller', expression: 'seller.address.addressLine2', description: 'Adresszusatz' },
  { group: 'seller', expression: 'seller.address.postalCode', description: 'Postleitzahl' },
  { group: 'seller', expression: 'seller.address.city', description: 'Ort' },
  { group: 'seller', expression: 'seller.address.countryCode', description: 'Land (ISO 3166-1)' },
  { group: 'seller', expression: 'seller.email', description: 'E-Mail-Adresse' },
  { group: 'seller', expression: 'seller.phone', description: 'Telefon' },
  { group: 'seller', expression: 'seller.website', description: 'Webseite' },
  { group: 'seller', expression: 'seller.taxNumber', description: 'Steuernummer' },
  { group: 'seller', expression: 'seller.vatId', description: 'USt-IdNr.' },
  { group: 'seller', expression: 'seller.registerCourt', description: 'Registergericht' },
  { group: 'seller', expression: 'seller.registerNumber', description: 'Registernummer' },
  { group: 'seller', expression: 'seller.managingDirector', description: 'Geschäftsführung' },
  { group: 'seller', expression: 'seller.bankAccountHolder', description: 'Kontoinhaber' },
  { group: 'seller', expression: 'seller.iban', description: 'IBAN' },
  { group: 'seller', expression: 'seller.bic', description: 'BIC' },
  { group: 'seller', expression: 'seller.bankName', description: 'Kreditinstitut' },
  { group: 'seller', expression: 'seller.isSmallBusiness', description: 'Kleinunternehmer nach §19' },

  // ── Empfänger ─────────────────────────────────────────────────────────────
  { group: 'buyer', expression: 'buyer.name', description: 'Firmen- oder Personenname' },
  { group: 'buyer', expression: 'buyer.contactName', description: 'Ansprechpartner' },
  { group: 'buyer', expression: 'buyer.address.addressLine1', description: 'Straße und Hausnummer' },
  { group: 'buyer', expression: 'buyer.address.addressLine2', description: 'Adresszusatz' },
  { group: 'buyer', expression: 'buyer.address.postalCode', description: 'Postleitzahl' },
  { group: 'buyer', expression: 'buyer.address.city', description: 'Ort' },
  { group: 'buyer', expression: 'buyer.address.countryCode', description: 'Land (ISO 3166-1)' },
  { group: 'buyer', expression: 'buyer.email', description: 'E-Mail-Adresse' },
  { group: 'buyer', expression: 'buyer.phone', description: 'Telefon' },
  { group: 'buyer', expression: 'buyer.vatId', description: 'USt-IdNr.' },
  { group: 'buyer', expression: 'buyer.customerNumber', description: 'Kundennummer' },
  { group: 'buyer', expression: 'buyer.buyerReference', description: 'Leitweg-ID (BT-10)' },

  // ── Beleg ─────────────────────────────────────────────────────────────────
  { group: 'invoice', expression: 'invoice.number', description: 'Belegnummer; bei einem Entwurf leer' },
  { group: 'invoice', expression: 'invoice.documentType', description: 'INVOICE oder CREDIT_NOTE' },
  { group: 'invoice', expression: 'invoice.documentTypeLabel', description: 'Rechnung bzw. Stornorechnung' },
  { group: 'invoice', expression: 'invoice.issueDate', description: 'Rechnungsdatum' },
  { group: 'invoice', expression: 'invoice.serviceDateFrom', description: 'Leistungsdatum bzw. -beginn' },
  { group: 'invoice', expression: 'invoice.serviceDateTo', description: 'Ende des Leistungszeitraums' },
  { group: 'invoice', expression: 'invoice.dueDate', description: 'Fälligkeitsdatum' },
  { group: 'invoice', expression: 'invoice.currency', description: 'Währung (ISO 4217)' },
  { group: 'invoice', expression: 'invoice.purchaseOrderRef', description: 'Bestellnummer' },
  { group: 'invoice', expression: 'invoice.introText', description: 'Einleitungstext' },
  { group: 'invoice', expression: 'invoice.outroText', description: 'Schlusstext' },
  { group: 'invoice', expression: 'invoice.isDraft', description: 'wahr, solange der Beleg Entwurf ist' },
  { group: 'invoice', expression: 'invoice.preceding.invoiceNumber', description: 'stornierte Rechnung' },
  { group: 'invoice', expression: 'invoice.preceding.issueDate', description: 'deren Rechnungsdatum' },

  // ── Positionen ────────────────────────────────────────────────────────────
  { group: 'lines', expression: 'line.position', description: 'Positionsnummer' },
  { group: 'lines', expression: 'line.name', description: 'Bezeichnung' },
  { group: 'lines', expression: 'line.description', description: 'Beschreibung' },
  { group: 'lines', expression: 'line.quantity', description: 'Menge; mit Filter quantity ausgeben' },
  { group: 'lines', expression: 'line.unitCode', description: 'Einheit (UN/ECE Rec 20)' },
  { group: 'lines', expression: 'line.unitLabel', description: 'Einheit als deutscher Text' },
  { group: 'lines', expression: 'line.unitPrice', description: 'Einzelpreis in Cent; mit money ausgeben' },
  { group: 'lines', expression: 'line.discount', description: 'Rabatt in Basispunkten; mit percent ausgeben' },
  { group: 'lines', expression: 'line.taxRate', description: 'Steuersatz in Basispunkten' },
  { group: 'lines', expression: 'line.taxCategory', description: 'Steuerkategorie (UNTDID 5305)' },
  { group: 'lines', expression: 'line.taxCategoryLabel', description: 'Steuerkategorie als Text' },
  { group: 'lines', expression: 'line.lineNet', description: 'Positionsbetrag in Cent' },

  // ── Steuergruppen ─────────────────────────────────────────────────────────
  { group: 'taxBreakdown', expression: 'group.rate', description: 'Steuersatz in Basispunkten' },
  { group: 'taxBreakdown', expression: 'group.category', description: 'Steuerkategorie' },
  { group: 'taxBreakdown', expression: 'group.categoryLabel', description: 'Steuerkategorie als Text' },
  { group: 'taxBreakdown', expression: 'group.net', description: 'Nettobetrag der Gruppe' },
  { group: 'taxBreakdown', expression: 'group.tax', description: 'Steuerbetrag der Gruppe' },

  // ── Summen ────────────────────────────────────────────────────────────────
  { group: 'totals', expression: 'totals.net', description: 'Nettosumme' },
  { group: 'totals', expression: 'totals.tax', description: 'Steuersumme' },
  { group: 'totals', expression: 'totals.gross', description: 'Bruttosumme' },
  { group: 'totals', expression: 'totals.paid', description: 'bereits gezahlt' },
  { group: 'totals', expression: 'totals.outstanding', description: 'offener Betrag' },

  // ── Hinweise ──────────────────────────────────────────────────────────────
  { group: 'notices', expression: 'notices', description: 'Pflichthinweise: §19, Reverse Charge, Ausfuhr, Storno' },
  { group: 'notices', expression: 'paymentNotices', description: 'Zahlungsziel' },
  { group: 'notices', expression: 'footerText', description: 'Fußtext aus den Firmendaten' },

  // ── Filter ────────────────────────────────────────────────────────────────
  { group: 'filters', expression: '| money', description: 'Cent → „1.234,56 €"; Währung als Argument' },
  { group: 'filters', expression: '| decimal', description: 'Cent → „1.234,56" ohne Währung' },
  { group: 'filters', expression: '| quantity', description: 'skalierte Menge → „1,5"' },
  { group: 'filters', expression: '| percent', description: 'Basispunkte → „19 %"' },
  { group: 'filters', expression: '| date', description: 'Kalendertag → „01.03.2026"' },
];

export function variablesOfGroup(group: TemplateVariableGroup): readonly TemplateVariable[] {
  return TEMPLATE_VARIABLES.filter((variable) => variable.group === group);
}
