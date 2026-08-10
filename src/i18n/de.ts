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
  login: {
    title: 'Anmeldung',
    heading: 'Anmelden',
    intro: 'Bitte melden Sie sich an, um fortzufahren.',
    email: 'E-Mail-Adresse',
    password: 'Passwort',
    secondFactor: 'Bestätigungscode',
    secondFactorHint:
      'Sechsstelliger Code aus Ihrer Authenticator-App. Alternativ ein Wiederherstellungscode.',
    secondFactorOptional: 'Nur nötig, wenn die Zweifaktorauthentifizierung aktiv ist.',
    submit: 'Anmelden',
    invalidCredentials: 'E-Mail-Adresse, Passwort oder Bestätigungscode ist nicht korrekt.',
    locked:
      'Der Zugang ist wegen zu vieler Fehlversuche vorübergehend gesperrt. Bitte in {minutes} Minuten erneut versuchen.',
    missingFields: 'Bitte E-Mail-Adresse und Passwort angeben.',
    rejected: 'Die Anfrage wurde abgelehnt. Bitte laden Sie die Seite neu und versuchen es erneut.',
    noRegistrationHint:
      'Es gibt keine Selbstregistrierung. Das erste Konto wird auf dem Server angelegt.',
  },
  dashboard: {
    heading: 'Übersicht',
    signedInAs: 'Angemeldet als',
    securitySettings: 'Sicherheit',
    logout: 'Abmelden',
    placeholder:
      'Die fachlichen Funktionen entstehen in den folgenden Ausbaustufen: Stammdaten, Rechnungen, Vorlagen, Auswertung.',
  },
  security: {
    title: 'Sicherheit',
    heading: 'Sicherheit',
    back: 'Zur Übersicht',

    totpHeading: 'Zweifaktorauthentifizierung',
    totpEnabled: 'Aktiv',
    totpDisabled: 'Nicht aktiv',
    totpIntro:
      'Mit einer Authenticator-App auf dem Telefon reicht ein gestohlenes Passwort allein nicht mehr aus.',
    totpStart: 'Einrichten',
    totpScan:
      'Scannen Sie den Code mit Ihrer Authenticator-App und geben Sie anschließend das angezeigte Einmalkennwort ein.',
    totpManualEntry: 'Falls das Scannen nicht möglich ist, geben Sie diesen Schlüssel manuell ein:',
    totpCode: 'Einmalkennwort',
    totpConfirm: 'Aktivieren',
    totpCancel: 'Abbrechen',
    totpDisable: 'Deaktivieren',
    totpInvalidCode: 'Das Einmalkennwort ist nicht korrekt. Bitte erneut versuchen.',
    totpAlreadyEnabled: 'Die Zweifaktorauthentifizierung ist bereits aktiv.',

    recoveryHeading: 'Wiederherstellungscodes',
    recoveryIntro:
      'Bewahren Sie diese Codes an einem sicheren Ort auf. Jeder Code funktioniert genau einmal und ersetzt das Einmalkennwort, falls Sie keinen Zugriff auf Ihr Telefon haben.',
    recoveryOnceOnly: 'Diese Codes werden nur jetzt angezeigt und danach nie wieder.',
    recoveryRegenerate: 'Neue Codes erzeugen',
    recoveryRemaining: 'Noch nicht verwendete Codes: {count}',

    sessionsHeading: 'Aktive Sitzungen',
    sessionsIntro: 'Geräte, auf denen Sie derzeit angemeldet sind.',
    sessionCurrent: 'Diese Sitzung',
    sessionUnknownDevice: 'Unbekanntes Gerät',
    sessionLastSeen: 'Zuletzt aktiv',
    sessionCreated: 'Angemeldet seit',
    sessionRevoke: 'Beenden',
    sessionRevokeAll: 'Alle anderen Sitzungen beenden',
  },
  quantity: {
    empty: 'Bitte eine Menge angeben.',
    malformed: 'Die Menge ist keine gültige Zahl.',
    tooManyDecimals: 'Es sind höchstens {max} Nachkommastellen zulässig.',
    outOfRange: 'Die Menge ist zu groß.',
  },
} as const;

export type Messages = typeof messages;
