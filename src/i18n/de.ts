/**
 * Sämtliche Texte der Oberfläche (NFA-QUAL-07). Code und Bezeichner sind
 * englisch, die Oberfläche ist deutsch — deutsche Zeichenketten stehen
 * ausschließlich hier, nicht in Komponenten.
 *
 * Die Label-Tabellen sind als vollständige Abbildung über den jeweiligen
 * Code-Typ deklariert. Ein neuer Einheiten- oder Steuerkategorie-Code ohne
 * deutsches Label führt damit zu einem Übersetzungsfehler, nicht zu einer
 * Lücke im UI.
 */
import type { CurrencyCode } from '@/domain/codes/currency-code';
import type { TaxCategoryCode } from '@/domain/codes/tax-category';
import type { UnitCode } from '@/domain/codes/unit-code';
import type { DocumentType } from '@/domain/document/document-type';

export const unitLabels: Readonly<Record<UnitCode, string>> = {
  C62: 'Stück',
  HUR: 'Stunde',
  DAY: 'Tag',
  MON: 'Monat',
  KGM: 'Kilogramm',
  MTR: 'Meter',
  MTK: 'Quadratmeter',
  LTR: 'Liter',
  E48: 'Leistungseinheit',
};

export const taxCategoryLabels: Readonly<Record<TaxCategoryCode, string>> = {
  S: 'Regelsatz',
  AE: 'Steuerschuldnerschaft des Leistungsempfängers',
  E: 'Steuerbefreit',
  G: 'Ausfuhrlieferung',
  K: 'Innergemeinschaftliche Lieferung',
  Z: 'Nullsatz',
};

export const currencyLabels: Readonly<Record<CurrencyCode, string>> = {
  EUR: 'Euro',
  CHF: 'Schweizer Franken',
  GBP: 'Britisches Pfund',
  USD: 'US-Dollar',
  DKK: 'Dänische Krone',
  SEK: 'Schwedische Krone',
  NOK: 'Norwegische Krone',
  PLN: 'Polnischer Złoty',
  CZK: 'Tschechische Krone',
};

export const documentTypeLabels: Readonly<Record<DocumentType, string>> = {
  INVOICE: 'Rechnung',
  CREDIT_NOTE: 'Stornorechnung',
};

export const messages = {
  app: {
    name: 'Faktura',
    description: 'Rechnungsstellung für das eigene Einzelunternehmen',
  },
  status: {
    heading: 'Systemzustand',
    intro:
      'Diese Übersicht zeigt, ob die Anwendung betriebsbereit ist. Fachliche Funktionen folgen mit den nächsten Ausbaustufen.',
    healthy: 'Betriebsbereit',
    unhealthy: 'Nicht betriebsbereit',
    checkedAt: 'Geprüft am',
    componentDatabase: 'Datenbank',
    componentDatabaseDescription: 'Verbindung und Lesezugriff',
    stateUp: 'Erreichbar',
    stateDown: 'Nicht erreichbar',
  },
  errors: {
    unexpected: 'Es ist ein unerwarteter Fehler aufgetreten.',
    configuration:
      'Die Anwendung ist nicht vollständig konfiguriert. Bitte die Umgebungsvariablen prüfen.',
  },
  quantity: {
    empty: 'Bitte eine Menge angeben.',
    malformed: 'Die Menge ist keine gültige Zahl.',
    tooManyDecimals: 'Es sind höchstens {max} Nachkommastellen zulässig.',
    outOfRange: 'Die Menge ist zu groß.',
  },
} as const;

export type Messages = typeof messages;
