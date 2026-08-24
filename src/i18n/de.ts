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
  admin: {
    title: 'Verwaltung',
    heading: 'Verwaltung',
    loginTitle: 'Verwaltung — Anmeldung',
    loginIntro: 'Zugang zur zentralen Verwaltung. Konten der Unternehmen melden sich unter der gewohnten Adresse an.',
    codeTitle: 'Bestätigungscode',
    codeIntro:
      'Betreiberkonten führen den zweiten Faktor verpflichtend. Der sechsstellige Code steht in der Authenticator-App.',
    organizationsHeading: 'Unternehmen',
    organizationCount: '{count} Unternehmen',
    organizationCountOne: '1 Unternehmen',
    organizationsEmpty:
      'Noch kein Unternehmen angelegt. Das erste Unternehmen entsteht samt Einladung für sein Inhaberkonto.',
    scopeNote:
      'Die Verwaltung sieht Unternehmen und Konten — keine Rechnung, keinen Kunden, keinen Betrag. Das ist keine Einstellung, sondern eine Eigenschaft des Aufbaus: Eine Adminsitzung führt keinen Mandantenkontext, und jede Abfrage von Geschäftsdaten verlangt einen.',
    logout: 'Abmelden',

    // ── Einrichtung des Betreiberkontos ──────────────────────────────────
    setupTitle: 'Betreiberkonto einrichten',
    setupHeading: 'Betreiberkonto einrichten',
    setupIntro:
      'Für {email}. Passwort und zweiter Faktor entstehen hier — das Konto gibt es erst danach.',
    /** Derselbe Weg, anderer Anlass: Das Konto gibt es schon (M8). */
    resetHeading: 'Betreiberkonto zurücksetzen',
    resetIntro:
      'Für {email}. Das Konto bleibt bestehen und bekommt hier ein neues Passwort und einen neuen zweiten Faktor; der bisherige gilt danach nicht mehr.',
    setupName: 'Name',
    setupNameHint: 'Erscheint im Kopf der Verwaltung.',
    setupPassword: 'Passwort',
    setupPasswordRepeat: 'Passwort wiederholen',
    setupScan:
      'Code mit der Authenticator-App scannen, dann das angezeigte Einmalkennwort eintragen. Der zweite Faktor ist für Betreiberkonten verpflichtend.',
    setupManualEntry: 'Ohne Kamera lässt sich dieser Schlüssel von Hand eintragen:',
    setupNoRecoveryCodes:
      'Für die Verwaltung gibt es keine Wiederherstellungscodes. Geht der Authenticator verloren, richtet ein neuer Einrichtungslink ein neues Konto ein.',
    setupCode: 'Einmalkennwort',
    setupSubmit: 'Konto einrichten',
    setupDone: 'Das Betreiberkonto ist eingerichtet. Jetzt anmelden.',
    setupInvalidCode: 'Das Einmalkennwort ist nicht korrekt. Bitte erneut versuchen.',
    setupEmailTaken: 'Zu dieser Adresse gehört bereits ein Betreiberkonto.',
    /** Eine Meldung für unbekannt, abgelaufen, zurückgezogen und schon benutzt. */
    setupInvalid:
      'Dieser Einrichtungslink gilt nicht. Er kann abgelaufen sein, schon benutzt oder durch einen neueren ersetzt. Ein neuer entsteht auf dem Server mit „admin:create".',

    // ── Unternehmensverwaltung (B5) ──────────────────────────────────────
    columnOrganization: 'Unternehmen',
    columnAccounts: 'Konten',
    columnInvoices: 'Belege',
    columnCustomers: 'Kunden',
    columnLastLogin: 'Letzte Anmeldung',
    columnState: 'Zustand',
    stateActive: 'Aktiv',
    stateSuspended: 'Stillgelegt',
    neverSignedIn: 'noch nie',
    createdOn: 'Angelegt am {date}',
    open: 'Öffnen',

    newOrganization: 'Unternehmen anlegen',
    newOrganizationHeading: 'Neues Unternehmen',
    newOrganizationIntro:
      'Es entstehen Unternehmen, Rolle „Inhaber" mit allen Berechtigungen und eine Einladung — in einem Vorgang. Ein Passwort wird hier nicht vergeben: Das setzt der Inhaber selbst.',
    organizationName: 'Name des Unternehmens',
    organizationNameHint:
      'Der Name für die Verwaltung. Die Firmendaten für den Beleg erfasst das Unternehmen selbst.',
    ownerEmail: 'E-Mail-Adresse des Inhabers',
    createSubmit: 'Unternehmen anlegen',
    createdHeading: 'Einladung für das Inhaberkonto',
    createdOnceOnly:
      'Dieser Link wird nur jetzt angezeigt. Er gilt sieben Tage und funktioniert einmal. Ohne ihn kommt niemand in das neue Unternehmen.',
    nameMissing: 'Bitte einen Namen angeben.',
    emailInvalid: 'Bitte eine gültige E-Mail-Adresse angeben.',
    emailTaken: 'Zu dieser Adresse gehört bereits ein Konto.',

    detailHeading: 'Unternehmen',
    back: 'Zur Verwaltung',
    metricsHeading: 'Kennzahlen',
    metricsNote:
      'Zahlen, keine Zeilen: Die Verwaltung sieht, ob und wie viel ein Unternehmen arbeitet — nicht woran.',
    accountsHeading: 'Konten',
    accountsEmpty: 'Es gibt noch kein Konto — die Einladung ist offen.',
    accountNameMissing: 'ohne Namen',
    accountRoleMissing: 'ohne Rolle',
    suspend: 'Stilllegen',
    resume: 'Freigeben',
    suspendConfirmTitle: 'Unternehmen stilllegen?',
    suspendConfirm:
      'Alle Konten dieses Unternehmens verlieren sofort ihre Sitzungen und können sich nicht mehr anmelden. Es gehen keine Daten verloren; die Freigabe stellt den vorigen Zustand wieder her.',
    suspended: 'Das Unternehmen ist stillgelegt.',
    resumed: 'Das Unternehmen ist freigegeben.',
    disableAccount: 'Sperren',
    enableAccount: 'Entsperren',
    disableConfirmTitle: 'Konto sperren?',
    disableConfirm:
      'Das Konto verliert sofort seine Sitzungen. Dieser Weg ist für den Fall gedacht, dass die Rechteverwaltung des Unternehmens ausfällt.',
    accountDisabled: 'Das Konto ist gesperrt.',
    accountEnabled: 'Das Konto ist entsperrt.',
    errorNOT_FOUND: 'Nicht gefunden.',
    errorNO_OWNER_ROLE:
      'Dieses Unternehmen führt keine Rolle mit Rechteverwaltung. Ohne sie lässt sich keine Einladung ausstellen.',

    // ── Wege aus einer Sackgasse (M9) ────────────────────────────────────
    openInvitationsHeading: 'Offene Einladungen',
    openInvitationsEmpty: 'Es ist keine Einladung offen.',
    openInvitationExpires: 'Gilt bis {date}',
    withdraw: 'Zurückziehen',
    withdrawn: 'Die Einladung wurde zurückgezogen.',
    reissueHeading: 'Einladung erneut ausstellen',
    reissueIntro:
      'Wenn der Einladungslink verloren ging. Der bisherige Link wird dabei entwertet; die Rolle bleibt die des Unternehmens.',
    reissueSubmit: 'Einladung ausstellen',
    reissuedHeading: 'Neuer Einladungslink',
    tenantResetHeading: 'Link zur Passwortzurücksetzung',
    tenantResetSectionHeading: 'Passwort eines Kontos zurücksetzen',
    tenantResetIntro:
      'Für den Fall, dass ein Unternehmen sich ausgesperrt hat — etwa wenn das einzige Konto mit Rechteverwaltung sein Passwort vergessen hat. Alle Sitzungen des Kontos enden dabei, und der Vorgang steht im Protokoll des Unternehmens.',
    tenantResetSubmit: 'Zurücksetzungslink ausstellen',
    tenantResetAccount: 'Konto',
    linkOnceOnly:
      'Dieser Link wird nur jetzt angezeigt. Er gilt bis zum genannten Zeitpunkt und funktioniert genau einmal.',
    errorLAST_ADMINISTRATOR:
      'Die Datenbank hat die Änderung abgewiesen: Es wäre das letzte aktive Konto mit Rechteverwaltung dieses Unternehmens.',

    // ── Navigation des Adminbereichs (M10, B1) ──────────────────────────────
    scopeIntro: 'Unternehmen, Zugänge und Betrieb dieser Installation.',
    navLabel: 'Verwaltung',
    navOrganizations: 'Unternehmen',
    navAccounts: 'Betreiber',
    navAudit: 'Protokoll',
    navOperations: 'Betrieb',

    // ── Betreiberkonten (M10, B1, FA-ADM-12, -13) ───────────────────────────
    accountsTitle: 'Betreiberkonten',
    accountsPageHeading: 'Betreiberkonten',
    accountsPageIntro:
      'Konten mit Zugang zu dieser Verwaltung. Sie sehen keine Geschäftsdaten der Unternehmen und führen den zweiten Faktor verpflichtend.',
    accountsColumnAccount: 'Konto',
    accountsColumnSecondFactor: 'Zweiter Faktor',
    accountsColumnLastLogin: 'Letzte Anmeldung',
    accountsColumnState: 'Zustand',
    accountsSecondFactorOn: 'eingerichtet',
    accountsSecondFactorOff: 'fehlt',
    accountsStateActive: 'Aktiv',
    accountsStateDisabled: 'Gesperrt',
    accountsSelf: 'Das ist dein Konto',
    accountsDisable: 'Sperren',
    accountsEnable: 'Entsperren',
    accountsReset: 'Zugang neu einrichten',
    accountsDisableConfirmTitle: 'Betreiberkonto sperren',
    accountsDisableConfirm:
      'Das Konto kommt nicht mehr in die Verwaltung, und alle seine Sitzungen enden sofort. Entsperren ist jederzeit möglich.',
    accountsResetConfirmTitle: 'Zugang neu einrichten',
    accountsResetConfirm:
      'Das Konto wird sofort gesperrt und alle Sitzungen enden. Es bekommt neue Zugangsdaten erst, wenn der ausgestellte Link eingelöst wird — Passwort und zweiter Faktor entstehen dabei im Browser des Betroffenen.',
    accountsInviteHeading: 'Weiteren Betreiber einladen',
    accountsInviteIntro:
      'Der Link erscheint genau einmal und wird außerhalb der Anwendung weitergegeben. Passwort und zweiter Faktor entstehen beim Einlösen; ein Betreiberkonto ohne zweiten Faktor gibt es zu keinem Zeitpunkt.',
    accountsInviteSubmit: 'Einladung ausstellen',
    accountsInvitedHeading: 'Einladungslink',
    accountsResetLinkHeading: 'Link zur Neueinrichtung',
    accountsErrorSELF:
      'Das eigene Konto lässt sich hier nicht ändern. Ein anderer Betreiber kann es sperren oder zurücksetzen.',
    accountsErrorLAST_ADMINISTRATOR:
      'Die Datenbank hat die Änderung abgewiesen: Es wäre das letzte aktive Betreiberkonto. Ohne eines käme niemand mehr in die Verwaltung.',
    accountsErrorNOT_FOUND: 'Dieses Konto gibt es nicht mehr.',

    // ── Protokoll der Verwaltung (M10, B2, FA-ADM-14) ───────────────────────
    auditTitle: 'Protokoll',
    auditHeading: 'Protokoll der Verwaltung',
    auditIntro:
      'Handlungen von Betreibern, neueste zuerst. Geschäftsvorfälle der Unternehmen stehen hier nicht — sie werden im Protokoll des jeweiligen Unternehmens geführt, das die Verwaltung nicht liest.',
    auditEmpty: 'Es ist noch nichts geschehen.',
    auditColumnWhen: 'Zeitpunkt',
    auditColumnActor: 'Betreiber',
    auditColumnOrganization: 'Unternehmen',
    auditColumnAction: 'Handlung',
    auditColumnSubject: 'Gegenstand',
    auditNoOrganization: '—',
    auditUnknownActor: 'Konto entfernt',
    // ── Betrieb (M10, B5, FA-ADM-17) ────────────────────────────────────────
    operationsTitle: 'Betrieb',
    operationsHeading: 'Betrieb',
    operationsIntro:
      'Zustand dieser Anlage und die Sicherung ihres gesamten Bestands.',
    operationsStateHeading: 'Zustand',
    operationsComponentDatabase: 'Datenbank',
    operationsComponentRenderer: 'PDF-Renderer',
    operationsStateUp: 'erreichbar',
    operationsStateDown: 'nicht erreichbar',
    operationsCheckedAt: 'Geprüft am {date}',
    operationsRendererNote:
      'Der Renderer wird durch einen echten Browserstart geprüft, nicht durch das Vorhandensein einer Datei: Ein Chromium, das wegen zu enger Rechte nicht hochkommt, liegt trotzdem an seinem Pfad.',
    operationsBackupHeading: 'Sicherung',
    operationsBackupIntro:
      'Datenbankabzug und Dateispeicher als .tar.gz — der Bestand aller Unternehmen. Beides gehört zusammen: Ein festgeschriebener Beleg verweist auf seine PDF-Datei samt Prüfsumme, und eine Sicherung ohne sie ist keine.',
    operationsBackupSubmit: 'Sicherung herunterladen',
    operationsBackupNote:
      'Die Anwendung plant nichts von selbst — ein eingebauter Zeitgeber liefe im Container mit, ohne dass jemand ihn sieht. Für den regelmäßigen Lauf gibt es den Betriebsauftrag „npm run backup". Die Wiederherstellung läuft von Hand: Sie überschreibt den gesamten Bestand, und dafür soll niemand versehentlich einen Knopf finden.',

    auditRetentionNote:
      'Einträge lassen sich nicht ändern und nicht löschen; Datenbank-Trigger weisen beides ab. Angezeigt werden die jüngsten 200 Vorgänge — vollständig steht das Protokoll in der Sicherung.',
    // ── Anonymisieren (M10, B3, FA-ADM-15) ──────────────────────────────────
    anonymize: 'Konto unkenntlich machen',
    anonymizeConfirmTitle: 'Konto unkenntlich machen',
    anonymizeConfirm:
      'Adresse, Name und alle Zugangsdaten dieses Kontos werden entfernt. Belege und Protokolleinträge bleiben vollständig erhalten und nennen weiterhin diese Kennung — nur führt sie zu niemandem mehr. Der Vorgang lässt sich nicht rückgängig machen.',
    anonymized: 'Unkenntlich gemacht',
    anonymizeDone: 'Das Konto wurde unkenntlich gemacht.',
    errorANONYMIZE_LAST_ADMINISTRATOR:
      'Die Datenbank hat den Vorgang abgewiesen: Es wäre das letzte aktive Konto mit Rechteverwaltung dieses Unternehmens. Erst ein anderes Konto mit dieser Berechtigung anlegen.',

    // ── Unternehmen bearbeiten (M10, B4, FA-ADM-16) ─────────────────────────
    editHeading: 'Unternehmen bearbeiten',
    editIntro:
      'Der Name erscheint in der Einladung und in der Oberfläche des Unternehmens. Die Notiz sieht ausschließlich die Verwaltung — sie steht in keinem Export und in keiner Ansicht des Mandanten.',
    editName: 'Name',
    editNote: 'Interne Notiz',
    editNoteHint: 'Ansprechpartner, Vereinbarungen, Hinweise zum Betrieb.',
    editSubmit: 'Änderungen speichern',
    editDone: 'Die Änderungen wurden gespeichert.',

    auditAction: {
      ORGANIZATION_CREATED: 'Unternehmen angelegt',
      SUSPENDED: 'stillgelegt',
      RESUMED: 'freigegeben',
      DISABLED: 'Konto gesperrt',
      ENABLED: 'Konto entsperrt',
      INVITED: 'Einladung ausgestellt',
      INVITATION_REVOKED: 'Einladung zurückgezogen',
      PASSWORD_RESET_REQUESTED: 'Zurücksetzung ausgestellt',
      ADMIN_INVITED: 'Betreiber eingeladen',
      ADMIN_DISABLED: 'Betreiberkonto gesperrt',
      ADMIN_ENABLED: 'Betreiberkonto entsperrt',
      ADMIN_RESET: 'Betreiberzugang neu eingerichtet',
      ANONYMIZED: 'Konto unkenntlich gemacht',
      UPDATED: 'Unternehmen bearbeitet',
    } as Record<string, string>,
  },

  backup: {
    title: 'Datenexport',
    heading: 'Datenexport',
    intro:
      'Alle Daten dieses Unternehmens in maschinenlesbarer Form. Die Sicherung der gesamten Installation ist davon getrennt — sie umfasst alle Unternehmen und liegt beim Betreiber.',
    scheduleHeading: 'Sicherung der Installation',
    scheduleHint:
      'Datenbank und Dateispeicher werden vom Betreiber gesichert, nicht aus dieser Oberfläche: Eine Sicherung umfasst alle Unternehmen. Der Betriebsauftrag „npm run backup" und die Verwaltung sind die dafür vorgesehenen Wege.',
    restoreHeading: 'Wiederherstellung',
    restoreIntro:
      'Die Wiederherstellung führt der Betreiber von Hand aus: Sie überschreibt den Bestand **aller** Unternehmen, und dafür soll niemand versehentlich einen Knopf finden. Die Schritte stehen hier zur Kenntnis.',
    restoreSteps: [
      'Dienst anhalten: docker compose down',
      'Archiv entpacken: tar -xzf faktura-….tar.gz -C /tmp/restore',
      'Datenbank zurückspielen: cp /tmp/restore/faktura.db ./data/faktura.db',
      'Dateien zurückspielen: rm -rf ./storage && cp -r /tmp/restore/storage ./storage',
      'Dienst starten: docker compose up -d',
      'Prüfen: Anmeldung, eine festgeschriebene Rechnung öffnen, ihr PDF laden',
    ],
    exportHeading: 'Datenexport',
    exportHint:
      'Alle Kunden, Belege, Vorlagen, Nummernkreise und das Protokoll als JSON — lesbar und maschinenlesbar zugleich. Zugangsdaten sind nicht enthalten: Ein Export wird weitergereicht, und Passwörter oder Sitzungen gehören dort nicht hinein. Wer den ganzen Bestand braucht, nimmt die Sicherung.',
    exportDownload: 'Daten exportieren',

    restoreNote:
      'Die Migrationen laufen beim Start automatisch. Eine Sicherung aus einer älteren Fassung wird dabei mitgezogen; der umgekehrte Weg ist nicht vorgesehen.',
  },

  status: {
    heading: 'Systemzustand',
    intro:
      'Zwei Bestandteile können unabhängig voneinander ausfallen: die Datenbank und der PDF-Renderer. Derselbe Zustand steht unter /api/health für Container und Reverse Proxy bereit.',
    healthy: 'Betriebsbereit',
    unhealthy: 'Nicht betriebsbereit',
    checkedAt: 'Geprüft am',
    componentDatabase: 'Datenbank',
    componentDatabaseDescription: 'Verbindung und Lesezugriff',
    componentRenderer: 'PDF-Renderer',
    componentRendererDescription: 'Chromium startet und ist verbunden',
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
    intro: 'Anmeldung mit E-Mail-Adresse und Passwort.',
    email: 'E-Mail-Adresse',
    password: 'Passwort',
    submit: 'Weiter',

    // Zweiter Schritt — erscheint nur bei Konten mit zweitem Faktor (M6.2).
    codeTitle: 'Bestätigungscode',
    codeIntro:
      'Dieses Konto ist mit einem zweiten Faktor geschützt. Der sechsstellige Code steht in der Authenticator-App; ein Wiederherstellungscode geht ebenso.',
    codeLabel: 'Bestätigungscode',
    codeSubmit: 'Anmelden',
    // ── Anmeldung mit Passkey (M9) ────────────────────────────────────────
    passkeySubmit: 'Mit Passkey anmelden',
    passkeyOr: 'oder',
    passkeyFailed: 'Die Anmeldung mit Passkey ist gerade nicht möglich.',
    /** Eine Meldung für jede Ablehnung — sonst ließen sich Konten erkunden. */
    passkeyRejected: 'Dieser Passkey funktioniert hier nicht.',
    passkeyAborted: 'Der Vorgang wurde abgebrochen.',

    /** Ankreuzfeld im zweiten Anmeldeschritt (M9, FA-TRUST-01). */
    rememberDevice: 'Diesem Gerät vertrauen',
    rememberDeviceHint:
      'Auf diesem Gerät entfällt der Bestätigungscode für 30 Tage. Nicht auf fremden Geräten wählen.',
    codeInvalid: 'Der Bestätigungscode stimmt nicht.',
    codeMissing: 'Bitte den Bestätigungscode angeben.',
    codeExpired:
      'Der Anmeldevorgang ist abgelaufen oder wurde abgebrochen. Bitte erneut anmelden.',
    otherAccount: 'Mit einem anderen Konto anmelden',

    invalidCredentials: 'E-Mail-Adresse oder Passwort ist nicht korrekt.',
    locked:
      'Der Zugang ist wegen zu vieler Fehlversuche vorübergehend gesperrt. Bitte in {minutes} Minuten erneut versuchen.',
    missingFields: 'Bitte E-Mail-Adresse und Passwort angeben.',
    rejected: 'Die Anmeldung wurde abgelehnt — die Seite ist veraltet. Neu laden und erneut absenden.',
    noRegistrationHint:
      'Es gibt keine Selbstregistrierung. Das erste Konto wird auf dem Server angelegt.',
  },
  dashboard: {
    chart: 'Umsatz je Monat, letzte 12 Monate',
    chartEmpty: 'In den letzten zwölf Monaten wurde noch kein Beleg festgeschrieben.',
    chartHeading: 'Umsatz je Monat',
    chartPeriod: 'letzte 12 Monate',
    overdueHeading: 'Überfällig',
    overdueEmpty: 'Nichts überfällig.',
    dueSoonHeading: 'Fällig in den nächsten 14 Tagen',
    dueSoonEmpty: 'In den nächsten vierzehn Tagen wird nichts fällig.',
    recentHeading: 'Zuletzt bearbeitet',
    topCustomersHeading: 'Umsatzstärkste Kunden',
    topCustomersPeriod: 'laufendes Jahr',
    topCustomersEmpty: 'In diesem Jahr wurde noch kein Beleg festgeschrieben.',
    overdueSince: 'seit {days} Tagen',
    dueIn: 'in {days} Tagen',
    dueToday: 'heute fällig',
    invoiceCount: '{count} Rechnungen',
    invoiceCountOne: '1 Rechnung',
    empty: 'Noch keine Rechnungen. Die erste Rechnung entsteht in etwa zwei Minuten.',
    /** Konto ohne `invoice.read` (M8) — die Übersicht besteht aus Belegzahlen. */
    noInvoiceAccess:
      'Die Übersicht wertet Belege aus. Diesem Konto fehlt das Recht, Belege zu lesen.',
    metricOutstanding: 'Offen gesamt',
    metricOverdue: 'Davon überfällig',
    metricRevenueMonth: 'Umsatz laufender Monat',
    metricRevenueYear: 'Umsatz {year}',
    metricNet: 'netto',
    metricInvoiceOne: '1 Rechnung',
    metricInvoices: '{count} Rechnungen',
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
    catalog: 'Leistungen',
    invoices: 'Rechnungen',
    company: 'Firmendaten',
    numbering: 'Nummernkreis',
    security: 'Sicherheit',
    members: 'Mitglieder',
    roles: 'Rollen',
    backup: 'Datenexport',
    settings: 'Einstellungen',
    logout: 'Abmelden',
    label: 'Hauptnavigation',
    /** Ersatzname im Sidebar-Kopf, solange keine Firmendaten erfasst sind. */
    organizationFallback: 'Firmendaten fehlen',
    userZone: 'Angemeldetes Konto',
    /** Konto ohne Rolle — trägt nur die Grundrechte (M8). */
    roleMissing: 'ohne Rolle',
  },
  common: {
    save: 'Speichern',
    edit: 'Bearbeiten',
    actions: 'Aktionen',
    cancel: 'Abbrechen',
    close: 'Schließen',
    datePlaceholder: 'TT.MM.JJJJ',
    datePick: '{field} im Kalender wählen',
    working: 'Wird ausgeführt',
    back: 'Zurück',
    saved: 'Die Änderungen wurden gespeichert.',
    chooseFile: 'Datei auswählen',
    noFileChosen: 'Keine Datei ausgewählt',
    optional: 'optional',
    required: 'Pflichtfeld',
    none: '—',
    search: 'Suchen',
    searchPlaceholder: 'Name, Nummer, Ort oder E-Mail',
    reset: 'Filter zurücksetzen',
    validationFailed: 'Die markierten Felder sind noch nicht gültig.',
    rejected: 'Die Anfrage wurde abgelehnt — die Seite ist veraltet. Neu laden und erneut absenden.',
    noScript:
      'Dieses Formular benötigt JavaScript. Ohne JavaScript werden Eingaben nicht gespeichert; die Anmeldung und alle Listen funktionieren auch ohne.',
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
    /**
     * Die Verknüpfung scheiterte, die Datei wurde zurückgenommen (M10).
     *
     * Ursache **und** Ausweg (FA-UI-10): Der Satz sagt nicht nur, dass es nicht
     * ging, sondern was stattdessen zu tun ist.
     */
    logoNotLinked:
      'Das Logo konnte nicht mit den Firmendaten verknüpft werden und wurde verworfen. Bitte den Vorgang wiederholen; bleibt es dabei, hilft ein Blick ins Log des Servers.',
    logoSaved: 'Das Logo wurde hochgeladen.',
    logoRemove: 'Logo entfernen',
    logoNone: 'Es ist kein Logo hinterlegt.',
    logoAlt: 'Firmenlogo',
    logoTooLarge: 'Die Datei ist größer als 2 MB.',
    logoUnrecognized: 'Der Dateiinhalt ist kein PNG, JPEG oder SVG.',
    logoTypeMismatch: 'Dateiinhalt und angegebener Typ stimmen nicht überein.',
    logoActiveContent:
      'Die SVG-Datei enthält ausführbare Bestandteile und wurde deshalb abgelehnt.',
    logoEmpty: 'Bitte eine Datei auswählen.',

    sectionLetterhead: 'Briefpapier',
    sectionLetterheadHint:
      'Eine einseitige PDF im Format A4, die unter jeden Beleg gelegt wird — höchstens 5 MB. Sie trägt nur die Gestaltung; Anschrift, Bankverbindung und Pflichtangaben setzt Faktura selbst.',
    letterheadUpload: 'Briefpapierdatei',
    letterheadUploadButton: 'Briefpapier hochladen',
    letterheadSaved: 'Das Briefpapier wurde hochgeladen.',
    letterheadRemove: 'Briefpapier entfernen',
    letterheadNone: 'Es ist kein Briefpapier hinterlegt. Belege erscheinen auf weißem Grund.',
    letterheadPreviewTitle: 'Vorschau des Briefpapiers',
    letterheadEmpty: 'Bitte eine Datei auswählen.',
    letterheadTooLarge: 'Die Datei ist größer als 5 MB.',
    letterheadNotPdf: 'Der Dateiinhalt ist keine PDF-Datei.',
    letterheadActiveContent:
      'Die PDF-Datei enthält ausführbare Bestandteile oder eingebettete Dateien und wurde deshalb abgelehnt.',
    letterheadUnreadable: 'Die PDF-Datei ließ sich nicht lesen. Möglicherweise ist sie beschädigt.',
    letterheadMultiplePages:
      'Das Briefpapier muss aus genau einer Seite bestehen. Weitere Seiten erschienen auf keinem Beleg.',
    letterheadNotA4: 'Das Briefpapier muss das Format A4 haben (210 × 297 mm).',
    letterheadNotLinked:
      'Das Briefpapier konnte nicht mit den Firmendaten verknüpft werden und wurde verworfen. Bitte den Vorgang wiederholen; bleibt es dabei, hilft ein Blick ins Log des Servers.',
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
    archiveExplanation:
      'Leistungen werden nicht gelöscht, sondern archiviert. Sie stecken in bereits geschriebenen Rechnungen; gelöscht wäre nicht mehr nachvollziehbar, was dort abgerechnet wurde. Archivierte Leistungen erscheinen nicht mehr in der Auswahl für neue Rechnungen.',
  },
  invoices: {
    title: 'Rechnungen',
    heading: 'Rechnungen',
    intro: 'Alle Belege mit Status, Betrag und Fälligkeit.',
    create: 'Rechnung anlegen',
    createHeading: 'Neue Rechnung',
    editHeading: 'Rechnung bearbeiten',
    viewHeading: 'Rechnung',
    empty: 'Noch keine Rechnungen. Die erste Rechnung entsteht in etwa zwei Minuten.',
    emptyFiltered: 'Zu diesen Filtern gibt es keinen Beleg. Filter zurücksetzen zeigt wieder alle.',
    /** Entwurf ohne Bearbeitungsrecht (M8) — das Blatt daneben bleibt sichtbar. */
    draftNotEditable: 'Dieser Entwurf lässt sich mit den Rechten dieses Kontos nicht bearbeiten.',
    /** Im Tabellenschema angelegt, in V1 ausgeblendet (FA-UI-16). */
    createdBy: 'Erstellt von',
    /** Der Urheber ist noch da, die Person nicht mehr (M10, FA-ADM-15). */
    createdByAnonymized: 'Gelöschtes Konto',

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
    taxSchemeFromCompany: 'Aus den Firmendaten übernommen.',
    taxSchemeCompanyLink: 'Firmendaten ändern',
    taxSchemeOverride: 'Abweichende Behandlung für diese Rechnung',
    taxSchemeWarning:
      'Wer Umsatzsteuer ausweist, schuldet sie — auch dann, wenn sie zu Unrecht ausgewiesen ist (§14c UStG). Eine Abweichung von der Kleinunternehmerregelung gehört deshalb nur auf einen Beleg, für den sie wirklich gilt. Eine Änderung setzt Kategorie und Satz aller Positionen neu.',
    purchaseOrderRef: 'Bestellnummer',
    template: 'Vorlage',

    buyerLegend: 'Empfänger',
    buyerNoSelection: '— kein Kunde gewählt —',
    buyerModeCUSTOMER: 'Aus den Kundendaten',
    buyerModeFIELDS: 'Direkt eingeben',
    buyerModeFREE: 'Als Textblock',
    buyerModeHint:
      'Ein einmaliger Empfänger braucht keinen Kundendatensatz. Land und USt-IdNr bestimmen die steuerliche Behandlung — im Textblock wird sie von Hand gewählt.',
    buyerName: 'Name',
    buyerContactName: 'Ansprechpartner',
    buyerAddressLine1: 'Straße und Hausnummer',
    buyerAddressLine2: 'Adresszusatz',
    buyerPostalCode: 'Postleitzahl',
    buyerCity: 'Ort',
    buyerCountryCode: 'Land',
    buyerEmail: 'E-Mail-Adresse',
    buyerPhone: 'Telefon',
    buyerVatId: 'USt-IdNr.',
    buyerFreeText: 'Anschrift',
    buyerFreeTextHint:
      'Eine Zeile je Zeile des Anschriftfelds. Die erste Zeile gilt als Name des Empfängers.',
    buyerNoCustomers:
      'Es sind noch keine Kunden erfasst. Der Empfänger lässt sich trotzdem direkt am Beleg angeben.',
    introText: 'Einleitungstext',
    outroText: 'Schlusstext',

    linesHeading: 'Positionen',
    totalsHeading: 'Summen',
    textsHeading: 'Texte auf dem Beleg',
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
    /** Nachsatz am Status „Offen" — Überfälligkeit ist kein eigener Status (FA-UI-06). */
    overdueSince: (days: number): string =>
      days === 1 ? '1 Tag überfällig' : `${String(days)} Tage überfällig`,
    /** Nachsatz am Status „Teilbezahlt": wie viel von wie viel. */
    paidOf: (paid: string, gross: string): string => `${paid} von ${gross}`,
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

    // Schnellaktionen und Mehrfachauswahl in der Liste (FA-UI-19, -20).
    rowActions: 'Aktionen',
    selectRow: 'Rechnung auswählen',
    selectionAny: 'Ausgewählte Rechnungen',
    selectionCount: '{count} Rechnungen gewählt',
    selectionCountOne: '1 Rechnung gewählt',
    bulkMarkPaid: 'Als bezahlt markieren',
    bulkDeleteDrafts: 'Entwürfe löschen',
    actionMarkPaid: 'Als bezahlt markieren',
    actionDownload: 'PDF herunterladen',
    /** Nur an Entwürfen: Festgeschriebenes lässt sich nicht bearbeiten (M11). */
    actionEdit: 'Bearbeiten',
    actionDuplicate: 'Duplizieren',
    actionCancel: 'Stornieren',

    noticePaid: 'Rechnung als bezahlt markiert.',
    noticePaidMany: '{count} Rechnungen als bezahlt markiert.',
    noticeCancelled: 'Rechnung storniert. Die Stornorechnung trägt eine eigene Nummer.',
    noticeDuplicated: 'Rechnung dupliziert.',
    noticeDraftsDeleted: '{count} Entwürfe gelöscht.',

    saveDraft: 'Als Entwurf speichern',
    issue: 'Festschreiben',
    issuedAs: 'Festgeschrieben als',
    issueConfirmTitle: 'Rechnung festschreiben?',
    issueConfirm:
      'Beim Festschreiben erhält die Rechnung ihre endgültige Nummer. Danach sind Positionen, Beträge, Daten und Kundenbezug nicht mehr änderbar — eine fehlerhafte Rechnung kann nur noch storniert werden. Das ist gesetzlich so vorgeschrieben.',
    duplicate: 'Duplizieren',
    deleteDraft: 'Entwurf löschen',
    deleteConfirmTitle: 'Entwurf löschen?',
    deleteConfirm:
      'Der Entwurf wird endgültig entfernt. Da er noch keine Nummer trägt, entsteht dadurch keine Lücke im Nummernkreis.',
    cancelInvoice: 'Stornieren',
    cancelConfirmTitle: 'Rechnung stornieren?',
    cancelConfirm:
      'Es entsteht eine Stornorechnung mit eigener Nummer und Bezug auf diese Rechnung. Die Originalrechnung bleibt vollständig erhalten und wechselt auf „Storniert". Rückgängig machen lässt sich das nicht.',
    noDeleteExplanation:
      'Ein festgeschriebener Beleg lässt sich nicht löschen. §14b UStG verlangt zehn Jahre Aufbewahrung, und eine gelöschte Nummer risse eine Lücke in den Nummernkreis, die sich niemandem erklären lässt. Der Weg für eine fehlerhafte Rechnung ist die Stornorechnung: Sie trägt eine eigene Nummer, verweist auf das Original, und das Original bleibt vollständig erhalten.',
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
    paymentRemoveTitle: 'Zahlung zurücknehmen?',
    paymentRemoveConfirm: 'Die Zahlung wird entfernt und der Status neu abgeleitet.',
    markPaid: 'Als vollständig bezahlt markieren',
    markPaidTitle: 'Als bezahlt markieren?',
    markPaidHint: 'Erfasst eine Zahlung über den offenen Restbetrag.',
    nothingOutstanding: 'Es ist nichts mehr offen.',

    cancelledBy: 'Storniert durch',
    cancels: 'Storniert die Rechnung',
    sellerHeading: 'Aussteller',
    buyerHeading: 'Empfänger',
    frozenHint:
      'Dieser Beleg ist festgeschrieben. Die Angaben zeigen den Stand vom Tag der Ausstellung und ändern sich nicht mehr mit den Stammdaten.',

    unsavedChanges: 'Es gibt ungespeicherte Änderungen. Seite wirklich verlassen?',
    noCompanyProfile: 'Bitte zuerst die Firmendaten erfassen — ohne sie ist kein Beleg möglich.',
    noCustomers: 'Bitte zuerst einen Kunden anlegen.',
    notFound: 'Der Beleg wurde nicht gefunden.',

    violationNO_BUYER: 'Es ist kein Empfänger angegeben.',
    violationNO_BUYER_ADDRESS: 'Dem Empfänger fehlt die Anschrift.',
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
  templates: {
    title: 'Vorlagen',
    heading: 'Vorlagen',
    intro:
      'Eine Vorlage bestimmt Aussehen und Aufbau des Belegs. Sie besteht aus Liquid-HTML und CSS.',
    empty: 'Noch keine Vorlage. Die mitgelieferte DIN-5008-Vorlage entsteht beim ersten Beleg.',

    create: 'Vorlage anlegen',
    createHeading: 'Neue Vorlage',
    editHeading: 'Vorlage bearbeiten',
    name: 'Name',
    description: 'Beschreibung',
    htmlSource: 'HTML (Liquid)',
    cssSource: 'CSS',
    isDefault: 'Standardvorlage',
    isDefaultHint: 'Wird für alle Belege ohne eigene Vorlage verwendet.',
    makeDefault: 'Als Standard setzen',
    defaultMarker: 'Standard',
    duplicate: 'Duplizieren',
    duplicateSuffix: 'Kopie',
    remove: 'Vorlage löschen',
    removeConfirmTitle: 'Vorlage entfernen?',
    removeConfirm:
      'Die Vorlage wird gelöscht. Bereits erzeugte PDFs bleiben unverändert — sie liegen als Datei vor.',
    removeDefaultRejected: 'Die Standardvorlage lässt sich nicht löschen. Zuerst eine andere zum Standard machen.',
    nameTaken: 'Unter diesem Namen gibt es bereits eine Vorlage.',
    notFound: 'Diese Vorlage gibt es nicht.',
    restoreDefault: 'Mitgelieferte Vorlage wiederherstellen',

    sectionGeometry: 'Seitenformat',
    sectionGeometryHint: 'Ränder in Millimetern. DIN 5008 sieht oben 25 mm und sonst 20 mm vor.',
    marginTop: 'Rand oben',
    marginRight: 'Rand rechts',
    marginBottom: 'Rand unten',
    marginLeft: 'Rand links',
    marginInvalid: 'Ränder liegen zwischen 0 und 50 Millimetern.',

    sectionUpload: 'Hochladen',
    sectionUploadHint:
      'Einzelne .html- und .css-Datei oder ein ZIP mit template.html und style.css.',
    uploadFile: 'Datei',
    upload: 'Hochladen',
    uploaded: 'Die Vorlage wurde hochgeladen.',
    uploadEmpty: 'Keine Datei ausgewählt.',
    uploadTooLarge: 'Die Datei ist größer als 5 MB.',
    uploadUnknownType: 'Zulässig sind .html, .css und .zip.',
    uploadMissingEntries: 'Im Archiv fehlt template.html oder style.css.',
    uploadUnsafeEntry: 'Das Archiv enthält einen Eintrag, der aus dem Zielverzeichnis führt.',
    uploadNotUtf8: 'Die Datei ist nicht als UTF-8 lesbar.',

    preview: 'Vorschau',
    previewIntro: 'Zeigt den gewählten Beleg in dieser Vorlage.',
    previewFrame: 'Belegvorschau',
    previewInvoice: 'Beleg für die Vorschau',
    previewNoInvoice: 'Sobald ein Beleg vorliegt, erscheint hier die Vorschau.',
    previewFailed: 'Die Vorschau konnte nicht erzeugt werden.',
    previewErrorHeading: 'Die Vorlage konnte nicht verarbeitet werden',
    downloadPdf: 'Als PDF herunterladen',

    /** FA-TPL-06: die verfügbaren Variablen, in der Oberfläche dokumentiert. */
    sectionVariables: 'Verfügbare Variablen',
    sectionVariablesHint:
      'Ausgabe mit {{ … }}, Schleifen und Bedingungen mit {% … %}. Ein fehlendes optionales Feld bleibt leer.',
    variableGroupSeller: 'Aussteller',
    variableGroupBuyer: 'Empfänger',
    variableGroupInvoice: 'Beleg',
    variableGroupLines: 'Positionen (Schleife über lines)',
    variableGroupTax: 'Steuergruppen (Schleife über taxBreakdown)',
    variableGroupTotals: 'Summen',
    variableGroupNotices: 'Hinweise',
    variableGroupFilters: 'Filter',
  },

  numbering: {
    fileNameHeading: 'Dateiname der PDFs',
    fileNameHint:
      'Bestimmt, unter welchem Namen ein Beleg heruntergeladen wird. Platzhalter: {NUMBER}, {YYYY}, {MM}, {DD}, {CUSTOMER}, {TYPE}.',
    fileNamePattern: 'Muster',
    fileNameInvalid: 'Das Muster braucht mindestens einen bekannten Platzhalter.',
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
    // Bestätigungen nach einer Handlung (M12, FA-UI-28). Der Wortlaut trägt
    // den Verbstamm des auslösenden Knopfes (FA-UI-11).
    totpTurnedOff: 'Der zweite Faktor wurde abgeschaltet.',
    sessionRevoked: 'Die Sitzung wurde beendet.',
    otherSessionsRevoked: 'Alle anderen Sitzungen wurden beendet.',
    trustRevoked: 'Dem Gerät wurde das Vertrauen entzogen.',
    passkeyRemoved: 'Der Passkey wurde entfernt.',

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
      'Code mit der Authenticator-App scannen, dann das angezeigte Einmalkennwort eintragen.',
    totpManualEntry: 'Ohne Kamera lässt sich dieser Schlüssel von Hand eintragen:',
    totpCode: 'Einmalkennwort',
    totpConfirm: 'Aktivieren',
    totpCancel: 'Abbrechen',
    totpDisable: 'Deaktivieren',
    totpInvalidCode: 'Das Einmalkennwort ist nicht korrekt. Bitte erneut versuchen.',
    totpAlreadyEnabled: 'Die Zweifaktorauthentifizierung ist bereits aktiv.',

    recoveryHeading: 'Wiederherstellungscodes',
    recoveryIntro:
      'Diese Codes gehören an einen sicheren Ort. Jeder Code funktioniert genau einmal und ersetzt das Einmalkennwort, wenn das Telefon nicht erreichbar ist.',
    recoveryOnceOnly: 'Diese Codes werden nur jetzt angezeigt und danach nie wieder.',
    recoveryRegenerate: 'Neue Codes erzeugen',
    recoveryRemaining: 'Noch nicht verwendete Codes: {count}',

    sessionsHeading: 'Aktive Sitzungen',
    sessionsIntro: 'Geräte mit einer derzeit gültigen Sitzung.',
    sessionCurrent: 'Diese Sitzung',
    sessionUnknownDevice: 'Unbekanntes Gerät',
    sessionLastSeen: 'Zuletzt aktiv',
    sessionCreated: 'Angemeldet seit',
    sessionRevoke: 'Beenden',
    sessionRevokeAll: 'Alle anderen Sitzungen beenden',

    // ── Vertraute Geräte (M9) ─────────────────────────────────────────────
    // ── Passkeys (M9) ─────────────────────────────────────────────────────
    passkeyHeading: 'Passkeys',
    passkeyIntro:
      'Ein Passkey meldet ohne Passwort und ohne Code an. Der Schlüssel verlässt das Gerät nie, und er funktioniert nur auf dieser Adresse — eine nachgebaute Anmeldeseite bekommt nichts.',
    passkeyEmpty: 'Es ist kein Passkey hinterlegt.',
    passkeyLabel: 'Bezeichnung',
    passkeyLabelHint: 'Zum Beispiel „Telefon" oder „Rechner im Büro".',
    passkeyAdd: 'Passkey anlegen',
    passkeyRemove: 'Entfernen',
    passkeyCreated: 'Angelegt am {date}',
    passkeyLastUsed: 'Zuletzt verwendet',
    passkeyNeverUsed: 'noch nie verwendet',
    passkeyDisabled: 'Gesperrt — der Zähler deutete auf eine Kopie hin',
    passkeyFailed: 'Der Passkey konnte nicht angelegt werden. Bitte erneut versuchen.',
    passkeyAborted: 'Der Vorgang wurde abgebrochen.',
    passkeyUnsupported:
      'Dieser Browser oder diese Adresse unterstützt keine Passkeys. Sie brauchen HTTPS — nur „localhost" geht auch ohne.',
    passkeyDomainNote:
      'Ein Passkey gilt nur für die Adresse, unter der er angelegt wurde. Zieht die Anwendung auf eine andere Domain, müssen alle Passkeys neu angelegt werden.',

    trustedHeading: 'Vertraute Geräte',
    trustedIntro:
      'Auf diesen Geräten entfällt der Bestätigungscode für 30 Tage. Das Passwort wird weiterhin verlangt.',
    trustedEmpty: 'Es ist kein Gerät als vertraut hinterlegt.',
    trustedLastUsed: 'Zuletzt verwendet',
    trustedExpires: 'Gilt bis',
    trustedRevoke: 'Vertrauen entziehen',
    trustedRevoked: 'Das Gerät ist nicht mehr vertraut.',
    trustedNote:
      'Alle vertrauten Geräte verfallen, sobald das Passwort zurückgesetzt, der zweite Faktor abgeschaltet oder „Alle anderen Sitzungen beenden" gewählt wird.',
  },
  members: {
    title: 'Mitglieder',
    heading: 'Mitglieder',
    intro: 'Konten dieses Unternehmens, ihre Rolle und ihr Zustand.',
    back: 'Zur Übersicht',

    columnName: 'Name',
    columnEmail: 'Adresse',
    columnRole: 'Rolle',
    columnLastLogin: 'Zuletzt angemeldet',
    columnState: 'Zustand',
    nameMissing: 'ohne Namen',
    neverSignedIn: 'noch nie',
    stateActive: 'Aktiv',
    stateDisabled: 'Gesperrt',
    twoFactorOn: 'mit zweitem Faktor',

    roleChange: 'Rolle ändern',
    roleChangeSubmit: 'Rolle zuweisen',
    disable: 'Sperren',
    enable: 'Entsperren',
    disableConfirmTitle: 'Konto sperren?',
    disableConfirm:
      'Das Konto verliert sofort alle laufenden Sitzungen und kann sich nicht mehr anmelden. Belege und Protokolleinträge bleiben unverändert erhalten.',
    disabled: 'Das Konto ist gesperrt.',
    enabled: 'Das Konto ist wieder freigegeben.',
    roleAssigned: 'Die Rolle wurde zugewiesen.',

    resetPassword: 'Passwort zurücksetzen',
    resetConfirmTitle: 'Passwortzurücksetzung auslösen?',
    resetConfirm:
      'Es entsteht ein Link, der 24 Stunden gilt und genau einmal funktioniert. Das Passwort setzt der Inhaber des Kontos selbst — hier wird keines vergeben.',
    resetLinkHeading: 'Link zur Passwortzurücksetzung',
    resetLinkOnceOnly:
      'Dieser Link wird nur jetzt angezeigt. Er gilt 24 Stunden und funktioniert einmal.',

    inviteHeading: 'Mitglied einladen',
    inviteIntro:
      'Die Anwendung versendet keine E-Mail. Der Einladungslink erscheint nach dem Anlegen genau einmal und wird von Hand weitergegeben.',
    inviteEmail: 'E-Mail-Adresse',
    inviteRole: 'Rolle',
    inviteSubmit: 'Einladung anlegen',
    inviteLinkHeading: 'Einladungslink',
    inviteLinkOnceOnly:
      'Dieser Link wird nur jetzt angezeigt. Er gilt sieben Tage und funktioniert einmal.',
    inviteEmailTaken: 'Zu dieser Adresse gehört bereits ein Konto.',
    inviteEmailInvalid: 'Bitte eine gültige E-Mail-Adresse angeben.',
    /**
     * Ein Konto, das der Betreiber unkenntlich gemacht hat (M10, FA-ADM-15).
     *
     * Die Zeile bleibt in der Liste: Sie hat Belege erstellt, und die nennen
     * sie. Was fehlt, ist die Person.
     */
    anonymized: 'Gelöschtes Konto',
    inviteRoleMissing: 'Bitte eine Rolle wählen.',

    openHeading: 'Offene Einladungen',
    openEmpty: 'Es sind keine Einladungen offen.',
    openExpires: 'Gilt noch {days} Tage',
    openExpiresToday: 'Gilt heute noch',
    openInvitedBy: 'Eingeladen von',
    withdraw: 'Zurückziehen',
    withdrawConfirmTitle: 'Einladung zurückziehen?',
    withdrawConfirm: 'Der Link funktioniert danach nicht mehr. Eine neue Einladung ist jederzeit möglich.',
    withdrawn: 'Die Einladung wurde zurückgezogen.',

    errorNOT_FOUND: 'Das Konto wurde nicht gefunden.',
    errorROLE_NOT_FOUND: 'Die Rolle wurde nicht gefunden.',
    errorLAST_ADMINISTRATOR:
      'Das ist das letzte aktive Konto mit Rechteverwaltung. Ohne ein solches Konto ließe sich das Unternehmen nicht mehr verwalten.',
    errorSELF: 'Das eigene Konto lässt sich nicht sperren.',
  },
  roles: {
    title: 'Rollen',
    heading: 'Rollen',
    intro:
      'Jede Rolle fasst Berechtigungen zusammen. Ein Konto trägt genau eine Rolle.',
    back: 'Zur Übersicht',

    columnName: 'Rolle',
    columnPermissions: 'Berechtigungen',
    columnMembers: 'Konten',
    permissionCount: '{count} von {total}',
    memberCount: '{count}',
    empty: 'Es ist noch keine Rolle angelegt.',

    createHeading: 'Rolle anlegen',
    editHeading: 'Rolle bearbeiten',
    name: 'Name',
    nameHint: 'Zum Beispiel Buchhaltung oder Vertrieb.',
    description: 'Beschreibung',
    permissions: 'Berechtigungen',
    submitCreate: 'Rolle anlegen',
    submitSave: 'Rolle speichern',
    delete: 'Löschen',
    deleteConfirmTitle: 'Rolle löschen?',
    deleteConfirm: 'Die Rolle verschwindet. Konten, die sie tragen, gibt es dann nicht mehr — deshalb ist das nur bei einer unbenutzten Rolle möglich.',
    created: 'Die Rolle wurde angelegt.',
    saved: 'Die Rolle wurde gespeichert.',
    deleted: 'Die Rolle wurde gelöscht.',

    errorNOT_FOUND: 'Die Rolle wurde nicht gefunden.',
    errorNAME_TAKEN: 'Eine Rolle mit diesem Namen gibt es bereits.',
    errorIN_USE:
      'Diese Rolle tragen noch Konten. Erst umstellen, dann löschen.',
    errorLAST_ADMINISTRATOR:
      'Damit verlöre das Unternehmen die letzte Rechteverwaltung. Zuerst ein anderes Konto damit ausstatten.',
    nameMissing: 'Bitte einen Namen angeben.',

    /** Gegenstände des Berechtigungskatalogs — Reihenfolge wie im Formular. */
    subject: {
      invoice: 'Rechnungen',
      customer: 'Kunden',
      catalogItem: 'Leistungskatalog',
      companyProfile: 'Firmendaten',
      numbering: 'Nummernkreis',
      security: 'Eigene Sicherheit',
      template: 'Vorlagen',
      export: 'Datenexport',
      organization: 'Verwaltung',
    },
    action: {
      create: 'anlegen',
      read: 'lesen',
      update: 'ändern',
      archive: 'archivieren',
      delete: 'löschen',
      duplicate: 'duplizieren',
      issue: 'festschreiben',
      cancel: 'stornieren',
      recordPayment: 'Zahlungen erfassen',
      run: 'ausführen',
      administer: 'Mitglieder und Rollen verwalten',
    },
    /** Rechte, die jedes Konto ohnehin trägt — im Formular nicht abwählbar. */
    baseHint: 'Grundrecht, jedes Konto trägt es',
  },
  invitation: {
    title: 'Einladung annehmen',
    heading: 'Konto einrichten',
    intro: 'Einladung von {organization} als {role} für {email}.',
    name: 'Name',
    nameHint: 'Erscheint in der Mitgliederliste und am Beleg.',
    password: 'Passwort',
    passwordRepeat: 'Passwort wiederholen',
    submit: 'Konto einrichten',
    done: 'Das Konto ist eingerichtet. Jetzt anmelden.',
    toLogin: 'Zur Anmeldung',
    /**
     * Eine Meldung für unbekannt, abgelaufen, zurückgezogen und schon benutzt
     * (FA-MEMB-05) — die Unterscheidung wäre eine Auskunft.
     */
    invalid:
      'Dieser Einladungslink gilt nicht. Er kann abgelaufen sein, schon benutzt oder zurückgezogen. Wer eingeladen wurde, bekommt einen neuen.',
    /** Bestätigung auf der Anmeldeseite, nach der Umleitung dorthin. */
    accountReady: 'Das Konto ist eingerichtet. Jetzt anmelden.',
    passwordReady: 'Das Passwort ist gesetzt. Jetzt anmelden.',
  },
  passwordReset: {
    title: 'Passwort setzen',
    heading: 'Neues Passwort setzen',
    intro: 'Für {email}. Alle laufenden Sitzungen dieses Kontos enden dabei.',
    password: 'Neues Passwort',
    passwordRepeat: 'Passwort wiederholen',
    submit: 'Passwort setzen',
    done: 'Das Passwort ist gesetzt. Jetzt anmelden.',
    invalid:
      'Dieser Link gilt nicht. Er kann abgelaufen sein oder schon benutzt. Die Rechteverwaltung des Unternehmens legt einen neuen an.',
  },
  password: {
    mismatch: 'Die beiden Eingaben stimmen nicht überein.',
    tooShort: 'Das Passwort muss mindestens {min} Zeichen haben.',
    tooLong: 'Das Passwort ist zu lang.',
    compromised:
      'Dieses Passwort steht in einer Liste bekannter Datenlecks. Bitte ein anderes wählen.',
  },
  quantity: {
    empty: 'Bitte eine Menge angeben.',
    malformed: 'Die Menge ist keine gültige Zahl.',
    tooManyDecimals: 'Es sind höchstens {max} Nachkommastellen zulässig.',
    outOfRange: 'Die Menge ist zu groß.',
  },
} as const;

export type Messages = typeof messages;

/**
 * Monatskürzel für die Achse des Umsatzdiagramms (FA-DASH-05).
 *
 * Fest hinterlegt statt über `Intl.DateTimeFormat` erzeugt: Die Oberfläche ist
 * deutsch, unabhängig davon, wie der Rechner eingestellt ist, auf dem der
 * Server läuft. Genau daran ist schon das Datumsfeld gescheitert (FA-UI-13).
 */
export const monthAbbreviations: readonly string[] = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];
