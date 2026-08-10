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
  nav: {
    dashboard: 'Übersicht',
    customers: 'Kunden',
    catalog: 'Katalog',
    company: 'Firmendaten',
    security: 'Sicherheit',
    logout: 'Abmelden',
    label: 'Hauptnavigation',
  },
  common: {
    save: 'Speichern',
    cancel: 'Abbrechen',
    back: 'Zurück',
    saved: 'Die Änderungen wurden gespeichert.',
    optional: 'optional',
    required: 'Pflichtfeld',
    none: '—',
    search: 'Suchen',
    searchPlaceholder: 'Name, Nummer, Ort oder E-Mail',
    reset: 'Filter zurücksetzen',
    validationFailed: 'Bitte prüfen Sie die markierten Felder.',
    rejected: 'Die Anfrage wurde abgelehnt. Bitte laden Sie die Seite neu.',
    noScript:
      'Dieses Formular benötigt JavaScript. Bitte aktivieren Sie es für diese Seite — ohne JavaScript werden Eingaben nicht gespeichert.',
  },
  company: {
    title: 'Firmendaten',
    heading: 'Firmendaten',
    intro:
      'Diese Angaben erscheinen auf jeder Rechnung. Sie sind Pflichtbestandteil einer ordnungsgemäßen Rechnung.',

    sectionIdentity: 'Unternehmen',
    sectionIdentityHint: 'Name und Anschrift, wie sie auf der Rechnung stehen sollen.',
    legalName: 'Firmenname',
    addressLine1: 'Straße und Hausnummer',
    addressLine2: 'Adresszusatz',
    postalCode: 'Postleitzahl',
    city: 'Ort',
    countryCode: 'Land',
    email: 'E-Mail-Adresse',
    phone: 'Telefon',
    website: 'Webseite',

    sectionTax: 'Steuer',
    sectionTaxHint:
      'Mindestens eines der beiden Felder ist Pflicht — ohne Steuernummer oder USt-IdNr ist eine Rechnung nicht ordnungsgemäß.',
    taxNumber: 'Steuernummer',
    vatId: 'Umsatzsteuer-Identifikationsnummer',
    isSmallBusiness: 'Kleinunternehmer nach §19 UStG',
    isSmallBusinessHint:
      'Wenn gesetzt, weisen neue Rechnungen keine Umsatzsteuer aus und tragen den vorgeschriebenen Hinweis.',
    taxIdentifierRequired: 'Bitte Steuernummer oder USt-IdNr angeben.',

    sectionRegister: 'Handelsregister',
    registerCourt: 'Registergericht',
    registerNumber: 'Registernummer',
    managingDirector: 'Geschäftsführung',

    sectionBank: 'Bankverbindung',
    sectionBankHint: 'Erscheint als Zahlungsangabe auf der Rechnung.',
    bankAccountHolder: 'Kontoinhaber',
    iban: 'IBAN',
    bic: 'BIC',
    bankName: 'Kreditinstitut',
    ibanInvalid: 'Die IBAN ist nicht gültig — bitte prüfen.',
    ibanChecksumFailed: 'Die Prüfsumme der IBAN stimmt nicht. Vermutlich ein Zahlendreher.',
    ibanWrongLength: 'Für dieses Land hat die IBAN {expected} Stellen, angegeben sind {actual}.',
    ibanUnknownCountry: 'Das Länderkürzel {country} gehört zu keinem bekannten IBAN-Format.',
    bicInvalid: 'Der BIC muss acht oder elf Stellen haben.',

    sectionDefaults: 'Vorgaben für neue Rechnungen',
    defaultPaymentTerms: 'Zahlungsziel in Tagen',
    defaultTaxRate: 'Steuersatz in Prozent',
    defaultCurrency: 'Währung',
    footerText: 'Fußzeilentext',
    footerTextHint: 'Mehrzeilig. Erscheint am unteren Rand jeder Seite.',

    sectionLogo: 'Logo',
    sectionLogoHint: 'PNG, JPEG oder SVG, höchstens 2 MB.',
    logoUpload: 'Logodatei',
    logoUploadButton: 'Logo hochladen',
    logoRemove: 'Logo entfernen',
    logoNone: 'Es ist kein Logo hinterlegt.',
    logoAlt: 'Firmenlogo',
    logoTooLarge: 'Die Datei ist größer als 2 MB.',
    logoUnrecognized: 'Der Dateiinhalt ist kein PNG, JPEG oder SVG.',
    logoTypeMismatch: 'Dateiinhalt und angegebener Typ stimmen nicht überein.',
    logoActiveContent:
      'Die SVG-Datei enthält ausführbare Bestandteile und wurde deshalb abgelehnt.',
    logoEmpty: 'Bitte eine Datei auswählen.',
  },
  customers: {
    title: 'Kunden',
    heading: 'Kunden',
    intro: 'Angelegte Kunden mit Nummer, Anschrift und Zahlungsziel.',
    create: 'Kunde anlegen',
    createHeading: 'Neuer Kunde',
    editHeading: 'Kunde bearbeiten',
    empty: 'Es sind noch keine Kunden angelegt.',
    emptyFiltered: 'Zur Suche wurden keine Kunden gefunden.',
    showArchived: 'Archivierte anzeigen',
    hideArchived: 'Archivierte ausblenden',
    archivedBadge: 'Archiviert',

    number: 'Kundennummer',
    numberHint: 'Wird beim Anlegen automatisch vergeben.',
    companyName: 'Firma',
    contactName: 'Ansprechpartner',
    nameRequired: 'Bitte Firma oder Ansprechpartner angeben.',
    addressLine1: 'Straße und Hausnummer',
    addressLine2: 'Adresszusatz',
    postalCode: 'Postleitzahl',
    city: 'Ort',
    countryCode: 'Land',
    email: 'E-Mail-Adresse',
    phone: 'Telefon',
    vatId: 'Umsatzsteuer-Identifikationsnummer',
    vatIdHint:
      'Bei Kunden im EU-Ausland Voraussetzung für die Steuerschuldnerschaft des Leistungsempfängers.',
    vatIdInvalid: 'Die USt-IdNr entspricht nicht dem Format des gewählten Landes.',
    vatIdCountryMismatch:
      'Die USt-IdNr gehört zu {actual}, als Land ist aber {expected} ausgewählt.',
    vatIdUnsupportedCountry: 'Für {country} ist kein Format hinterlegt; die Nummer wird ungeprüft übernommen.',
    buyerReference: 'Leitweg-ID',
    buyerReferenceHint: 'Pflichtangabe bei Rechnungen an öffentliche Auftraggeber.',
    paymentTerms: 'Abweichendes Zahlungsziel in Tagen',
    paymentTermsHint: 'Leer lassen, um das Zahlungsziel aus den Firmendaten zu verwenden.',
    paymentTermsInvalid: 'Das Zahlungsziel muss zwischen 0 und 365 Tagen liegen.',
    notes: 'Notizen',

    archive: 'Archivieren',
    unarchive: 'Wieder aktivieren',
    archiveExplanation:
      'Kunden werden nicht gelöscht, sondern archiviert. Rechnungen unterliegen einer zehnjährigen Aufbewahrungspflicht — ein gelöschter Kunde würde die Nachvollziehbarkeit alter Belege zerstören. Archivierte Kunden erscheinen nicht mehr in der Auswahl für neue Rechnungen.',
    taxSchemeHeading: 'Steuerliche Behandlung',
    taxSchemeHint: 'Vorschlag für neue Rechnungen, je Rechnung überschreibbar.',
    invoicesHeading: 'Rechnungen',
    invoicesPending: 'Die Rechnungshistorie erscheint hier, sobald Rechnungen erfasst werden können.',
  },
  taxScheme: {
    STANDARD: 'Regelbesteuerung',
    SMALL_BUSINESS: 'Kleinunternehmer nach §19 UStG',
    REVERSE_CHARGE: 'Steuerschuldnerschaft des Leistungsempfängers',
    EXPORT: 'Ausfuhrlieferung ins Drittland',
  },
  catalog: {
    title: 'Leistungskatalog',
    heading: 'Leistungskatalog',
    intro:
      'Wiederkehrende Positionen mit Preis, Einheit und Steuersatz. Sie stehen später im Rechnungseditor zur Auswahl.',
    create: 'Position anlegen',
    createHeading: 'Neue Katalogposition',
    editHeading: 'Katalogposition bearbeiten',
    empty: 'Es sind noch keine Positionen angelegt.',
    name: 'Bezeichnung',
    description: 'Beschreibung',
    unitPrice: 'Einzelpreis',
    unitPriceHint: 'Netto, in Euro. Dezimaltrennzeichen ist das Komma.',
    unitPriceInvalid: 'Bitte einen gültigen Betrag angeben, zum Beispiel 95,00.',
    unitCode: 'Einheit',
    taxRate: 'Steuersatz in Prozent',
    taxRateInvalid: 'Der Steuersatz muss zwischen 0 und 100 liegen.',
    archive: 'Archivieren',
    unarchive: 'Wieder aktivieren',
    showArchived: 'Archivierte anzeigen',
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
