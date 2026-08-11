/**
 * Sämtliche Texte der Oberfläche (NFA-QUAL-07). Code und Bezeichner sind
 * englisch, die Oberfläche ist deutsch — deutsche Zeichenketten stehen
 * ausschließlich hier, nicht in Komponenten.
 *
 * Die Tabellen für normierte Codes liegen in der Domain (Spec §9.2) und werden
 * hier weitergereicht; sie sind als vollständige Abbildung über den jeweiligen
 * Code-Typ deklariert. Ein neuer Code ohne deutsche Bezeichnung führt damit zu
 * einem Übersetzungsfehler, nicht zu einer Lücke im UI.
 */
import type { DocumentType } from '@/domain/document/document-type';

/**
 * Die Code-Tabellen liegen in der Domain (Spec §9.2) und werden hier
 * unverändert weitergereicht — so bleibt `src/i18n/de.ts` der eine Bezugspunkt
 * für Texte der Oberfläche, und der Renderer kommt ohne Umweg an dieselben
 * Bezeichnungen.
 */
export {
  currencyLabelsDe as currencyLabels,
  taxCategoryLabelsDe as taxCategoryLabels,
  unitLabelsDe as unitLabels,
} from '@/domain/codes/labels-de';

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
    invoices: 'Rechnungen',
    company: 'Firmendaten',
    numbering: 'Nummernkreis',
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
    invoicesEmpty: 'Für diesen Kunden wurde noch kein Beleg erstellt.',
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
  invoices: {
    title: 'Rechnungen',
    heading: 'Rechnungen',
    intro: 'Alle Belege mit Status, Betrag und Fälligkeit.',
    create: 'Rechnung anlegen',
    createHeading: 'Neue Rechnung',
    editHeading: 'Rechnung bearbeiten',
    viewHeading: 'Rechnung',
    empty: 'Es sind noch keine Belege vorhanden.',
    emptyFiltered: 'Zu den gewählten Filtern wurden keine Belege gefunden.',

    number: 'Nummer',
    noNumber: 'ohne Nummer',
    customer: 'Kunde',
    issueDate: 'Rechnungsdatum',
    serviceDateFrom: 'Leistungsdatum von',
    serviceDateTo: 'Leistungsdatum bis',
    serviceDateHint: 'Pflichtangabe. Für einen einzelnen Tag nur das erste Feld ausfüllen.',
    dueDate: 'Fällig am',
    dueDateHint: 'Wird aus Rechnungsdatum und Zahlungsziel vorbelegt.',
    net: 'Netto',
    tax: 'Steuer',
    gross: 'Brutto',
    paid: 'Bezahlt',
    outstanding: 'Offen',
    currency: 'Währung',
    taxScheme: 'Steuerliche Behandlung',
    taxSchemeHint:
      'Aus Kunden- und Firmendaten vorgeschlagen. Eine Änderung setzt Kategorie und Satz aller Positionen neu.',
    purchaseOrderRef: 'Bestellnummer',
    introText: 'Einleitungstext',
    outroText: 'Schlusstext',

    linesHeading: 'Positionen',
    linePosition: 'Pos.',
    lineName: 'Bezeichnung',
    lineDescription: 'Beschreibung',
    lineQuantity: 'Menge',
    lineUnit: 'Einheit',
    lineUnitPrice: 'Einzelpreis',
    lineDiscount: 'Rabatt %',
    lineTaxRate: 'Steuer %',
    lineTaxCategory: 'Kategorie',
    lineNet: 'Betrag',
    lineAdd: 'Position hinzufügen',
    lineDuplicate: 'Duplizieren',
    lineRemove: 'Entfernen',
    lineMoveUp: 'Nach oben',
    lineMoveDown: 'Nach unten',
    lineDragHandle: 'Zum Sortieren ziehen',
    lineFromCatalog: 'Aus Katalog übernehmen',
    lineCatalogPlaceholder: 'Katalogposition wählen …',
    linesEmpty: 'Noch keine Positionen. Mindestens eine ist zum Festschreiben nötig.',

    statusDRAFT: 'Entwurf',
    statusISSUED: 'Offen',
    statusPARTIALLY_PAID: 'Teilbezahlt',
    statusPAID: 'Bezahlt',
    statusCANCELLED: 'Storniert',
    overdue: 'Überfällig',
    creditNote: 'Stornorechnung',

    filterStatus: 'Status',
    filterAll: 'Alle',
    filterOverdue: 'Überfällig',
    filterCustomer: 'Kunde',
    filterFrom: 'Von',
    filterTo: 'Bis',
    filterApply: 'Filtern',
    sortBy: 'Sortieren nach',
    sortIssueDate: 'Datum',
    sortNumber: 'Nummer',
    sortGross: 'Betrag',
    sortDueDate: 'Fälligkeit',

    saveDraft: 'Als Entwurf speichern',
    issue: 'Festschreiben',
    issueConfirmTitle: 'Rechnung festschreiben?',
    issueConfirm:
      'Beim Festschreiben erhält die Rechnung ihre endgültige Nummer. Danach sind Positionen, Beträge, Daten und Kundenbezug nicht mehr änderbar — eine fehlerhafte Rechnung kann nur noch storniert werden. Das ist gesetzlich so vorgeschrieben.',
    duplicate: 'Duplizieren',
    deleteDraft: 'Entwurf löschen',
    deleteConfirm:
      'Der Entwurf wird endgültig entfernt. Da er noch keine Nummer trägt, entsteht dadurch keine Lücke im Nummernkreis.',
    cancelInvoice: 'Stornieren',
    cancelConfirmTitle: 'Rechnung stornieren?',
    cancelConfirm:
      'Es entsteht eine Stornorechnung mit eigener Nummer und Bezug auf diese Rechnung. Die Originalrechnung bleibt vollständig erhalten und wechselt auf „Storniert". Rückgängig machen lässt sich das nicht.',
    cancelReason: 'Grund des Storno',
    cancelReasonHint: 'Erscheint als Einleitungstext auf der Stornorechnung.',

    paymentsHeading: 'Zahlungen',
    paymentsEmpty: 'Es wurde noch keine Zahlung erfasst.',
    paymentAmount: 'Betrag',
    paymentDate: 'Datum',
    paymentMethod: 'Zahlungsart',
    paymentNote: 'Notiz',
    paymentAdd: 'Zahlung erfassen',
    paymentRemove: 'Zahlung zurücknehmen',
    paymentRemoveConfirm: 'Die Zahlung wird entfernt und der Status neu abgeleitet.',
    markPaid: 'Als vollständig bezahlt markieren',
    markPaidHint: 'Erfasst eine Zahlung über den offenen Restbetrag.',
    nothingOutstanding: 'Es ist nichts mehr offen.',

    cancelledBy: 'Storniert durch',
    cancels: 'Storniert die Rechnung',
    sellerHeading: 'Aussteller zum Zeitpunkt der Ausstellung',
    buyerHeading: 'Empfänger zum Zeitpunkt der Ausstellung',
    frozenHint:
      'Dieser Beleg ist festgeschrieben. Die Angaben zeigen den Stand vom Tag der Ausstellung und ändern sich nicht mehr mit den Stammdaten.',

    unsavedChanges: 'Es gibt ungespeicherte Änderungen. Seite wirklich verlassen?',
    noCompanyProfile: 'Bitte zuerst die Firmendaten erfassen — ohne sie ist kein Beleg möglich.',
    noCustomers: 'Bitte zuerst einen Kunden anlegen.',
    notFound: 'Der Beleg wurde nicht gefunden.',

    violationNO_CUSTOMER: 'Es ist kein Kunde ausgewählt.',
    violationNO_LINES: 'Der Beleg enthält keine Position.',
    violationLINE_WITHOUT_NAME: 'Position {position} hat keine Bezeichnung.',
    violationNO_ISSUE_DATE: 'Das Rechnungsdatum fehlt.',
    violationNO_SERVICE_DATE: 'Das Leistungsdatum fehlt.',
    violationNO_DUE_DATE: 'Das Fälligkeitsdatum fehlt.',
    violationDUE_BEFORE_ISSUE: 'Die Fälligkeit liegt vor dem Rechnungsdatum.',
    violationSERVICE_PERIOD_REVERSED: 'Der Leistungszeitraum endet vor seinem Beginn.',
    violationNO_TAX_IDENTIFIER: 'In den Firmendaten fehlt Steuernummer und USt-IdNr.',
    violationMISSING_VAT_IDS_FOR_REVERSE_CHARGE:
      'Bei Steuerschuldnerschaft des Leistungsempfängers müssen beide USt-IdNr hinterlegt sein.',
    violationTAX_RATE_CONTRADICTS_CATEGORY:
      'Position {position}: Die Steuerkategorie lässt keinen Steuersatz größer null zu.',

    errorNOT_A_DRAFT: 'Der Beleg ist bereits festgeschrieben.',
    errorBACKDATED:
      'Das Rechnungsdatum liegt vor dem der zuletzt festgeschriebenen Rechnung ({lastIssuedDate}). Die Nummernfolge muss der Datumsfolge entsprechen.',
    errorNOT_FOUND: 'Der Beleg wurde nicht gefunden.',
    errorNO_COMPANY_PROFILE: 'Bitte zuerst die Firmendaten erfassen.',
  },
  numbering: {
    title: 'Nummernkreis',
    heading: 'Nummernkreis',
    intro:
      'Format und Stand der Belegnummern. Eine einmal vergebene Nummer wird nie wieder frei — eine fehlerhafte Rechnung wird storniert, nicht gelöscht.',

    formatHeading: 'Format',
    format: 'Nummernformat',
    formatHint:
      'Platzhalter: {YYYY} vierstelliges Jahr · {YY} zweistellig · {MM} Monat · {SEQ:n} Zähler mit n Stellen.',
    formatPreview: 'Beispiel für heute',
    formatInvalid: 'Das Format ist nicht gültig.',
    formatMissingSequence: 'Das Format muss genau einen Zähler {SEQ:n} enthalten.',
    formatMultipleSequences: 'Das Format darf nur einen Zähler enthalten.',
    formatUnknownPlaceholder: 'Unbekannter Platzhalter: {placeholder}.',
    formatInvalidWidth: 'Die Zählerbreite muss zwischen {min} und {max} liegen.',
    formatChangeWarning:
      'Eine Änderung wirkt nur auf künftige Belege. Bereits vergebene Nummern bleiben unverändert.',

    statesHeading: 'Zählerstände',
    statesIntro: 'Je Bereich der zuletzt vergebene Wert.',
    statesEmpty: 'Es wurde noch keine Belegnummer vergeben.',
    scope: 'Bereich',
    lastValue: 'Zuletzt vergeben',
    nextValue: 'Nächste Nummer',

    startValueHeading: 'Startwert setzen',
    startValueIntro:
      'Um eine Nummernfolge aus einem Altsystem lückenlos fortzuführen. Nur möglich, solange in diesem Bereich noch keine Nummer vergeben wurde — ein nachträglich verstellter Zähler erzeugte Lücken oder Dubletten.',
    startValueScope: 'Bereich',
    startValueScopeHint: 'Zum Beispiel INVOICE-2026 für den Jahreszähler 2026.',
    startValue: 'Zuletzt vergebene Nummer im Altsystem',
    startValueSubmit: 'Startwert setzen',
    startValueSet: 'Der Startwert wurde gesetzt.',
    startValueInUse:
      'In diesem Bereich wurde bereits bis {lastValue} nummeriert. Der Startwert lässt sich nicht mehr ändern.',
    startValueInvalid: 'Bitte eine Zahl ab 0 angeben.',
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
