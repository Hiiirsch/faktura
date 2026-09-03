# FORTSCHRITT

Statusverfolgung aller Anforderungen aus `rechnungs-app-anforderungen.md`.

**Status:** `offen` — noch nicht begonnen oder in Arbeit · `umgesetzt` — implementiert
und durch den genannten Nachweis belegt · `abgenommen` — vom Auftraggeber freigegeben.

**Nachweis:** Pfad zur Testdatei bzw. `Review:` / `Manuell:` bei den
Verifikationsarten R und M.

**MS:** Meilenstein laut Anforderungskatalog §18 (bis M8: §16, bis M9: §17 — der
Katalog hat mit „Mandanten, Rollen und Verwaltung" und „Anmeldeverfahren"
zweimal eine Nummer verschoben). Ein `†` markiert IDs, die dort **keinem** Meilenstein zugeordnet
sind — der eingetragene Meilenstein ist ein Vorschlag und steht noch zur
Freigabe aus.

Stand: 2026-08-24 · **229 IDs aus dem Anforderungskatalog**: 83 abgenommen (M0–M4),
135 umgesetzt, 11 offen. Dazu **34 IDs** aus `faktura-frontend-design.md` §9
(Abschnitt 16), alle umgesetzt.

**M13 umgesetzt** — Impressum und Datenschutzhinweise. Drei neue IDs
(NFA-COMP-07 bis -09). Der Anlass ist die Mandantenfähigkeit aus M8: Wer die
Anwendung auch für andere Unternehmen betreibt, bietet ein Telemedium an. Die
Fristen der Datenschutzhinweise sind Verweise auf die Konstanten der Domäne —
eine Erklärung, die neben der Wirklichkeit herläuft, wäre eine Zusage, die
niemand hält.

**M12 umgesetzt** — Briefpapier je Unternehmen und klare Rückmeldung beim
Speichern. Vier neue IDs (FA-TPL-11, FA-PDF-13, NFA-SEC-31, FA-UI-28), dazu
FA-TPL-09 im Wortlaut geschärft. Der eigentliche Fund war die Lücke dahinter:
Das PDF entstand beim **ersten Abruf**, nicht beim Festschreiben — wer
dazwischen die Vorlage änderte, änderte den Beleg.

**M11 umgesetzt** — der Beleg selbst: keine Umsatzsteuer bei §19, Blattfuß am
Blattfuß mit Bankverbindung, Logo im Briefkopf, Entwurf aus der Liste
bearbeitbar. Fünf neue IDs, dazu FA-UI-26 berichtigt — der Satz sagte seit M9
etwas zu, das nie gebaut war.

**M10 umgesetzt** — sieben neue IDs in Abschnitt 17 (Katalog §16.4/16.5):
Betreiberkonten aus der Oberfläche, Protokoll der Verwaltung, Anonymisieren
statt Löschen, Unternehmen bearbeiten, Zustand und Sicherung. Dabei zwei
Korrekturen an eigenen Entwürfen, beide von bestehenden Tests erzwungen: Die
Aussperrsicherung der Verwaltung ist **kein** Trigger geworden, und die interne
Notiz gehört nicht zu den Kennzahlen.

**M9 umgesetzt** — 19 neue IDs in Abschnitt 18 (Katalog §17 „Anmeldeverfahren"):
Passkeys, vertraute Geräte und die beiden Wege des Betreibers aus einer
Sackgasse. Sieben neue UI-IDs (FA-UI-21 bis -26, NFA-UI-06), davon zwei für die Marke. Geändert: FA-ADM-04
und FA-ADM-08 im Wortlaut, NFA-SEC-05 nennt jetzt beide Faktorarten.

**M8 umgesetzt** — 31 IDs in Abschnitt 17 (Katalog §16 „Mandanten, Rollen und
Verwaltung"), alle belegt · **M5 umgesetzt, Abnahme offen** · **M5.6
(PDF-Vorschau), M5.7 (Empfänger ohne Kunde), M5.8 (überarbeitete Oberfläche), M6
(Übersicht), M6.1 (Ausführung) und M6.2 (zweistufige Anmeldung) umgesetzt** —
vier zuvor abgenommene IDs (FA-RECH-02, -12, FA-NUM-08, FA-PFL-01) sind durch
M5.7 im Wortlaut geändert und stehen erneut zur Abnahme.

**Drei Lücken, die beim Schreiben des M9-Katalogs herausgefallen sind.** Alle
drei sind geschlossen, und sie sind der Grund, warum die Nachweisspalte gepflegt
wird — eine Anforderung ohne Nachweis ist eine Behauptung.

1. **Die CSRF-Prüfung der Zeremonie ging immer durch.** Sie las die Kopfzeile,
   die der Proxy selbst aus dem Cookie bildet, und verglich damit das Cookie mit
   sich selbst. Der Aufrufer sendet jetzt unter einem eigenen Namen
   (`CSRF_REQUEST_HEADER_NAME`). Sichtbar wurde das erst über HTTP: Die
   Anwendungstests rufen die Schicht darunter auf, und dort gibt es keinen Proxy.
2. Für diese Routen fehlte überhaupt ein Test der Herkunftsprüfung — der Test,
   der die erste Lücke fand, existierte vorher nicht.
3. Von den vier Ereignissen, die einen Gerätenachweis entwerten, war das Sperren
   des Kontos umgesetzt, aber ungeprüft.

**Verworfene HTML-Vorschau (M5.6).** Die Vorschau zeigte bis dahin eine
HTML-Nachbildung des Belegs. Sie konnte nie stimmen: `@page`-Ränder gelten nur
beim Drucken, am Bildschirm lief der Inhalt randlos über die volle Breite. Seit
M5.6 steht im Rahmen das erzeugte PDF. Folge für die Nachweise: Die
Pflichtangaben FA-PFL-01 bis -11 werden am Satz geprüft, den der Renderer
erhält, nicht an der fertigen Datei — Chromium bettet die Belegschrift als
Teilmenge ein, die Textbytes sind dann Glyphennummern und ohne vollwertigen
PDF-Parser nicht lesbar.

**M8 — Mandanten, Rollen und Verwaltung (umgesetzt, Abnahme offen).** Mehrere
Unternehmen in einer Installation, eigene Rollen je Unternehmen, Mitglieder per
Einladung, eine zentrale Verwaltung ohne Zugriff auf Geschäftsdaten. Der Kern
sind zwei markierte Typen: `Authorized<K>` macht einen fehlenden Rechtecheck zum
Übersetzungsfehler, `PlatformContext` macht „die Verwaltung sieht keine
Rechnungen" zu einer Eigenschaft des Typsystems statt einer Absicht.

**Drei Lücken, die M8 in älterem Code aufgedeckt hat** — keine davon war in einem
Typ oder Test sichtbar:

1. *Der Wächter des Adminbereichs hatte ein Loch.* Er suchte nach
   `client.invoice.<methode>(`, also der direkten Form. `organization.findMany({
   include: { invoices: true } })` geht über ein anderes Delegate, nennt dieselbe
   Beziehung und liefert vollständige Belegzeilen — er hätte es durchgelassen.
   Geprüft wird jetzt zusätzlich über die Beziehungsnamen.
2. *Zahlungen trugen keinen Akteur im Protokoll*, und Korrektur wie Rücknahme
   schrieben überhaupt nichts. Die Aktion `PAYMENT_REMOVED` stand seit M4
   unbenutzt im Katalog — der Hinweis, den niemand gelesen hat (NFA-COMP-01).
3. *Die Integrationstests nannten erfundene Akteure* (`test`, `pruef-akteur`).
   Das ging gut, solange `AuditLog.actorId` keinen Fremdschlüssel trug; mit
   `Invoice.createdById` wurde daraus ein Fehler.

**M7 — Betrieb (umgesetzt, Abnahme offen).** Alle vierzehn Anforderungen sind
belegt: Protokollierung, Healthcheck, Sicherung, Wiederherstellung,
Datenexport, Archivierungshinweise, Offline-Nachweis, Seed-Kommando,
Gesamtpfad-E2E und README.

**Zwei Befunde, die erst der E2E-Durchlauf zutage gefördert hat** — beide an
Stellen, die im Quelltext richtig aussahen:

1. *Das Festschreiben fragte über `window.confirm`.* In M5.8 wurden fünf
   Browserdialoge durch den Dialog der Anwendung ersetzt (FA-UI-17); der
   sechste blieb stehen, weil er nicht in einem Bauteil steckte, sondern in
   einem `onClick` — ausgerechnet an der folgenreichsten Handlung.
   `tests/architecture/design-tokens.test.ts` verbietet `window.confirm`,
   `alert` und `prompt` jetzt.
2. *Der Stempel beim Festschreiben war nie zu sehen.* Er saß im Editor und
   wurde gesetzt, wenn die Aktion `issued` meldete — nur verschwindet der
   Editor mit demselben Durchlauf, weil der Beleg kein Entwurf mehr ist.
   FA-UI-07 galt damit als umgesetzt, ohne es zu sein. Die Aktion leitet jetzt
   auf den Beleg um (`?festgeschrieben=1`), und der Stempel sitzt im
   Seitenkopf, wo die Nummer danach steht.

**Eine geprüfte Ausnahme vom Roh-SQL-Verbot.** NFA-BETR-04 verlangt eine
konsistente Datenbanksicherung, NFA-ARCH-10 verbietet Roh-SQL — für eine
Sicherung aus der Oberfläche heraus (NFA-BETR-05) ziehen beide gegeneinander.
`VACUUM INTO` hat in Prisma keine Entsprechung, und die Alternative, die Datei
im laufenden Betrieb zu kopieren, verbietet NFA-BETR-04 ausdrücklich.
NFA-ARCH-10 spricht von „**ungeprüften**" Aufrufen; die Ausnahme ist deshalb
eng gefasst und wird bewacht:

- Sie liegt in **einer** Datei (`src/infrastructure/db/backup.ts`), nicht in
  der Anwendungsschicht.
- Das Argument stammt nie aus einer Anfrage, sondern aus der Konfiguration
  plus einem Zufallsnamen.
- `tests/architecture/no-raw-sql.test.ts` prüft, dass es bei genau **einem**
  Aufruf bleibt und dass er `VACUUM INTO` lautet.

Bis M7 lief das ausschließlich im Betriebsskript, also außerhalb des
Anwendungscodes — mit der Sicherung per Knopf geht das nicht mehr. Die
Lockerung ist in `CLAUDE.md` und `eslint.config.mjs` festgehalten.

**M6.2 — Anmeldung in zwei Schritten (umgesetzt, Abnahme offen).** Der zweite
Faktor wird auf einer eigenen Seite (`/login/code`) abgefragt, und nur bei
Konten, die einen führen. Anlass: Ein Feld für einen Code, den die meisten
Konten nicht haben, steht bei jeder Anmeldung im Weg.

**Geänderte Festlegung.** Spec §10.1 nannte für `/login` „Passwort + TOTP" auf
**einer** Seite; `login.ts` begründete das ausdrücklich damit, dass so kein
abzusichernder Zwischenzustand entsteht. Beides ist angepasst — die Spec nennt
jetzt beide Routen.

**Was die Aufteilung kostet, ausdrücklich benannt.** Die einstufige Fassung
konnte falsches Passwort und falschen Code *ununterscheidbar* beantworten. Das
geht nicht mehr: Wer den zweiten Schritt zu sehen bekommt, weiß, dass das
Passwort stimmte. Diese Auskunft ist jedem zweistufigen Verfahren eigen und der
Preis dafür, den Code nur dort zu verlangen, wo es ihn gibt. Unverändert
ununterscheidbar bleibt der **erste** Schritt: unbekanntes Konto und falsches
Passwort ergeben dieselbe Antwort und denselben Rechenaufwand (im Test belegt).

**Wie der Zwischenzustand klein gehalten wird:**

| Zusage | Umsetzung |
|---|---|
| Er ist keine Sitzung | eigene Tabelle `PendingLogin`; im Test wird der Nachweis der Sitzungsauflösung vorgelegt und muss unbekannt sein |
| Er verleiht kein Recht | erlaubt genau eine Handlung: den Code nachreichen |
| Er läuft schnell ab | fünf Minuten, danach entfernt |
| Er liegt nur als Hash | SHA-256 wie beim Sitzungstoken (NFA-SEC-06) |
| Er reist nicht mit | Cookie mit `path=/login`, `HttpOnly`, `SameSite=Lax` |
| Er ist nicht doppelt | ein neuer Nachweis verwirft ältere desselben Kontos |
| Die Sperre gilt weiter | jeder falsche Code zählt als Fehlversuch (NFA-SEC-08); ein richtiges Passwort allein setzt den Zähler **nicht** zurück |
| Abschalten wirkt sofort | wird 2FA zwischen den Schritten deaktiviert, gilt der Nachweis nicht mehr |

Nachweis: `tests/integration/two-step-login.test.ts` (15 Prüfungen),
`tests/integration/browser-two-step-login.test.ts` (6 Prüfungen — Cookiepfad,
Umleitungskette und die Codeseite ohne Nachweis).

**M6.1 — Ausführung nachgezogen (umgesetzt, Abnahme offen).** Der Auftraggeber
hat gemeldet, die Anmeldeseite und die Oberfläche insgesamt gefielen ihm nicht.
Die Erkundung lief diesmal am Bild statt am Quelltext: Alle Screens wurden im
echten Chromium aufgenommen und angesehen. Ein Teil der Beanstandung war
**kaputt**, nicht Geschmack:

| Befund | Ursache |
|---|---|
| Das Anmeldeformular war 1400 px breit | `max-w-md` erzeugt keine Regel — `--container-*: initial` löscht die Breitenskala, definiert waren nur `content` und `dialog`. Dasselbe traf `sm:max-w-sm` im Editor und `sm:max-w-lg` auf der Belegseite |
| „Zurück" klebte an der Fensterkante | Die Belegseite hatte einen eigenen Kopf statt `PageHeader`, und `<main>` trägt keinen oberen Innenabstand |
| Auswahlfelder 1140 px breit | Kein Satzmaß an der Eingabe |
| Leere Monate im Diagramm als 1-px-Striche | Ein Mindestbalken von 1 %, den man für eine Achse hält |
| Zwei Beschriftungsstile in einer Filterzeile | `text-label uppercase` neben `text-ui font-medium` |
| Kunden- und Katalogliste sahen anders aus als die Rechnungsliste | Zwei handgeschriebene Tabellen neben `DataTable` |

Das ist derselbe Fehlertyp wie `text-3xl` in M5.8 und wiegt schwerer als
gedacht: Eine gelöschte Skala macht eine Klasse nicht ungültig, sondern
wirkungslos. `tests/architecture/design-tokens.test.ts` prüft jetzt auch
Breiten- und Höhenklassen gegen die gelöschten Skalen.

Drei Festlegungen des Entwurfs sind dabei geändert und dort vermerkt: die
Kennzahl steht in Fira Sans statt Fira Mono (§2.2), das Blatt der Vorschau ist
ein Fenster von 78 % Fensterhöhe statt voller A4-Höhe (§4.3), und Eingabefelder
sind auf 480 px begrenzt (§5). Die Anmeldung bleibt flach ohne Karte — die
Regel aus §1 gilt auch für sie.

**M6 — Übersicht (umgesetzt, Abnahme offen).** Alle elf FA-DASH-IDs und die
beiden Leistungszusagen NFA-QUAL-04/-05 sind belegt. Drei Entscheidungen, die
im Diff nicht von selbst sprechen:

*Gerechnet wird in der Anwendung, nicht in SQL.* `getDashboardMetrics()` liest
**eine** schmale Projektion aller Belege und rechnet darüber. Der naheliegende
Weg — je Kennzahl eine `SUM`-Abfrage — hätte die Frage „was zählt als Umsatz"
in jedem `WHERE` erneut beantwortet und damit genau das erzeugt, was FA-DASH-09
verhindern soll. Der Preis ist eine Größenabhängigkeit, und die ist gemessen
statt behauptet: 22 ms bei 1.000 Belegen, Grenze 1.000 ms.

*Der Bezugstag kommt von außen.* `now` ist ein Parameter. Überfälligkeit,
laufender Monat und die Zwölfmonatsreihe hängen am selben Tag; läse jede
Kennzahl ihre eigene Uhr, könnte eine um Mitternacht geladene Übersicht
denselben Beleg als überfällig **und** als heute fällig ausweisen.

*Der Healthcheck ist von der Übersicht verschwunden.* Er stand dort, wo der
Entwurf (§4.1) Kennzahlen, Diagramm und Fristenlisten vorsieht, und gehört zu
keiner FA-DASH-ID. Die Zusage NFA-BETR-08 verlangt einen **Endpunkt**; den gibt
es unter `/api/health`, und er bleibt unberührt. Verloren geht nichts.

**Überarbeiteter Gestaltungsentwurf (M5.8).** Der Auftraggeber hat gemeldet,
die Oberfläche wirke austauschbar. Bei der Erkundung zeigte sich, dass die
beiden Gesten, die den Entwurf unverwechselbar machen sollten, **nie gebaut
worden waren**: Die Übersicht zeigte statt vier großen Kennzahlen einen
Datenbank-Healthcheck — der Token `--text-metric` kam im gesamten Quelltext
nicht ein einziges Mal vor —, und der Editor war einspaltig, das Blatt lag auf
einer anderen Route darunter. Die Kargheit war also nur zum Teil Absicht.

Auf dieser Grundlage wurde `faktura-frontend-design.md` überarbeitet (§1, §2.3,
§2.4, §3, §4.2, §5, §9) und anschließend gebaut. Die Lockerungen sind benannt
und begrenzt:

| vorher | jetzt |
|---|---|
| Das Blatt ist die **einzige** erhabene Fläche | **drei** Stufen: flach, gehoben, Blatt — die mittlere mit Begründungspflicht, überwacht durch eine Namensliste im Architekturtest |
| Ein Radius (`--radius-control`) | zwei: dazu `--radius-surface` für gehobene Flächen |
| Bewegung: „sonst nichts" | benannter Katalog aus sechs Anlässen, jede Dauer ein Token |
| Navigation ohne Symbole | Symbol **und** Text aus einem Satz; ein Symbol ohne Beschriftung gibt es nicht |
| Basis ist shadcn/ui | gestrichen — die Bauteile sind handgeschrieben und tokengesteuert; die Vorgabe war nie umgesetzt |

Unverändert streng bleiben: keine Farbliterale, keine Tailwind-Standardpalette,
keine `dark:`-Variante im Komponentencode, Fokusring überall, keine externen
Anfragen. Neu hinzu kam eine Prüfung auf Schriftgrößen außerhalb des
Tokensatzes — sie deckte drei Überschriften auf, die seit M5.5b `text-3xl` bzw.
`text-2xl` trugen und damit **gar keine** Regel erzeugten, weil
`--text-*: initial` die Standardskala löscht.

Neue Anforderungen: FA-UI-17 bis FA-UI-20. Geänderte Wortlaute: FA-UI-02, -08,
-12.

**Geänderte Anforderungen (M5.7 — Empfänger ohne Kunde).** Ein Beleg verlangte
bisher zwingend einen Kunden aus den Stammdaten; der Editor verweigerte ohne
Kundendatensatz sogar den Dienst. Wer einmalig an eine Anschrift schreibt, will
dafür keinen Stammdatensatz anlegen. Der Auftraggeber hat die Lockerung
freigegeben; vier Wortlaute in `rechnungs-app-anforderungen.md` und zwei
Abschnitte der Spec (§4 Datenmodell, §10.2 Editor) sind angepasst:

| ID | vorher | jetzt |
|---|---|---|
| FA-RECH-02 | „Bei Auswahl eines Kunden …" | drei Quellen; Vorbelegung nur, sofern ein Kunde gewählt wird |
| FA-RECH-12 | Vollständigkeit „(Kunde, …)" | „(Empfänger mit Name und Anschrift, …)" |
| FA-PFL-01 | „… des Kunden" | „… des Rechnungsempfängers" |
| FA-NUM-08 | „Kundenbezug … nicht änderbar" | „Empfängerbezug … nicht änderbar" |

Was **nicht** gelockert wurde: §14 UStG verlangt Name und Anschrift des
Empfängers, und das bleibt Festschreibbedingung — nur die Quelle ist frei. Ein
freier Anschriftenblock aus einer einzigen Zeile ist ein Name ohne Adresse und
wird abgewiesen. Nachweis: `tests/integration/free-recipient.test.ts`.

**Geänderte Anforderung.** FA-PDF-06 verlangte die Seitenangabe auf *jeder*
Seite. Auf einem einseitigen Beleg ist „Seite 1 von 1“ eine Auskunft ohne
Empfänger; DIN 5008 sieht Seitennummern nur für Folgeblätter vor, und die
verbreiteten Rechnungsprogramme halten es genauso. Der Auftraggeber hat die
Änderung auf „ab Seite 2“ freigegeben; der Wortlaut in
`rechnungs-app-anforderungen.md` ist entsprechend angepasst.

**Einschub M5.5a — Mandantenkontext (umgesetzt, Abnahme offen).** Keine eigene
Anforderungs-ID; verlangt vom Auftraggeber zwischen M5 und M6. Umfang:
`organizationId` auf allen mandantengebundenen Tabellen, eine geseedete
Organisation mit allen Bestandsdaten, zusammengesetzte Eindeutigkeit für
Kunden- und Rechnungsnummer, Repository-Schicht mit Pflichtparameter.
Nachweis: `tests/integration/organization-isolation.test.ts` (13 Prüfungen);
Lint-Nachweis in `tests/architecture/layering.test.ts`. Berührt NFA-ARCH-01
(zusätzliche Regel) und NFA-ARCH-10 (Zugriffspfad verengt).

Prüfbefehl für alle mit „T"/„R" belegten Nachweise: `npm run verify`.
Die mit „M" belegten Nachweise sind unter „Manuell:" mit dem durchgeführten
Szenario benannt.

---

## 1. Einstellungen & Stammdaten

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-STAMM-01 | Firmendaten erfassbar/änderbar | MUSS | T | M2 | abgenommen | `tests/integration/master-data.test.ts`; Formular `/settings/company` |
| FA-STAMM-02 | Steuernummer/USt-IdNr getrennt, eines Pflicht | MUSS | T | M2 | abgenommen | Regel in `src/app/settings/company/actions.ts`; Manuell: Speichern ohne beide Felder wird abgelehnt |
| FA-STAMM-03 | Kleinunternehmer-Flag §19 wirkt auf Steuerermittlung | MUSS | T | M2 | abgenommen | `tests/unit/domain/master-data.test.ts` — `determineTaxScheme` deckt §19, Reverse Charge und Drittland ab |
| FA-STAMM-04 | Bankverbindung mit IBAN-Prüfsumme | MUSS | T | M2 | abgenommen | `tests/unit/domain/master-data.test.ts` — IBAN-Prüfsumme nach ISO 7064, Länge je Land, BIC-Format |
| FA-STAMM-05 | Logo-Upload (PNG/JPG/SVG, ≤2 MB) | MUSS | M | M2 | abgenommen | `tests/integration/master-data.test.ts` (Ablage, Pfadschutz, Skript-SVG abgelehnt); Manuell: Upload und Anzeige im Container geprüft |
| FA-STAMM-06 | Standard-Zahlungsziel/-Steuersatz/-Währung | MUSS | T | M2 | abgenommen | `tests/integration/master-data.test.ts` — Zahlungsziel, Steuersatz und Währung werden gespeichert |
| FA-STAMM-07 | Mehrzeiliger Fußzeilentext | SOLL | M | M2 | abgenommen | Manuell: mehrzeiliges Feld `footerText` unter /settings/company |
| FA-STAMM-08 | Handelsregister und Geschäftsführer optional | SOLL | T | M2 | abgenommen | `tests/integration/master-data.test.ts` — Registergericht und Geschäftsführung werden gespeichert |
| FA-STAMM-09 | Änderungen an Firmendaten im Audit-Log | MUSS | T | M2 | abgenommen | `tests/integration/master-data.test.ts` — CREATED/UPDATED mit geänderten Feldnamen, ohne Bankdaten im Protokoll |
| FA-STAMM-10 | Leistungskatalog pflegbar | SOLL | T | M2 | abgenommen | `tests/integration/master-data.test.ts` — Katalog anlegen, listen, archivieren |

## 2. Kundenverwaltung

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-KUND-01 | Kunden anlegen, bearbeiten, durchsuchen | MUSS | T | M2 | abgenommen | `tests/integration/master-data.test.ts` — Anlegen, Ändern, Suche über Name, Nummer, Ort und E-Mail |
| FA-KUND-02 | Automatische eindeutige Kundennummer je Unternehmen | MUSS | T | M2 | abgenommen | `tests/unit/domain/master-data.test.ts` (Format), `tests/integration/master-data.test.ts` (fortlaufend, auch bei gleichzeitiger Anlage). Seit M8 je Unternehmen: `NumberSequence` trägt `organizationId` |
| FA-KUND-03 | Land als ISO-3166-1-alpha-2 | MUSS | R | M2 | abgenommen | Review: `countryCode` gegen `COUNTRY_CODES` geprüft, Auswahlfeld statt Freitext |
| FA-KUND-04 | USt-IdNr formal je Land geprüft | MUSS | T | M2 | abgenommen | `tests/unit/domain/master-data.test.ts` — Format je Land, Abgleich mit dem gewählten Land, Sonderfall EL/GR |
| FA-KUND-05 | Kundenspezifisches Zahlungsziel überschreibt Standard | MUSS | T | M2 | abgenommen | `tests/unit/domain/master-data.test.ts` (`resolvePaymentTerms`), `tests/integration/master-data.test.ts` (Persistenz) |
| FA-KUND-06 | Archivieren statt Löschen bei vorhandenen Rechnungen | MUSS | T | M2 | abgenommen | `tests/integration/master-data.test.ts` — Archivieren statt Löschen; strengere Auslegung nach Spec §4.1 |
| FA-KUND-07 | Archivierte nicht in Neuauswahl, in Altrechnungen sichtbar | MUSS | T | M2 | abgenommen | `tests/integration/master-data.test.ts` — `listSelectableCustomers` blendet Archivierte aus; Sichtbarkeit in Altrechnungen folgt mit M4 |
| FA-KUND-08 | Kundendetail zeigt zugehörige Rechnungen | MUSS | M | M2 → M4 | abgenommen | Manuell: Kundendetailseite listet alle Belege mit Nummer, Datum, Betrag und Status |
| FA-KUND-09 | Leitweg-ID optional erfassbar | SOLL | T | M2 | abgenommen | `tests/integration/master-data.test.ts` — Leitweg-ID im Kundendatensatz |
| FA-KUND-10 | CSV-Import/-Export für Kunden | KANN | M | M2 | offen | Nicht umgesetzt — Priorität KANN, bewusst zurückgestellt |

## 3. Rechnungserstellung

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-RECH-01 | Entwurf ohne Nummernvergabe speicherbar | MUSS | T | M4 | abgenommen | `tests/integration/invoice-numbering.test.ts` — Entwurf ohne Nummer; Editor unter /invoices/new |
| FA-RECH-02 | Empfänger aus Stammdaten, Feldern oder freiem Block; Kundenauswahl befüllt vor | MUSS | T | M4 | umgesetzt | `tests/integration/free-recipient.test.ts` — alle drei Quellen tragen bis ins Dokument; Manuell: Kundenauswahl im Editor belegt Zahlungsziel und Steuerverfahren vor (`src/app/invoices/editor-data.ts`) |
| FA-RECH-03 | Positionen hinzufügen, löschen, duplizieren, sortieren | MUSS | M | M4 | abgenommen | Manuell: Positionen hinzufügen, löschen, duplizieren; Sortieren per Drag & Drop und über Schaltflächen oben/unten (tastaturbedienbar) |
| FA-RECH-04 | Positionsfelder vollständig | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Bezeichnung, Beschreibung, Menge, Einheit, Preis, Satz je Position |
| FA-RECH-05 | Positionsrabatt in Prozent | SOLL | T | M4 | abgenommen | `tests/unit/domain/invoice-totals.test.ts`, `tests/integration/invoice-lifecycle.test.ts` — Positionsrabatt in Prozent, auch mit Nachkommastellen |
| FA-RECH-06 | Katalog-Autocomplete im Bezeichnungsfeld | SOLL | M | M4 | abgenommen | Manuell: Auswahlfeld „Aus Katalog übernehmen" im Editor füllt die letzte Position |
| FA-RECH-07 | Rechnungs-, Leistungs- und Fälligkeitsdatum erfassbar | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Rechnungs-, Leistungs- und Fälligkeitsdatum als Kalendertage |
| FA-RECH-08 | Fälligkeit aus Datum + Zahlungsziel vorbelegt, überschreibbar | MUSS | T | M4 | abgenommen | Manuell: Fälligkeit wird aus Rechnungsdatum und Zahlungsziel vorbelegt und ist überschreibbar |
| FA-RECH-09 | Einleitungs- und Schlusstext je Rechnung | SOLL | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Einleitungs- und Schlusstext je Beleg |
| FA-RECH-10 | Duplizieren als neuer Entwurf ohne Nummer | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Kopie ohne Nummer, ohne Snapshot, ohne Zahlungen |
| FA-RECH-11 | Entwürfe löschbar, festgeschriebene nicht | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Entwurf löschbar, festgeschriebener Beleg nicht (auch nicht am Use Case vorbei) |
| FA-RECH-12 | Vollständigkeitsprüfung vor Festschreiben blockiert | MUSS | T | M4 | umgesetzt | `tests/unit/domain/invoice-completeness.test.ts`, `tests/integration/invoice-lifecycle.test.ts`, `tests/integration/free-recipient.test.ts` — alle Verstöße gemeinsam gemeldet, Beleg bleibt Entwurf; Empfänger ohne Anschrift wird abgewiesen |
| FA-RECH-13 | Käufer-/Verkäufer-Snapshot beim Festschreiben | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts`, `tests/unit/domain/invoice-snapshot.test.ts` — Käufer- und Verkäuferdaten beim Festschreiben eingefroren |
| FA-RECH-14 | Stammdatenänderung ändert Altrechnungen nicht | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Kundenumzug lässt die Altrechnung unberührt (A6) |
| FA-RECH-15 | Liste filterbar nach Status/Kunde/Zeitraum/Volltext | MUSS | M | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Filter nach Status, Kunde, Zeitraum und Volltext |
| FA-RECH-16 | Liste sortierbar nach Nummer/Datum/Betrag/Fälligkeit | SOLL | M | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Sortierung nach Nummer, Datum, Betrag und Fälligkeit |

## 4. Berechnung & Steuer

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-CALC-01 | Geld ausschließlich Integer in Cent, kein Float | MUSS | R | M3 | abgenommen | Review: `src/domain/money/money.ts`, `quantity.ts` — Cent und skalierte Mengen als Ganzzahlen, Zwischenprodukte über `bigint`; `Decimal` kommt im Schema nicht vor |
| FA-CALC-02 | Positionsnetto kaufmännisch auf Cent gerundet | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-totals.test.ts` — kaufmännisch, symmetrisch zur Null, ein Rundungsschritt je Position |
| FA-CALC-03 | Gruppierung nach Satz+Kategorie, Steuer je Gruppe gerundet | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-totals.test.ts` — drei Positionen zu 3,33 € ergeben je Gruppe 1,90 € statt 1,89 € je Position |
| FA-CALC-04 | Summe der Gruppensteuern = Gesamtsteuer | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-totals.test.ts` — Summe der Gruppensteuern gleich Gesamtsteuer, Netto plus Steuer gleich Brutto |
| FA-CALC-05 | §19: Satz 0, Kategorie E, Pflichthinweis | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-totals.test.ts`, `tests/unit/domain/master-data.test.ts` — §19 setzt sich über Kundenland und USt-IdNr hinweg. **M12:** Der Vorschlag hatte einen Weg daran vorbei — ohne angelegten Kunden stand in `editor-data.ts` ein `'STANDARD'`, gesetzt an `determineTaxScheme()` vorbei; der erste Beleg eines Kleinunternehmers kam mit 19 % vorbelegt. `tests/integration/editor-context.test.ts`, gegen den alten Zweig geprüft |
| FA-CALC-06 | EU-B2B mit USt-IdNr: Kategorie AE, Satz 0, Hinweis | MUSS | T | M3 | abgenommen | `tests/unit/domain/master-data.test.ts` — EU-Kunde mit USt-IdNr ergibt AE mit Satz 0 |
| FA-CALC-07 | Drittland: Kategorie G vorgeschlagen | SOLL | T | M3 | abgenommen | `tests/unit/domain/master-data.test.ts` — CH, US und GB ergeben G |
| FA-CALC-08 | Vorgeschlagene Kategorie je Rechnung überschreibbar | MUSS | T | M3 | abgenommen | `tests/integration/invoice-numbering.test.ts` — Beleg mit abweichendem Verfahren wird übernommen; Feld `Invoice.taxScheme`. **In M12 anders dargestellt, nicht eingeschränkt:** Bei §19 ist die Behandlung festgestellt und die Abweichung ein bewusster Schritt hinter einem `<details>` samt §14c-Hinweis. Überschreibbar bleibt sie — ein Fehlgriff ist sie nicht mehr. `tests/integration/editor-context.test.ts` |
| FA-CALC-09 | Gemischte Steuersätze korrekt und getrennt ausgewiesen | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-totals.test.ts`, `tests/integration/invoice-numbering.test.ts` — 7 % und 19 % getrennt ausgewiesen |
| FA-CALC-10 | Berechnung als reine Funktion ohne DB-Zugriff | MUSS | R | M3 | abgenommen | Review: `src/domain/invoice/totals.ts` ohne Datenbankbezug; `tests/unit/domain/invoice-totals.test.ts` prüft Wiederholbarkeit und Seiteneffektfreiheit |
| FA-CALC-11 | Tests: Rundung, Rabatt, Gruppen, §19, RC, Null, negativ | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-totals.test.ts` — Rundungsgrenzfälle, Rabatte, mehrere Gruppen, §19, Reverse Charge, Nullbeträge, negative Positionen |

## 5. Nummernkreis & Unveränderbarkeit

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-NUM-01 | Format konfigurierbar mit `{YYYY}` `{YY}` `{MM}` `{SEQ:n}` | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-number.test.ts` — alle vier Platzhalter, Mehrfachnutzung, Breitenwachstum |
| FA-NUM-02 | Nummer ausschließlich beim Festschreiben | MUSS | T | M3 | abgenommen | `tests/integration/invoice-numbering.test.ts` — Entwurf ohne Nummer, Vergabe erst beim Festschreiben. Seit M8 gilt der Nummernkreis je Unternehmen — `tests/integration/platform-admin.test.ts` zeigt zwei Mandanten mit derselben ersten Nummer (FA-ORG-05) |
| FA-NUM-03 | Nummer und Statuswechsel in einer Transaktion | MUSS | R | M3 | abgenommen | Review: `issueInvoice` in `src/application/invoices/invoice-service.ts` — Nummer und Statuswechsel in einem `$transaction`-Aufruf |
| FA-NUM-04 | Nebenläufige Festschreibungen ohne Nummernkollision | MUSS | T | M3 | abgenommen | `tests/integration/invoice-numbering.test.ts` — zwölf gleichzeitige Festschreibungen ergeben lückenlos 0001 bis 0012 |
| FA-NUM-05 | Jahreswechsel startet Zähler neu | SOLL | T | M3 | abgenommen | `tests/unit/domain/invoice-number.test.ts`, `tests/integration/invoice-numbering.test.ts` — Jahreswechsel startet neu; Monatszähler nur mit Jahreskomponente |
| FA-NUM-06 | Zählerstand in Einstellungen einsehbar | SOLL | M | M3 | abgenommen | Manuell: `/settings/numbering` zeigt Format, Beispielnummer und Zählerstand je Bereich |
| FA-NUM-07 | Einmaliger manueller Startwert setzbar | SOLL | T | M3 | abgenommen | `tests/integration/invoice-numbering.test.ts` — Startwert setzbar, solange nichts vergeben ist; danach abgelehnt |
| FA-NUM-08 | Festgeschriebene Rechnung über UI nicht änderbar | MUSS | T | M4 | umgesetzt | `tests/integration/invoice-lifecycle.test.ts` — inhaltliche Änderung am festgeschriebenen Beleg abgewiesen; `tests/integration/free-recipient.test.ts` — auch Empfängermodus und Anschriftenblock sind eingefroren |
| FA-NUM-09 | Unveränderbarkeit auch in der Persistenzschicht | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Datenbank-Trigger weisen auch den direkten Schreibzugriff ab, inklusive Rückweg auf Entwurf |
| FA-NUM-10 | PDFs mit SHA-256 gespeichert, nie überschrieben | MUSS | T | M4 → M5 | umgesetzt | `tests/integration/document-output.test.ts` — Artefakt mit SHA-256, unveränderlich per Trigger `InvoiceArtifact_no_update` |

## 6. Status & Zahlungen

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-STAT-01 | Genau ein Status aus fünf definierten Werten | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-status.test.ts` — genau fünf Zustände, kein OVERDUE |
| FA-STAT-02 | Überfälligkeit abgeleitet, nicht persistiert | MUSS | R | M3 | abgenommen | Review: kein Statuswert und keine Spalte für Überfälligkeit; `tests/unit/domain/invoice-status.test.ts` prüft die Ableitung |
| FA-STAT-03 | Zahlungen als Einzeldatensätze | MUSS | T | M3 | abgenommen | `tests/integration/invoice-numbering.test.ts` — Zahlungen als einzelne Datensätze mit Betrag, Kalendertag und Zahlungsart |
| FA-STAT-04 | Teilzahlung → Status Teilbezahlt | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-status.test.ts`, `tests/integration/invoice-numbering.test.ts` |
| FA-STAT-05 | Zahlungssumme ≥ Brutto → Status Bezahlt | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-status.test.ts`, `tests/integration/invoice-numbering.test.ts` — auch bei Überzahlung und Bruttobetrag null |
| FA-STAT-06 | Schnellaktion „als vollständig bezahlt markieren" | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Schnellaktion erfasst den Restbetrag, nicht den Gesamtbetrag |
| FA-STAT-07 | Zahlungen korrigier-/stornierbar, Status neu abgeleitet | SOLL | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Zahlung korrigierbar und zurücknehmbar, Status wird neu abgeleitet |
| FA-STAT-08 | Storno erzeugt eigenständiges Dokument mit Bezug | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Stornodokument mit eigener Nummer und Bezug, positive Beträge |
| FA-STAT-09 | Original wechselt auf Storniert, bleibt erhalten | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Original wechselt auf storniert und bleibt vollständig erhalten |
| FA-STAT-10 | Storno auch nach vollständiger Bezahlung | SOLL | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Storno auch nach vollständiger Bezahlung |
| FA-STAT-11 | Jeder Statuswechsel im Audit-Log | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — CREATED, ISSUED, PAYMENT_RECORDED, PAID, CANCELLED im Protokoll |

## 7. Vorlagen

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-TPL-01 | Vorlage aus Liquid-HTML + CSS, als Datei oder ZIP | MUSS | M | M5 | umgesetzt | `tests/unit/domain/template-upload.test.ts`; Upload in `src/app/settings/templates/actions.ts` — einzelne .html/.css oder ZIP mit `template.html` und `style.css` |
| FA-TPL-02 | Mehrere Vorlagen, eine als Standard | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts`; partieller eindeutiger Index `Template_one_default_per_organization` erzwingt genau eine Standardvorlage |
| FA-TPL-03 | Abweichende Vorlage je Rechnung wählbar | SOLL | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — Beleg mit eigener Vorlage wird darin gesetzt, samt deren Rändern |
| FA-TPL-04 | Editor im Browser mit Highlighting und Live-Vorschau | SOLL | M | M5 | offen | Live-Vorschau umgesetzt (`src/app/settings/templates/template-forms.tsx`, Aktualisierung nach Eingabepause). **Syntaxhervorhebung fehlt**: Monaco brächte mehrere Megabyte in das Client-Bündel für einen selten benutzten Editor — bewusst zurückgestellt |
| FA-TPL-05 | DIN-5008-konforme Standardvorlage, Erststart-Import | MUSS | M | M5 | umgesetzt | `tests/integration/document-output.test.ts`; Vorlage in `src/infrastructure/templates/default-template.ts`, angelegt beim ersten Bedarf |
| FA-TPL-06 | Template-Variablen in der UI dokumentiert | MUSS | M | M5 | umgesetzt | `tests/unit/domain/template-variables.test.ts` — die Referenz wird gegen den tatsächlichen Gültigkeitsbereich der Engine geprüft; angezeigt unter `/settings/templates/[id]` |
| FA-TPL-07 | Syntaxfehler → verständliche Meldung, kein Absturz | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts`, `tests/integration/rendering.test.ts` — Ergebniswert mit Meldung und Zeilenangabe statt Ausnahme |
| FA-TPL-08 | Seitenränder und -format je Vorlage konfigurierbar | SOLL | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — Ränder der Vorlage landen in den `@page`-Angaben |
| FA-TPL-09 | Vorlagenänderung verändert erzeugte PDFs nicht | MUSS | T | M5, verschärft in M12 | umgesetzt | `tests/integration/document-output.test.ts` — nach vollständigem Austausch der Vorlage liefert der Abruf denselben Hash und dieselben Bytes. **Bis M12 galt das nur für einen Beleg, den jemand schon einmal abgerufen hatte:** Das PDF entstand beim ersten Abruf. Ein eigener Fall prüft jetzt den ungelesenen Beleg |
| FA-TPL-10 | Logo des Unternehmens im Briefkopf | MUSS | T | M11 | umgesetzt | `DocumentSeller.logo` als `data:`-URI, aufgelöst in `build-invoice-document.ts`; die Kennung liegt im `SellerSnapshot`. Gelesen über die Repository-Schicht statt über `getAsset()` — jene verlangt `companyProfile.read`, und ein Logo auf dem Beleg ist für jeden sichtbar, der den Beleg sieht. Fehlende Datei: kein Logo, kein Fehler |
| FA-TPL-11 | Briefpapier je Unternehmen, nur Gestaltung | SOLL | T | M12 | umgesetzt | `tests/unit/domain/pdf-upload.test.ts`, `tests/unit/infrastructure/letterhead.test.ts`, `tests/integration/letterhead.test.ts`. Nachbearbeiter `letterheadBackground(bytes)`, je Beleg als Abschluss gebaut — der Vertrag `process(pdf)` kennt keinen Zusammenhang, das Briefpapier hängt am Unternehmen. **Die Reihenfolge ist zweimal entscheidend:** in der Kette vor dem Seitenstempel, innerhalb der Seite vor dem Satz (`drawPage` hängt hinten an, also *über* den Beleg). Geprüft über die Reihenfolge der Inhaltsströme statt über ein Bild |

## 8. PDF-Ausgabe

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-PDF-01 | Festgeschriebene Rechnung als PDF herunterladbar | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts`; Route `/api/invoices/[id]/pdf` |
| FA-PDF-02 | Vorschau des Belegs, aktualisiert nach Eingabepause | MUSS | T | M5 | umgesetzt | `tests/integration/browser-preview.test.ts` — im Rahmen steht seit M5.6 das erzeugte PDF selbst, nicht mehr eine HTML-Nachbildung; `tests/integration/document-output.test.ts`. **M12:** Die Vorschau gehört jetzt der Anwendung — `PdfViewer` setzt das PDF selbst auf eine Leinwand, mit eigener Leiste aus `de.ts`; der eingebaute Betrachter des Browsers kannte weder Tokens noch dunkles Schema. Und sie erneuert sich nach dem Speichern: Ein `<iframe>` mit derselben Adresse lädt nicht neu, gleich wie oft React rendert. `tests/integration/browser-invoice-preview.test.ts` — gemessen an den Abrufen der PDF-Route, nicht an einem Attribut |
| FA-PDF-03 | Entwurf als Vorschau-PDF, sichtbar gekennzeichnet | SOLL | M | M5 | umgesetzt | `tests/integration/document-output.test.ts` — Entwurfsvermerk im Blattkopf, nach dem Festschreiben nicht mehr |
| FA-PDF-04 | ≥60 Positionen brechen ohne Verlust über Seiten um | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — 60 Positionen, alle enthalten, mehrseitiges PDF |
| FA-PDF-05 | Tabellenkopf wiederholt sich auf Folgeseiten | MUSS | M | M5 | umgesetzt | `display: table-header-group` in der Standardvorlage; Manuell: Tabellenkopf auf Folgeseiten |
| FA-PDF-06 | Seitenangabe „Seite X von Y“ ab Seite 2 | MUSS | T | M5 | umgesetzt | `tests/unit/domain/page-numbering.test.ts`, `tests/unit/infrastructure/page-number-stamp.test.ts`, `tests/integration/document-output.test.ts` — einseitiger Beleg ohne Angabe, mehrseitiger ab Seite 2 |
| FA-PDF-07 | Summenblock nicht durch Seitenumbruch getrennt | SOLL | M | M5 | umgesetzt | `break-inside: avoid` auf Summenblock und Positionszeilen; Manuell: Summenblock bleibt zusammen |
| FA-PDF-08 | Anschriftfeld im Fensterumschlag DIN lang sichtbar | MUSS | M | M5 | umgesetzt | Anschriftfeld 85 × 45 mm ab 45 mm Blattoberkante (DIN 5008 Form B); Manuell: Sichtprüfung im Fensterumschlag DIN lang |
| FA-PDF-09 | Konfigurierbares Dateinamenmuster | SOLL | T | M5 | umgesetzt | `tests/unit/domain/template-upload.test.ts` (Muster und Filterung); einstellbar unter Einstellungen › Nummernkreis |
| FA-PDF-10 | Rendering 10 Positionen unter 3 s | SOLL | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — 10 Positionen unter 3 s bei laufendem Browser |
| FA-PDF-11 | Fehlgeschlagenes Rendering hinterlässt keine Datei | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — kaputte Vorlage hinterlässt weder Artefakt noch Datei; Schreiben über Zwischendatei und `rename` |
| FA-PDF-12 | Blattfuß am Fuß jeder Seite, Platz freigehalten | MUSS | T | M11 | umgesetzt | Fußgruppe einer Seitentabelle (`display: table-footer-group`) plus Mindesthöhe von 250 mm. **Zwei Anläufe davor gescheitert:** `position: fixed` erschien auf jeder Seite, hielt aber keinen Platz frei — die Positionszeilen liefen mitten durch den Fuß; ein negatives `bottom` schnitt ihn an der Blattkante ab. Beides erst am zweiseitigen PDF sichtbar. `tests/integration/rendering.test.ts` |
| FA-PDF-13 | PDF entsteht beim Festschreiben; Ersatz ist gekennzeichnet | MUSS | T | M12 | umgesetzt | `tests/integration/document-output.test.ts` — Artefakt liegt vor, ohne dass jemand es abgerufen hat; Vorlagenänderung am ungelesenen Beleg ändert nichts; gelöschte Datei ergibt `origin: 'substitute'` statt einer stillen Neusetzung. Ein Fehlschlag beim Setzen wirft das Festschreiben nicht um — die Nummer ist vergeben. **Nebenwirkung, die die ganze Suite lahmlegte:** Wer festschreibt, startet einen Browser; `seed-user.ts` ließ ihn offen und der `execFileSync` der Testvorbereitung wartete für immer |

## 9. Pflichtangaben auf dem Dokument

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-PFL-01 | Name und Anschrift beider Parteien | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts`; `tests/integration/free-recipient.test.ts` — Pflicht gilt in allen drei Empfängerquellen |
| FA-PFL-02 | Steuernummer oder USt-IdNr des Ausstellers | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` |
| FA-PFL-03 | Ausstellungsdatum | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` |
| FA-PFL-04 | Fortlaufende Rechnungsnummer | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` |
| FA-PFL-05 | Menge und Art der Leistung je Position | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` |
| FA-PFL-06 | Zeitpunkt bzw. Zeitraum der Leistung | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` |
| FA-PFL-07 | Entgelt nach Steuersätzen aufgeschlüsselt | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` |
| FA-PFL-08 | Steuersatz und -betrag bzw. Befreiungshinweis | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` |
| FA-PFL-09 | Reverse Charge: beide USt-IdNr + Hinweis | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — beide USt-IdNr und der Hinweis auf die Steuerschuldnerschaft |
| FA-PFL-10 | Bankverbindung und Zahlungsziel | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — Bankverbindung und Zahlungsziel |
| FA-PFL-11 | Stornodokument bezeichnet und mit Bezugsnummer | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — Stornodokument mit Bezugsnummer |
| FA-PFL-12 | Steuernummer **oder** USt-IdNr auf dem Beleg | MUSS | T | M11 | umgesetzt | `tests/integration/document-output.test.ts`. Der Bestandstest verlangte **beide** und war damit strenger als §14 Abs. 4 Nr. 2 UStG; er ist auf die Zusage gezogen |
| FA-PFL-13 | Bei §19 keine Umsatzsteuer auf dem Beleg | MUSS | T | M11 | umgesetzt | `documentShowsTax()` in `invoice-document.ts`, ausgewertet über das Kennzeichen aus dem Snapshot — nicht in der Vorlage, die jedes Unternehmen ändern kann. Ausgenommen ist nur §19: Bei Reverse Charge und Ausfuhr ist die Null selbst die Auskunft. `tests/integration/rendering.test.ts` (ohne Steuer, mit Steuer als Gegenprobe, Spaltenzahl von Kopf und Rumpf) |

## 10. Dashboard

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-DASH-01 | Offener Gesamtbetrag | MUSS | T | M6 | umgesetzt | `tests/unit/domain/dashboard-metrics.test.ts`, `tests/integration/dashboard.test.ts` — Brutto minus Gezahltes über alle offenen Belege; Teilzahlungen mindern den Betrag |
| FA-DASH-02 | Überfälliger Betrag und Anzahl | MUSS | T | M6 | umgesetzt | `tests/unit/domain/dashboard-metrics.test.ts`, `tests/integration/dashboard.test.ts` — der überfällige Betrag ist ein Teil des offenen, kein zweiter Topf; am Fälligkeitstag noch nicht überfällig |
| FA-DASH-03 | Umsatz laufender Monat und laufendes Jahr | MUSS | T | M6 | umgesetzt | `tests/unit/domain/dashboard-metrics.test.ts`, `tests/integration/dashboard.test.ts` |
| FA-DASH-04 | Stornos und Entwürfe fließen nicht in den Umsatz | MUSS | T | M6 | umgesetzt | `tests/unit/domain/invoice-status.test.ts` — `countsTowardRevenue`; `tests/unit/domain/dashboard-metrics.test.ts`, `tests/integration/dashboard.test.ts` — Entwurf, Storno und Gutschrift lassen jede Kennzahl auf null |
| FA-DASH-05 | Diagramm Umsatz je Monat über 12 Monate | MUSS | M | M6 | umgesetzt | `src/ui/components/revenue-chart.tsx`; `tests/unit/domain/dashboard-metrics.test.ts`, `tests/integration/dashboard.test.ts` — rollierendes Fenster, Monate ohne Umsatz mit Null statt Lücke, Übertrag über die Jahresgrenze geprüft |
| FA-DASH-06 | Liste überfälliger Rechnungen nach Dauer sortiert | MUSS | M | M6 | umgesetzt | `tests/unit/domain/dashboard-metrics.test.ts`, `tests/integration/dashboard.test.ts` — längste Dauer zuerst, Tage am Eintrag benannt |
| FA-DASH-07 | Liste der in 14 Tagen fälligen Rechnungen | SOLL | M | M6 | umgesetzt | `tests/unit/domain/dashboard-metrics.test.ts`, `tests/integration/dashboard.test.ts` — heute fällige zählen mit, ein Tag jenseits der Frist nicht |
| FA-DASH-08 | Zuletzt bearbeitete Rechnungen mit Status | SOLL | M | M6 | umgesetzt | `tests/integration/dashboard.test.ts` — höchstens zehn, nach Bearbeitung absteigend; Statusfeld aus `src/ui/components/status-field.tsx` |
| FA-DASH-09 | Alle Kennzahlen aus einer zentralen Funktion | MUSS | R | M6 | umgesetzt | `src/application/dashboard/dashboard-metrics.ts` — eine Funktion, ein Zeitpunkt, **eine** Abfrage; die Seite rechnet nichts, sie ordnet an. Review: `src/app/page.tsx` enthält keine Summenbildung |
| FA-DASH-10 | Umsätze auf Nettobasis, im UI beschriftet | MUSS | M | M6 | umgesetzt | `tests/unit/domain/dashboard-metrics.test.ts` — `netRevenueIn` summiert Nettobeträge; Kachel trägt „netto", Diagramm und Top-Kunden tragen ihre Bezugsgröße am Abschnitt |
| FA-DASH-11 | Umsatzstärkste Kunden des laufenden Jahres | KANN | M | M6 | umgesetzt | `tests/unit/domain/dashboard-metrics.test.ts`, `tests/integration/dashboard.test.ts` — gruppiert über den Anzeigenamen, damit Empfänger ohne Kundendatensatz (M5.7) nicht aus der Auswertung fallen |

## 11. Sicherheit

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-SEC-01 | Ohne Session liefert jede Route 401/403, Test über alle Routen | MUSS | T | M1 | abgenommen | `tests/integration/route-protection.test.ts` — läuft jede Route des Verzeichnisses ohne Sitzung gegen den gebauten Server |
| NFA-SEC-02 | Keine öffentliche Registrierung; Konten entstehen per Einladung | MUSS | T | M8 | umgesetzt | Keine Registrierungsroute in `src/routes.ts`. Seit M8 entsteht ein Konto ausschließlich über eine Einladung der Rechteverwaltung (`src/application/members/invitation-service.ts`); `scripts/create-user.ts` bleibt der Notfallweg von der Kommandozeile. Nachweis: `tests/integration/membership.test.ts` (29) |
| NFA-SEC-03 | Argon2id ≥64 MB, ≥3 Iterationen | MUSS | R | M1 | abgenommen | `tests/unit/infrastructure/security.test.ts` — prüft `m=65536,t=3,p=1` im erzeugten Hash |
| NFA-SEC-04 | Passwort ≥12 Zeichen, Abgleich Kompromittierungsliste | MUSS | T | M1 | abgenommen | `tests/unit/domain/auth-policies.test.ts`, `tests/unit/infrastructure/security.test.ts`; Liste in `resources/compromised-passwords.txt` (100.000 Einträge, offline) |
| NFA-SEC-05 | TOTP-2FA mit einmalig anzeigbaren Recovery-Codes | MUSS | M | M1 | umgesetzt | Manuell: TOTP unter /settings/security eingerichtet, QR-Code gescannt, Codes einmalig angezeigt · `tests/unit/domain/auth-policies.test.ts`; seit M6.2 zweistufig: `tests/integration/two-step-login.test.ts`, `tests/integration/browser-two-step-login.test.ts` |
| NFA-SEC-06 | Session-Token ≥256 Bit, nur Hash in der DB | MUSS | R | M1 | abgenommen | `tests/unit/infrastructure/security.test.ts` — 256 Bit, nur SHA-256-Hash in der Datenbank |
| NFA-SEC-07 | Cookie HttpOnly/Secure/SameSite=Lax, Rotation bei Login | MUSS | T | M1 | abgenommen | `tests/integration/route-protection.test.ts` (Attribute + Rotation), `tests/unit/infrastructure/security.test.ts` (Secure) |
| NFA-SEC-08 | Sperre 15 min nach 10 Fehlversuchen, protokolliert | MUSS | T | M1 | umgesetzt | `tests/integration/route-protection.test.ts` — Sperre nach 10 Versuchen, Audit-Einträge; `tests/integration/two-step-login.test.ts` — die Sperre zählt seit M6.2 auch im zweiten Schritt weiter |
| NFA-SEC-09 | Aktive Sessions einsehbar und beendbar | SOLL | M | M1 | abgenommen | Manuell: Sitzungsübersicht unter /settings/security, einzeln und gesammelt beendbar |
| NFA-SEC-10 | CSRF-Schutz für alle schreibenden Aktionen | MUSS | T | M1 | abgenommen | `tests/integration/route-protection.test.ts` — ohne Token, fremde Herkunft, falsches Token |
| NFA-SEC-11 | Serverseitige Schemavalidierung aller Eingaben | MUSS | R | M1 | abgenommen | Zod-Schemata in `src/app/login/actions.ts`, `src/app/settings/security/actions.ts`, `src/infrastructure/config/env.ts` |
| NFA-SEC-12 | Renderer ohne Netzwerkzugriff, nachgewiesen | MUSS | T | M5 | umgesetzt | `playwright-renderer.ts` — `offline: true` **und** `page.route('**/*')` mit `route.abort('blockedbyclient')`. `tests/integration/rendering.test.ts` setzt einen Beleg mit zwei `<img>` auf fremde Adressen und prüft, dass **beide** blockiert wurden; ein `data:`-URI kommt weiterhin durch, sonst fehlten Schrift und Logo |
| NFA-SEC-13 | JavaScript im Rendering-Kontext deaktiviert | MUSS | R | M5 | umgesetzt | `javaScriptEnabled: false` an **beiden** Stellen, an denen ein Kontext entsteht (`playwright-renderer.ts`). Ein Beleg ist Satz, kein Programm |
| NFA-SEC-14 | Rendering-Timeout (Standard 15 s) bricht kontrolliert ab | MUSS | T | M5 | umgesetzt | `page.setDefaultTimeout(options.timeoutMs)` und dieselbe Grenze an `setContent`; ein Zeitablauf wird als `{ kind: 'TIMEOUT' }` zurückgegeben, nicht geworfen. `tests/integration/rendering.test.ts` |
| NFA-SEC-15 | Uploads: Größe, MIME, Magic Bytes, ZIP-Slip-Schutz | MUSS | T | M5 | umgesetzt | `tests/unit/domain/template-upload.test.ts` — ZIP-Slip, Magic Bytes, Größenlimit, strenges UTF-8 |
| NFA-SEC-16 | Uploads außerhalb des Webroots, nur authentifiziert | MUSS | T | M5 | umgesetzt | `asset-store.ts` legt unter `STORAGE_DIR/assets` ab, außerhalb von `public/`; `resolveInside()` weist jeden Pfad ab, der das Verzeichnis verlässt. `/api/assets/[id]` verlangt Sitzung und Recht (`getOptionalSession` + `authorizeRequest`) |
| NFA-SEC-17 | CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy | MUSS | R | M1 | abgenommen | `tests/unit/infrastructure/security.test.ts`, `tests/integration/route-protection.test.ts` |
| NFA-SEC-18 | Fehlermeldungen ohne Stacktrace/Pfade/SQL | MUSS | R | M1 | abgenommen | Review: generische Meldungen in `login.ts`; Healthcheck ohne Details; Ursachen nur im Serverlog |
| NFA-SEC-19 | Bindung nur an 127.0.0.1, TLS im Reverse Proxy | MUSS | R | M1 | abgenommen | Review: `docker-compose.yml` ohne `ports` am App-Dienst; TLS in `Caddyfile` |
| NFA-SEC-20 | Container läuft nicht als Root | MUSS | R | M1 | abgenommen | Manuell: `docker compose exec app id` → uid=1000(node) |
| NFA-SEC-21 | Keine Secrets im Repo oder Image | MUSS | R | M1 | abgenommen | Review: `.gitignore` und `.dockerignore` schließen `.env` aus; Konfiguration nur über ENV |
| NFA-SEC-22 † | Automatisierte Abhängigkeitsprüfung blockiert Build | SOLL | R | M0 † | abgenommen | `.github/workflows/ci.yml`, `npm run audit` (`--audit-level=high`) |

## 12. Datenschutz & Nachvollziehbarkeit

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-COMP-01 | Änderungen an Rechnungen/Kunden/Firma protokolliert, mit Akteur | MUSS | T | M8 | umgesetzt | `tests/integration/invoice-lifecycle.test.ts`, `tests/integration/master-data.test.ts`. In M8/B6 wurden drei Lücken geschlossen: Festschreiben und Stornieren verloren den Akteur in einem `void actorId;`, Zahlungen trugen keinen, und Korrektur wie Rücknahme einer Zahlung schrieben gar nichts — `PAYMENT_REMOVED` stand seit M4 unbenutzt im Katalog. Handlungen des Betreibers tragen `actorKind: 'ADMIN'` |
| NFA-COMP-02 | Audit-Log über die Anwendung nicht änder-/löschbar | MUSS | R | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Prisma-Erweiterung und Datenbank-Trigger weisen Ändern und Löschen ab |
| NFA-COMP-03 | Vollständiger Datenexport je Unternehmen, maschinenlesbar | MUSS | T | M8 | umgesetzt | `/settings/export` → `/api/export`; `src/application/export/export-data.ts` — Kunden, Belege mit Positionen und Zahlungen, Vorlagen, Nummernkreise und das Protokoll als JSON. Zugangsdaten bewusst nicht enthalten. Seit M8 an das Recht `export.run` gebunden und auf den eigenen Mandanten beschränkt; `tests/integration/permissions.test.ts` prüft die Ablehnung über HTTP |
| NFA-COMP-04 | UI erklärt Archivierung statt Löschung | SOLL | M | M7 | umgesetzt | Kundenseite (`archiveExplanation`), Katalogseite und Belegseite (`noDeleteExplanation`) — jeweils dort, wo jemand zu löschen versucht, nicht in einer Hilfeseite |
| NFA-COMP-05 | Keine Datenübertragung an Dritte; offline außer zum benannten Mailserver | MUSS | T | M14 | umgesetzt | **In M14 verengt, nicht gestrichen:** genau eine ausgehende Verbindung, zu einem Server aus `SMTP_URL`. Ohne diese Konfiguration verhält sich alles wie vorher — `tests/integration/mailer.test.ts` prüft beide Seiten gegen einen echten SMTP-Empfänger. `tests/architecture/offline.test.ts` trägt dafür eine **benannte** Ausnahme (`infrastructure/mail/**`) und prüft zusätzlich, dass kein anderes Modul nach außen greift; `tests/integration/rendering.test.ts` weist die Blockade im Renderer nach (NFA-SEC-12) |
| NFA-COMP-06 | Keine externen Fonts, Skripte, Analysedienste | MUSS | R | M7 | umgesetzt | `tests/architecture/design-tokens.test.ts` — Schriften aus dem Paket, keine externe Adresse im Frontend |
| NFA-COMP-07 | Impressum des Betreibers, öffentlich erreichbar | MUSS | T | M13 | umgesetzt | `tests/integration/legal-notices.test.ts`, `tests/integration/browser-legal.test.ts`. Genau eines je Installation in `PlatformSettings` (feste Kennung `platform` statt CHECK-Bedingung). **Umkehrung der Regel für Logo und Briefpapier:** Die gehören dem Mandanten, weil der Beleg sein Dokument ist — das Telemedium bietet der Betreiber an. Ohne hinterlegten Inhalt: 404 und kein Link |
| NFA-COMP-08 | Datenschutzhinweise mit Zweck und Aufbewahrung | MUSS | T | M13 | umgesetzt | `tests/unit/domain/privacy-notice.test.ts` — die Fristen sind **Verweise auf die Konstanten** der Domäne, nicht Zahlen im Text; gegen eine geänderte Konstante gegengeprüft. `domain/legal/privacy-notice.ts` |
| NFA-COMP-09 | Hinterlegter Text wird als Text gesetzt, nie als Markup | MUSS | T | M13 | umgesetzt | `LegalText` setzt Absätze aus Leerzeilen; kein `dangerouslySetInnerHTML`. Es ist die einzige Stelle, an der fremder Inhalt öffentlich erscheint — Szenario A19 prüft ein hinterlegtes `<script>` |

## 13. Betrieb

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-BETR-01 | Start über `docker compose up` inkl. Migration | MUSS | M | M0 | abgenommen | Manuell: `docker compose up -d --build` auf leerem Datenstand — Migration `20260810105328_init_audit_log` angewandt, Container `healthy`, `GET /api/health` → 200 |
| NFA-BETR-02 | Konfiguration nur über ENV, vollständige `.env.example` | MUSS | R | M0 | abgenommen | `.env.example`, `src/infrastructure/config/env.ts` (Zod-Schema, Abbruch beim Start) |
| NFA-BETR-03 | Täglicher Backup-Job für DB und Dateispeicher | MUSS | M | M7 | umgesetzt | `scripts/backup.ts` (`npm run backup`) — legt das Archiv in `BACKUP_DIR` ab und räumt nach `BACKUP_KEEP_DAYS` auf; `tests/integration/backup.test.ts`. Die Zeitsteuerung gehört bewusst dem Server, nicht der Anwendung |
| NFA-BETR-04 | Konsistente DB-Sicherung, kein einfaches Kopieren | MUSS | R | M7 | umgesetzt | `src/infrastructure/db/backup.ts` — `VACUUM INTO`; `tests/integration/backup.test.ts` sichert nebenläufig zu laufenden Abfragen und öffnet den Abzug danach |
| NFA-BETR-05 | Backup manuell auslösbar und herunterladbar | SOLL | T | M7 | umgesetzt | Seit M8 in der Verwaltung: `/admin/api/backup` mit `platformAdmin`-Zugriff; `tests/integration/backup.test.ts`, `tests/integration/route-protection.test.ts` (drei Anfragen je Adminroute) |
| NFA-BETR-06 | Wiederherstellung dokumentiert und einmal durchgeführt | MUSS | M | M7 | umgesetzt | Schritte auf `/settings/backup`; `tests/integration/backup.test.ts` packt das Archiv mit dem `tar` des Systems aus und öffnet die Datenbank daraus. Manuell im Container steht noch aus |
| NFA-BETR-07 | Nach Restore alle Daten und PDFs vollständig | MUSS | M | M7 | umgesetzt | `tests/integration/backup.test.ts` — Beleg, Nummer und Status stimmen, das PDF ist Byte für Byte dasselbe und der Artefakt-Hash unverändert |
| NFA-BETR-08 | Healthcheck prüft DB und Renderer | MUSS | T | M7 | umgesetzt | `tests/integration/health.test.ts` — beide Bestandteile, Renderer durch echten Browserstart; Anzeige unter `/settings/security`, Antwort ohne Details (NFA-SEC-18) |
| NFA-BETR-09 | Strukturierte Logs auf stdout, Sicherheitsereignisse erkennbar | MUSS | R | M7 | umgesetzt | `src/infrastructure/logging/logger.ts`; `tests/unit/infrastructure/logging.test.ts` — eine Zeile je Ereignis als JSON, `category: 'security'` als Feld. `tests/architecture/design-tokens.test.ts` verbietet `console` in `src/` |
| NFA-BETR-10 | Keine Passwörter, Token, Kundendatensätze in Logs | MUSS | R | M7 | umgesetzt | `tests/unit/infrastructure/logging.test.ts` — die Entfernung sitzt im Schreibweg, nicht in der Disziplin der Aufrufer; lange Zeichenketten werden gekürzt, tiefe Objekte abgeschnitten |
| NFA-BETR-11 | README: Installation, Konfiguration, Backup, Restore, Update | MUSS | R | M7 | umgesetzt | `README.md` — Sicherung (Oberfläche, Auftrag, cron), Wiederherstellung in sechs Schritten mit Prüfung, Datenexport, Update mit vorheriger Sicherung, Logs mit `jq`-Beispielen |
| NFA-BETR-12 | Versand optional; ein Fehlschlag bricht keine Handlung ab | MUSS | T | M14 | umgesetzt | `src/infrastructure/mail/mailer.ts` — zehn Sekunden für Verbindung, Begrüßung und Übergabe; „nicht eingerichtet" und „abgelehnt" sind Rückgabewerte, keine Ausnahmen. Eine **leere** Variable gilt dabei als nicht eingerichtet und nicht als ungültig (`leerIstUnkonfiguriert` in `env.ts`); die Integrationstests setzen beide Werte auf leer, nachdem ein Lauf mit ausgefüllter `.env` echte Post an erfundene Adressen verschickt hatte. `tests/integration/mailer.test.ts` prüft den Fehlschlag gegen einen Port, an dem nichts lauscht; `tests/unit/domain/mail-texts.test.ts` den Wortlaut |

## 14. Architektur & Erweiterbarkeit

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-ARCH-01 | Domain ohne Persistenz-/UI-/Framework-Importe, Lint erzwingt | MUSS | T | M0 | abgenommen | `tests/architecture/layering.test.ts` — seit M5.5a zusätzlich: Prisma-Client nur aus `src/infrastructure/repositories/**` |
| NFA-ARCH-02 | Ausgabeneutrales Dokumentmodell | MUSS | R | M5 | umgesetzt | `src/domain/document/invoice-document.ts` — 75 Felder, keine Kenntnis von HTML, Liquid oder PDF. Seit M15 steht `reminder-document.ts` daneben und benutzt dieselben Partei-Typen |
| NFA-ARCH-03 | Dokumentmodell enthält alle Felder aus Spec §9.2 | MUSS | T | M5 | umgesetzt | Die BT-Nummern stehen als Kommentar am jeweiligen Feld (BT-1, -2, -5, -9, -13, -72 …). `tests/integration/document-output.test.ts` und `rendering.test.ts` setzen das Modell vollständig |
| NFA-ARCH-04 | Einheiten als UN/ECE-Rec-20-Codes, Labels erst in der Anzeige | MUSS | T | M5 | umgesetzt | `src/domain/codes/unit-code.ts` (`C62`, `HUR`, …); die deutschen Labels entstehen in `src/ui/format.ts`. `tests/unit/domain/codes.test.ts` |
| NFA-ARCH-05 | Steuerkategorien als UNTDID-5305-Codes | MUSS | T | M5 | umgesetzt | `src/domain/codes/tax-category.ts` (`S`, `AE`, `E`, `G`, `K`, `Z`). `tests/unit/domain/codes.test.ts` |
| NFA-ARCH-06 | Konfigurierbare PDF-Nachbearbeitungskette, Testprozessor wirkt | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — Reihenfolge, Durchreichen des Fehlers, leere Kette in V1 |
| NFA-ARCH-07 | Template-Engine und Renderer hinter Schnittstellen | MUSS | R | M5 | umgesetzt | `src/domain/rendering/contracts.ts` — `TemplateEngine`, `PdfRenderer`, `PdfPostProcessor`, seit M15 zusätzlich `ReminderTemplateEngine`. Reine Typen; LiquidJS und Playwright sind austauschbar, ohne dass aufrufender Code sich ändert |
| NFA-ARCH-08 † | Statusänderungen erzeugen Domain-Events | SOLL | T | M4 † | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — zusätzlicher Handler ohne Änderung der Kernlogik; ein fehlschlagender Handler kippt den Vorgang nicht |
| NFA-ARCH-09 † | Dokumenttyp als Enum modelliert | SOLL | R | M0 † | abgenommen | `src/domain/document/document-type.ts`, `tests/unit/domain/codes.test.ts` |
| NFA-ARCH-10 | DB-Zugriff nur über ORM, kein ungeprüftes Roh-SQL | MUSS | R | M0 | abgenommen | `tests/architecture/no-raw-sql.test.ts` (Lint-Regel + Quellcode-Scan); seit M5.5a führt jeder Zugriff zusätzlich über die Repository-Schicht |

## 15. Qualität, Performance & Bedienung

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-QUAL-01 | Domain-Testabdeckung ≥90 % | MUSS | T | M3 | abgenommen | `npm run test:coverage` — Domain-Schicht 100 % Statements, Functions und Lines bei einer Schwelle von 90 % |
| NFA-QUAL-02 | E2E über den kritischen Gesamtpfad | MUSS | T | M7 | umgesetzt | `tests/integration/e2e-invoice-lifecycle.test.ts` — Anmelden, Kunde anlegen, Rechnung erstellen, festschreiben, PDF laden, Zahlung erfassen, stornieren; ein Durchlauf in fester Reihenfolge |
| NFA-QUAL-03 | Build bricht bei TS-/Lint-Fehlern, kein `any` in der Domain | MUSS | R | M0 | abgenommen | `npm run verify`; `eslint.config.mjs` (`no-explicit-any` als Fehler, `--max-warnings=0`); `next.config.ts` (`ignoreBuildErrors: false`) |
| NFA-QUAL-04 | Listenansicht mit 1.000 Rechnungen unter 1 s | SOLL | T | M6 | umgesetzt | `tests/integration/dashboard-performance.test.ts` — gemessen 22 ms ungefiltert, 2 ms mit Volltextsuche |
| NFA-QUAL-05 | Dashboard bei 1.000 Rechnungen unter 1 s | SOLL | T | M6 | umgesetzt | `tests/integration/dashboard-performance.test.ts` — gemessen 22 ms; der Test ist zugleich die Stelle, an der die Rechnung in der Anwendung statt in SQL auffiele, wenn der Bestand wächst |
| NFA-QUAL-06 | Seed-Kommando mit realistischen Testdaten | MUSS | M | M7 | umgesetzt | `scripts/seed.ts` (`npm run seed`) — 5 Kunden, 4 Leistungen, ~65 Belege über drei Jahre in allen Statuswerten; bricht bei `NODE_ENV=production` ab |
| NFA-QUAL-07 † | UI vollständig deutsch, Texte zentral | MUSS | R | M0 † | abgenommen | `src/i18n/de.ts`; Label-Tabellen als `Record<Code, string>` — ein fehlendes Label ist ein Compilerfehler. Bei jedem Meilenstein erneut zu prüfen |
| NFA-QUAL-08 † | Deutsche Formatierung für Beträge, Datum, Zahlen | MUSS | T | M0 † | abgenommen | `tests/unit/ui/format.test.ts` |
| NFA-QUAL-09 † | Tastaturbedienbarkeit, Labels an Formularfeldern | SOLL | M | M6 † | offen | — |
| NFA-QUAL-10 † | Nutzbar ab 1280 px voll, ab 768 px lesend | SOLL | M | M6 † | offen | — |
| NFA-QUAL-11 † | Rückfrage bei ungespeicherten Änderungen im Editor | SOLL | M | M4 † | abgenommen | Manuell: `beforeunload` im Rechnungseditor, sobald Änderungen vorliegen |
| NFA-QUAL-12 † | Bestätigung mit Erklärtext bei destruktiven Aktionen | MUSS | M | M4 † | abgenommen | Manuell: `ConfirmButton` bei Festschreiben, Stornieren, Entwurf löschen und Zahlung zurücknehmen — der Text nennt die Folge |

---

## 16. Oberfläche & Gestaltung (Frontend-Entwurf §9)

Aus `faktura-frontend-design.md`. Der Entwurf ergänzt Spec und Anforderungskatalog
und ist für die Umsetzung verbindlich. Die IDs sind dort in §9 aufgeführt und hier
mit demselben Wortlaut übernommen; Meilenstein M5.5b ist die Einordnung, die der
Auftraggeber vorgegeben hat.

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-UI-01 | Alle Farben, Abstände, Radien, Schriftgrößen aus den Tokens; keine Literale | MUSS | R | M5.5b | umgesetzt | `src/app/globals.css` (Tokensatz, Standardpalette per `--color-*: initial` gelöscht); `tests/architecture/design-tokens.test.ts` |
| FA-UI-02 | Genau drei Erhebungsstufen; nur die Dokumentvorschau trägt `--shadow-sheet` und Radius 0 | MUSS | R | M5.8 | umgesetzt | `tests/architecture/design-tokens.test.ts` — drei Stufen, zwei erlaubte Radien, eine Namensliste der gehobenen Flächen, damit ihre Ausbreitung im Diff sichtbar wird |
| FA-UI-03 | Beträge, Nummern, Datum monospaced mit Tabellenziffern, rechtsbündig | MUSS | M | M5.5b | umgesetzt | `src/ui/components/table.tsx` (`numeric`-Spalten); `font-variant-numeric` in `globals.css`; Manuell: Rechnungsliste — Dezimaltrennzeichen stehen untereinander |
| FA-UI-04 | Schriften lokal, keine Anfrage an ein Font-CDN | MUSS | T | M5.5b | umgesetzt | `tests/architecture/design-tokens.test.ts` — Einbindung über `@fontsource`, alle `url()` relativ |
| FA-UI-05 | Status nie allein durch Farbe; Text und unterscheidbare Punktform | MUSS | M | M5.5b | umgesetzt | `src/ui/components/status-field.tsx` — Punkt als SVG in drei Formen (offen, halb, gefüllt) plus Beschriftung |
| FA-UI-06 | Überfälligkeit als Zusatz am Status „Offen", nicht als eigener Status | MUSS | M | M5.5b | umgesetzt | `src/ui/components/status-field.tsx`; Rechnungsliste zeigt „Offen · 24 Tage überfällig" |
| FA-UI-07 | Nummer beim Festschreiben animiert; ohne Bewegung bei `prefers-reduced-motion` | SOLL | T | M5.8 | umgesetzt | `src/app/invoices/invoice-editor.tsx` — Stempel über `.stamp-in`; `tests/architecture/design-tokens.test.ts` prüft Keyframe und Abschaltung. Die Nummer erscheint im Editor, nicht im Blatt: In den PDF-Betrachter des Browsers hinein lässt sich nichts animieren |
| FA-UI-08 | Ausschließlich der Bewegungskatalog aus §2.4; jede Dauer aus einem Token | MUSS | R | M5.8 | umgesetzt | `tests/architecture/design-tokens.test.ts` — erlaubte Dauern, Tokenliste und die beiden zulässigen Keyframes; `prefers-reduced-motion` schaltet alles auf 0 ms |
| FA-UI-09 | Leerzustände nennen die nächste Handlung, ohne Illustration | SOLL | M | M5.5b | umgesetzt | `src/ui/components/page.tsx` (`EmptyState`); Manuell: leere Rechnungsliste |
| FA-UI-10 | Fehlermeldungen nennen Ursache und Ausweg, ohne Entschuldigung | MUSS | R | M5.5b | umgesetzt | `src/i18n/de.ts` — Review der Meldungstexte; Vorlagenfehler mit Zeilenangabe folgt in M5 |
| FA-UI-11 | Button-, Dialog- und Toast-Wortlaut mit demselben Verbstamm | MUSS | R | M5.8 | umgesetzt | `src/i18n/de.ts` — „Als bezahlt markieren“, „Als bezahlt markieren?“, „als bezahlt markiert“; Dialog und Toast existieren seit M5.8 |
| FA-UI-12 | Navigationseinträge mit Symbol **und** Text aus einem Satz; aktiver Eintrag durch Fläche und Balken | MUSS | M | M5.8 | umgesetzt | `src/app/app-shell.tsx` — Lucide-Symbole in `ICON_STROKE`, `bg-accent-wash` plus 2 px `border-l`; Manuell: aktiver Eintrag bleibt ohne Farbe unterscheidbar |
| FA-UI-13 | Datumsfelder akzeptieren Direkteingabe `TT.MM.JJJJ` neben der Kalenderauswahl | MUSS | T | M5.8 | umgesetzt | `src/ui/components/date-field.tsx`; `tests/unit/ui/date-input.test.ts` — Textfeld in fester deutscher Schreibweise, Kalender daneben, ISO im abgeschickten Feld |
| FA-UI-14 | Aktionen laufen über eine zentrale `can()`-Funktion | MUSS | T | M8 | umgesetzt | `src/domain/policy/can.ts` — seit M8 mit Akteur; `tests/unit/domain/policy.test.ts` (10). Die Sichtbarkeit ist dabei die Zugabe, nicht der Schutz: Durchgesetzt wird serverseitig über `Authorized<K>` in `src/application/auth/authorize.ts` (FA-ROLE-03), nachgewiesen in `tests/integration/permissions.test.ts` (10) und `tests/architecture/authorization.test.ts` (6) |
| FA-UI-15 | Sidebar-Zonen für Organisation und Nutzer, gefüllt | SOLL | M | M8 | umgesetzt | `src/app/app-shell.tsx` — Kopfzone: Anwendung und Unternehmensname; Fußzone: Name (oder Adresse) und Rolle des angemeldeten Kontos. Ein Organisationswechsler entfällt: Eine Adresse gehört zu genau einem Unternehmen (FA-ORG-04) |
| FA-UI-16 | Spalte „Erstellt von“ — gefüllt, sichtbar ab zwei Konten | SOLL | T | M8 | umgesetzt | `Invoice.createdById` (Fremdschlüssel auf `User`); `src/app/invoices/page.tsx` blendet die Spalte ein, sobald `countMembers` mehr als ein Konto meldet. Bestandsbelege behalten `NULL` und zeigen einen Gedankenstrich. Nachweis: `tests/integration/invoice-lifecycle.test.ts` (Urheber am Entwurf, eigener Urheber der Kopie, Unveränderbarkeit nach dem Festschreiben) |
| FA-UI-17 | Bestätigungen als Dialog der Anwendung, nicht als `window.confirm`; der Dialog nennt die Folge | MUSS | T | M5.8 | umgesetzt | `src/ui/components/dialog.tsx`; `tests/integration/browser-invoice-list.test.ts` — natives `<dialog>`, Escape schließt, kein Browserfenster |
| FA-UI-18 | Jede Aktion ohne Seitenwechsel wird durch einen Toast bestätigt | MUSS | T | M5.8 | umgesetzt | `src/ui/components/toast.tsx`; `tests/integration/browser-invoice-list.test.ts` |
| FA-UI-19 | Belege aus der Liste heraus bezahlen, stornieren, duplizieren, herunterladen | MUSS | T | M5.8 | umgesetzt | `src/app/invoices/page.tsx`; `tests/integration/browser-invoice-list.test.ts` — sichtbar bei Hover und bei Tastaturfokus |
| FA-UI-20 | Mehrfachauswahl mit Sammelaktionen; Auswahl funktioniert ohne JavaScript | SOLL | T | M5.8 | umgesetzt | `src/app/invoices/selection-bar.tsx` — Sichtbarkeit über `:has(:checked)` in CSS; `tests/integration/browser-invoice-list.test.ts` |
| NFA-UI-01 | Kontrast ≥ 4.5:1 für Text, ≥ 3:1 für Bedienelemente | MUSS | T | M5.5b | umgesetzt | `tests/unit/ui/contrast.test.ts` — beide Farbschemata, seit M5.8 auch die rote Fläche der zerstörenden Zeilenaktion; `--ink-faint` gegenüber dem Entwurf abgedunkelt |
| NFA-UI-02 | Sichtbarer Fokusring überall; kein `outline: none` ohne Ersatz | MUSS | T | M5.5b | umgesetzt | `tests/architecture/design-tokens.test.ts`; `FOCUS_RING` in `src/ui/components/form.tsx` |
| NFA-UI-03 | Rechnungseditor inklusive Positionssortierung per Tastatur bedienbar | MUSS | M | M5.5b | umgesetzt | `src/app/invoices/invoice-editor.tsx` — `KeyboardSensor` mit `sortableKeyboardCoordinates`, zusätzlich die Knöpfe „Nach oben"/„Nach unten". Verifikationsart M: die Abnahme am Gerät steht aus |
| NFA-UI-04 | Keine externen Netzwerkanfragen aus dem Frontend | MUSS | T | M5.5b | umgesetzt | `tests/architecture/design-tokens.test.ts`; zusätzlich sperrt die CSP in `src/infrastructure/security/security-headers.ts` |
| NFA-UI-05 | Dunkles Farbschema verfügbar; Dokumentvorschau bleibt weiß | KANN | M | M5.5b | umgesetzt | `src/app/globals.css` — Tokenüberschreibung unter `prefers-color-scheme: dark`, `--sheet` unverändert; `tests/unit/ui/contrast.test.ts` prüft beide Schemata |
| FA-UI-21 | Passkey-Knopf neben dem Formular, nicht an seiner Stelle | MUSS | T | M9 | umgesetzt | `src/app/passkey-login-button.tsx` steht neben der Server-Komponente des Anmeldeformulars; `tests/integration/browser-passkey.test.ts` prüft beides auf derselben Seite und meldet anschließend mit dem Formular an |
| FA-UI-22 | Wo Passkeys nicht möglich sind, erscheint der Grund statt des Knopfes | MUSS | R | M9 | umgesetzt | Review: `isPasskeyCapableOrigin()` entscheidet in `/login`, `/admin/login`, `/settings/security` und `/admin`; im Nein-Fall steht `messages.security.passkeyUnsupported` |
| FA-UI-23 | Ein Abbruch der Gerätesperre ist kein Fehler | SOLL | R | M9 | umgesetzt | Review: `Alert` hat dafür seit M9 einen dritten Ton `note` — neutrale Fläche, `role="status"` statt `role="alert"`. Wer die Gerätesperre wegdrückt, hat sich entschieden; Ocker behauptete dort eine Störung |
| FA-UI-24 | Passkeys und vertraute Geräte in derselben Form wie aktive Sitzungen | MUSS | M | M9 | umgesetzt | `/settings/security` — drei Abschnitte gleichen Aufbaus (Bezeichnung, letzte Nutzung, einzeln widerrufbar); `/admin` führt den Passkey-Abschnitt ohne die vertrauten Geräte (FA-TRUST-05). Manuell: A10, A11 |
| NFA-UI-06 | Der Zugang hängt nicht an JavaScript | MUSS | T | M9 | umgesetzt | `tests/integration/route-protection.test.ts` schickt das Anmeldeformular so ab, wie ein Browser ohne JavaScript es täte (`$ACTION_ID_…`); `tests/integration/browser-passkey.test.ts` prüft, dass der Passwortweg neben dem Passkey-Knopf bestehen bleibt. **Nicht behauptet wird**, dass die ganze Anwendung ohne JavaScript läuft: Formulare mit `useActionState` tun das nicht und tragen dafür einen `<NoScriptNotice>` |
| FA-UI-25 | Marke als Inline-SVG mit `currentColor`, Wortmarke als Text | MUSS | T | M9 | umgesetzt | `src/ui/components/brand.tsx`; Kleinschreibung und Laufweite in `.brand-wordmark` (`globals.css`), damit der Name in `de.ts` „Faktura" bleibt und auch so vorgelesen wird. `tests/architecture/design-tokens.test.ts` — gegen `fill="#2A3EA0"` gegengeprüft |
| FA-UI-26 | Das Rechnungsdokument trägt nie die Marke der Software | MUSS | T | M9 | umgesetzt | `tests/architecture/design-tokens.test.ts` — kein Bauteil im Weg vom Beleg zur Datei importiert die Marke; gegen einen absichtlichen Import in `render-invoice.ts` gegengeprüft. Auf dem Beleg steht das Logo des Unternehmens (FA-STAMM-05) |
| FA-UI-27 | Entwurf aus der Liste bearbeiten | SOLL | T | M11 | umgesetzt | Zeilenaktion in `src/app/invoices/page.tsx`, sichtbar unter `invoice.update` und nur an Entwürfen; `tests/integration/browser-invoice-list.test.ts`. Bearbeiten ging seit M4 — es fehlte der Weg dorthin, denn aus der Liste führte nur die Belegnummer, und ein Entwurf hat keine |
| FA-UI-28 | Jede Speicheraktion wird sichtbar bestätigt | MUSS | T | M12 | umgesetzt | `tests/architecture/save-feedback.test.ts`, gegen einen absichtlichen Verstoß geprüft. **Der Mangel war nicht die fehlende Meldung, sondern ihr Ort:** `Alert tone="success"` über dem ersten Feld, Knopf am Ende eines langen Formulars, keine Sprungmarke — im Blickfeld änderte sich nichts. Neun Formulare zeigen jetzt einen Toast; der Zeitstempel im Zustand ist nötig, weil `useActionState` den vorigen Zustand behält und der Toast sonst beim zweiten Speichern ausbliebe. Fünf stille Aktionen der Sicherheitsseite bestätigen über `?erledigt=…` |
| FA-UI-29 | Passwort einsehbar, ohne JavaScript kein Knopf | SOLL | T | M13 | umgesetzt | `tests/integration/browser-password-reveal.test.ts` — umschalten, `aria-pressed`, und ein Browser **ohne JavaScript**, in dem der Knopf unsichtbar bleibt. Versteckt über eine Regel im `<noscript>` des Layouts statt über einen Zustand: React rügt `set-state-in-effect` zu Recht, und ein nachgereichter Knopf flackert. Acht Felder umgestellt |

---

## 17. Mandanten, Rollen und Verwaltung (Katalog §16)

| ID | Anforderung | Prio | Verif. | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-ORG-01 | Beliebig viele Unternehmen, keine Kreuzzugriffe | MUSS | T | M8 | umgesetzt | `OrganizationContext` als Pflichtparameter jeder Repository-Funktion (M5.5a) plus zwölf Mandantentrigger; `tests/integration/organization-isolation.test.ts`, `tests/integration/platform-admin.test.ts` |
| FA-ORG-02 | Unternehmen, Inhaberrolle und Einladung in einem Vorgang | MUSS | T | M8 | umgesetzt | `createOrganizationWithOwner` in `platform-repository.ts` — eine Transaktion; `tests/integration/platform-admin.test.ts` |
| FA-ORG-03 | Stilllegen beendet Sitzungen sofort, ohne Datenverlust | MUSS | T | M8 | umgesetzt | `setOrganizationSuspended`; `Organization.suspendedAt` wird in derselben Abfrage wie die Sitzung gelesen; `tests/integration/platform-admin.test.ts` (drei Fälle: Sitzungsende, Datenerhalt, Freigabe) |
| FA-ORG-04 | Eine Adresse gehört zu genau einem Unternehmen | MUSS | T | M8 | umgesetzt | `User.email` global eindeutig; `inviteMember` und `createManagedOrganization` weisen belegte Adressen ab; `tests/integration/membership.test.ts` |
| FA-ORG-05 | Nummernkreise je Unternehmen | MUSS | T | M8 | umgesetzt | `NumberSequence` trägt `organizationId`; `tests/integration/platform-admin.test.ts` — zwei Unternehmen, beide `RE-2026-0001`. Vor M8 nicht prüfbar, weil es nur einen Mandanten gab |
| FA-ROLE-01 | Eigene Rollen je Unternehmen aus festem Katalog | MUSS | T | M8 | umgesetzt | `src/domain/policy/can.ts` (`PERMITTED`, 28 Schlüssel), `role-service.ts`, `/settings/roles`; `tests/integration/membership.test.ts`, `tests/unit/domain/policy.test.ts` |
| FA-ROLE-02 | Ein Konto trägt genau eine Rolle, nur aus dem eigenen Unternehmen | MUSS | T | M8 | umgesetzt | `User.roleId`; Trigger `User_role_matches_organization_*`; `tests/integration/roles.test.ts` |
| FA-ROLE-03 | Serverseitige Durchsetzung, auch ohne Oberfläche | MUSS | T | M8 | umgesetzt | `Authorized<K>` in `src/application/auth/authorize.ts`; `tests/integration/permissions.test.ts` — vier Fälle über HTTP ohne jede Oberfläche |
| FA-ROLE-04 | Aussperrsicherung, von der Datenbank durchgesetzt | MUSS | T | M8 | umgesetzt | Drei Trigger `Organization_keeps_administrator_*`; die Anwendung erklärt vorher (`LAST_ADMINISTRATOR`). `tests/integration/roles.test.ts`, `tests/integration/membership.test.ts`, `tests/integration/platform-admin.test.ts` |
| FA-ROLE-05 | Rechteänderung wirkt ohne erneute Anmeldung | MUSS | T | M8 | umgesetzt | `forSession` liest die Berechtigungen bei jeder Auflösung; `tests/integration/roles.test.ts` — dasselbe Token vor und nach dem Entzug |
| FA-ROLE-06 | Geschlossener Katalog: unbekannter Schlüssel gewährt nichts | MUSS | T | M8 | umgesetzt | `actorOf()` verwirft Unbekanntes, `readPermissionKeys()` speichert es gar nicht erst; `tests/unit/domain/policy.test.ts`, `tests/integration/membership.test.ts` |
| FA-MEMB-01 | Konten entstehen nur per Einladung | MUSS | T | M8 | umgesetzt | `invitation-service.ts`, `/settings/members`; `tests/integration/membership.test.ts` |
| FA-MEMB-02 | Sieben Tage Frist, einmal einlösbar | MUSS | T | M8 | umgesetzt | `src/domain/auth/invitation-policy.ts`; `tests/integration/membership.test.ts` (abgelaufen, zweimal eingelöst) |
| FA-MEMB-03 | Passwort setzt der Eingeladene selbst | MUSS | T | M8 | umgesetzt | `Invitation` trägt kein Passwortfeld; `acceptInvitation` in `redeem.ts` hasht es an Ort und Stelle; `tests/integration/membership.test.ts`, `tests/integration/platform-admin.test.ts` |
| FA-MEMB-04 | Zurücksetzung: 24 Stunden, einmalig, beendet alle Sitzungen | MUSS | T | M8 | umgesetzt | `password-reset-policy.ts`, `startPasswordReset`, `completePasswordReset`; `tests/integration/membership.test.ts` (sechs Fälle) |
| FA-MEMB-05 | Alle Ablehnungen ununterscheidbar, kein Formular ohne Nachweis | MUSS | T | M8 | umgesetzt | `redeem.ts` liefert für alle Fälle `INVALID`; `tests/integration/membership.test.ts`, `tests/integration/route-protection.test.ts` (200 ohne Auskunft, kein Passwortfeld) |
| FA-MEMB-06 | Sperren statt löschen; Sitzungen enden sofort | MUSS | T | M8 | umgesetzt | `setMemberDisabled`; `tests/integration/membership.test.ts`, `tests/integration/roles.test.ts` |
| FA-MEMB-07 | Eine offene Einladung je Adresse | MUSS | T | M8 | umgesetzt | Partieller Index `Invitation_one_open_per_email`; `inviteMember` zieht vorher zurück; `tests/integration/membership.test.ts`, `tests/integration/database-triggers.test.ts` |
| FA-MEMB-08 | Link genau einmal sichtbar; Zustellung kommt hinzu, ersetzt nicht | MUSS | T | M14 | umgesetzt | `InviteForm` und `PasswordResetForm` als Client-Komponenten — der Token lebt in der Antwort einer Server Action, gespeichert ist nur sein Hash. Seit M14 geht er **zusätzlich** hinaus, wenn ein Mailserver eingerichtet ist; `tests/integration/invitation-delivery.test.ts` prüft beides in einem Durchlauf (Nachricht kommt an **und** derselbe Token steht im Ergebnis), `tests/integration/membership.test.ts` den Fall ohne Konfiguration. **Nachtrag:** Drei Wege der Verwaltung stellten zunächst nicht zu (Unternehmen anlegen, Einladung erneut ausstellen, Zurücksetzung für ein Mandantenkonto), zwei weitere sagten es nicht — `tests/architecture/delivery.test.ts` verlangt seither, dass ein Modul, das `generateRedemptionToken()` aufruft, auch zustellt, und ist gegen den Stand davor gegengeprüft |
| FA-MEMB-09 | „Passwort vergessen" als Selbstbedienung, ununterscheidbar, gebremst | MUSS | T | M14 | umgesetzt | `/password-reset` (öffentlich), `requestPasswordReset` in `src/application/members/redeem.ts` — vierte Stelle ohne Mandantenkontext, aus demselben Grund. `tests/integration/password-reset-request.test.ts` prüft alle vier Zweige auf denselben Ausgang; die Bremse rechnet über `expiresAt` statt `createdAt` und ist als reine Regel geprüft (`tests/unit/domain/auth-policies.test.ts`) |
| FA-ADM-01 | Getrennte Identitäten: Tabelle, Sitzung, Cookie | MUSS | T | M8 | umgesetzt | `AdminUser`/`AdminSession`, Cookie `faktura_admin_session` mit Pfad `/admin`; `tests/integration/admin-session.test.ts`, `tests/integration/route-protection.test.ts` |
| FA-ADM-02 | Keine Geschäftsdaten im Adminbereich | MUSS | T | M8 | umgesetzt | `tests/architecture/platform-repository.test.ts` — Erlaubnisliste der Prisma-Delegates **und** der Beziehungsnamen, beide gegen einen absichtlichen Verstoß geprüft; `route-protection.test.ts` prüft das ausgelieferte HTML |
| FA-ADM-03 | Nur Kennzahlen je Unternehmen | MUSS | T | M8 | umgesetzt | `OrganizationMetrics` — vier Zahlen und ein Name; `tests/integration/platform-admin.test.ts` prüft die Schlüsselmenge der Antwort |
| FA-ADM-04 | Kein Weg von der Admin- zur Mandantensitzung | MUSS | T | M8 | umgesetzt | Es gibt keine solche Funktion; `tests/architecture/platform-repository.test.ts` hält die Nichtexistenz fest |
| FA-ADM-05 | Unternehmen anlegen, stilllegen, Konten sperren | MUSS | T | M8 | umgesetzt | `organization-admin.ts`, `/admin/organizations/**`; `tests/integration/platform-admin.test.ts` — einschließlich der Aussperrsicherung gegenüber dem Betreiber |
| FA-ADM-06 | Erstes Betreiberkonto per Kommando, nicht per Migration | MUSS | T | M8 | umgesetzt | `npm run admin:create` gibt einen Einrichtungslink aus (24 Stunden, einmal einlösbar); Passwort und zweiter Faktor entstehen im Browser, das Konto beim Einlösen. `tests/integration/admin-session.test.ts` (acht Fälle) |
| FA-ADM-07 | Protokoll unterscheidet Mitglied und Betreiber | MUSS | T | M8 | umgesetzt | `AuditLog.actorKind`; `recordPlatformAuditEntry` schreibt ins Protokoll des betroffenen Unternehmens; `tests/integration/platform-admin.test.ts` |
| FA-ADM-08 | Mehr als ein Faktor für Betreiberkonten | MUSS | T | M8, M9 | umgesetzt | `adminLogin` endet immer mit einem Nachweis, nie mit einer Sitzung. Und es gibt zu keinem Zeitpunkt ein Konto ohne zweiten Faktor: Es entsteht erst beim Einlösen des Einrichtungslinks, mit `totpEnabled: true` in derselben Transaktion. `tests/integration/admin-session.test.ts` **Wortlaut geändert in M9:** Ein Passkey mit Nutzerverifikation ist kein zweiter Faktor neben einem Passwort, sondern beide zusammen — Besitz des Geräts und Gerätesperre. Die Zusage lautet deshalb „mehr als ein Faktor" statt „zweiter Faktor". Erfüllt wird sie auf beiden Wegen: `adminLogin` endet nie mit einer Sitzung, und `completePasskeyLogin` verlangt `requireUserVerification: true`. `tests/integration/passkeys.test.ts` |
| NFA-SEC-23 | Sicherung nur mit Adminsitzung | MUSS | T | M8 | umgesetzt | `/admin/api/backup`; `createBackup` verlangt einen `PlatformContext`; `tests/integration/route-protection.test.ts`, `tests/integration/backup.test.ts` |
| NFA-SEC-24 | Typgeprüfter Nachweis je Anwendungsfall | MUSS | T | M8 | umgesetzt | `Authorized<K>` über 61 Signaturen; `tests/architecture/authorization.test.ts` (vier Wächter, alle gegengeprüft), `tests/integration/permissions.test.ts` |
| NFA-SEC-25 | Berechtigungen bei jeder Anfrage frisch gelesen | MUSS | T | M8 | umgesetzt | `forSession` in `auth-repository.ts` — nichts im Cookie; `tests/integration/roles.test.ts` |
| NFA-SEC-26 | Aufrufstellen der Kontexterzeugung aufgezählt | MUSS | T | M8 | umgesetzt | `tests/architecture/authorization.test.ts` — Erlaubnisliste für `organizationContextOf` und `fullyAuthorized`, beide gegen einen absichtlichen Verstoß geprüft |

---

## 18. Anmeldeverfahren (Katalog §17)

| ID | Anforderung | Prio | Verif. | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-PASS-01 | Herkunft an einer Stelle abgeleitet, keine IP-Adresse | MUSS | T | M9 | umgesetzt | `src/infrastructure/auth/webauthn.ts` — `relyingPartyId`, `expectedOrigin`, `isPasskeyCapableOrigin`; `tests/unit/infrastructure/webauthn.test.ts`. Die IP-Regel kam aus dem Browsertest: `127.0.0.1` ist ein sicherer Kontext, aber als `rpID` unzulässig, und Chromium bricht wortlos ab |
| FA-PASS-02 | Ein Passkey gehört zu genau einem Konto | MUSS | T | M9 | umgesetzt | `WebAuthnCredential_exactly_one_account` — derselbe CHECK wie bei `PendingLogin`; `tests/integration/passkeys.test.ts` |
| FA-PASS-03 | Anlegen mit Bezeichnung, Liste mit Anlage und letzter Nutzung | MUSS | T | M9 | umgesetzt | `beginPasskeyRegistration` / `completePasskeyRegistration`; `/settings/security` und `/admin`; `tests/integration/passkeys.test.ts`, `tests/integration/browser-passkey.test.ts` |
| FA-PASS-04 | Einzeln entfernbar, wirkt sofort | MUSS | T | M9 | umgesetzt | `removePasskey`; die Anmeldung liest den Schlüssel bei jeder Zeremonie neu; `tests/integration/passkeys.test.ts` |
| FA-PASS-05 | Aufgabe einmal verwendbar, zwei Minuten, vor der Prüfung verbraucht | MUSS | T | M9 | umgesetzt | `webauthn-policy.ts`; `consumeChallenge` steht **vor** `verifyAuthenticationResponse` — eine zweite Antwort findet nichts mehr vor, gleich ob die erste gelang; `tests/integration/passkeys.test.ts` |
| FA-PASS-06 | Anmeldung ohne Passwort, ohne Code, ohne Adresse | MUSS | T | M9 | umgesetzt | `completePasskeyLogin`; `residentKey: 'required'`, `allowCredentials` bleibt leer; `tests/integration/browser-passkey.test.ts` meldet im echten Chromium ohne eine einzige Eingabe an |
| FA-PASS-07 | `userVerification: 'required'` | MUSS | T | M9 | umgesetzt | `requireUserVerification: true` in `passkey-login.ts` — ohne diese Zeile wäre es eine Anmeldung mit einem Faktor; `tests/integration/passkeys.test.ts` |
| FA-PASS-08 | Zählerrückschritt sperrt den Passkey | MUSS | T | M9 | umgesetzt | `indicatesClonedAuthenticator` auf dem verifizierten `newCounter`, also **nach** der Signatur; `tests/integration/passkeys.test.ts` (Klon erkannt, Passkey danach gesperrt) |
| NFA-SEC-27 | JSON-Routen prüfen Herkunft und CSRF-Kopfzeile | MUSS | T | M9 | umgesetzt | `assertJsonRequestIntegrity`; `tests/integration/route-protection.test.ts` — fremde Herkunft und fehlende Kopfzeile ergeben 403, eine gültige Anfrage kommt bis zur Inhaltsprüfung (400). Die dritte Prüfung ist der Gegenbeweis: Ohne sie bestünden die beiden ersten auch dann, wenn die Route jede Anfrage abwiese. Genau dieser Test hat aufgedeckt, dass die Prüfung anfangs die falsche Kopfzeile las und damit immer durchging |
| NFA-SEC-28 | Alle Ablehnungen ununterscheidbar | MUSS | T | M9 | umgesetzt | Ein einziger Fehlertyp `REJECTED` in `passkey-login.ts`; `tests/integration/passkeys.test.ts` (unbekannt, gesperrt, stillgelegt, falsche Identität) |
| NFA-SEC-29 | Anmeldesperre gilt nicht für Passkeys | MUSS | T | M9 | umgesetzt | `passkey-login.ts` liest `lockedUntil` nicht; `tests/integration/passkeys.test.ts` — Konto mit zehn Fehlversuchen meldet mit Passkey an |
| NFA-SEC-30 | Der Wächter erfasst jede Datei mit `PlatformContext` | MUSS | T | M10 | umgesetzt | `tests/architecture/platform-repository.test.ts` — die **vierte** Lücke dieses Wächters: Alle drei bisherigen Prüfungen lasen eine Datei, und `createPlatformAuditEntry` stand mit `PlatformContext` daneben. Dazu eine dritte Kategorie: auf `auditLog` darf die Verwaltung nur schreiben. Beide Regeln gegengeprüft |
| NFA-SEC-31 | Hochgeladene PDF: Signatur, Größe, aktive Bestandteile, eine Seite, A4 | MUSS | T | M12 | umgesetzt | `tests/unit/domain/pdf-upload.test.ts` (19 Fälle über Bytes), `tests/integration/letterhead.test.ts` (echte, mit pdf-lib erzeugte Bögen). Zwei Schichten, weil eine nicht reicht: Die Domain sieht die Bytes, die Anwendung liest mit pdf-lib, was ohne PDF-Leser nicht zu sehen ist. Ein zweiseitiger Bogen wird abgewiesen statt beschnitten — seine zweite Seite erschiene auf keinem Beleg |
| FA-TRUST-01 | Gerät merken, 30 Tage, Passwort bleibt | SOLL | T | M9 | umgesetzt | `src/domain/auth/trusted-device-policy.ts`; `login()` prüft **vor** dem `PendingLogin`; `tests/integration/two-step-login.test.ts` |
| FA-TRUST-02 | An das Konto gebunden, nicht nur an den Token | MUSS | T | M9 | umgesetzt | Abfrage über `userId` **und** Hash; `tests/integration/two-step-login.test.ts` — der Nachweis eines fremden Kontos überspringt nichts |
| FA-TRUST-03 | Einsehbar und einzeln widerrufbar | MUSS | M | M9 | umgesetzt | `/settings/security`, Abschnitt „Vertraute Geräte" mit Bezeichnung, letzter Nutzung und Ablauf. Manuell: A11 |
| FA-TRUST-04 | Vier Ereignisse entwerten alle Nachweise | MUSS | T | M9 | umgesetzt | Passwortzurücksetzung (auch die des Betreibers), Abschalten des zweiten Faktors, Sperren, „alle anderen Sitzungen beenden"; `tests/integration/two-step-login.test.ts` — je ein Fall. Der vierte fehlte bis zum Schreiben dieses Katalogs: Der Weg war da, der Test nicht |
| FA-TRUST-05 | Betreiberkonten führen keine vertrauten Geräte | MUSS | R | M9 | umgesetzt | Review: `TrustedDevice.userId` verweist ausschließlich auf `User` — für ein Betreiberkonto gibt es die Zeile nicht, und `adminLogin` ruft keinen der Wege auf. Eine Eigenschaft des Datenmodells, kein geprüftes Verhalten |
| FA-ADM-09 | Offene Einladungen sichtbar und zurückziehbar | MUSS | T | M9 | umgesetzt | `listOpenInvitationsForPlatform`, `revokeInvitationForPlatform`; `/admin/organizations/[id]`; `tests/integration/platform-admin.test.ts` |
| FA-ADM-10 | Einladung erneut ausstellbar | MUSS | T | M9 | umgesetzt | `reissueOwnerInvitation` — zieht erst zurück, stellt dann aus; behebt zugleich den rohen Indexfehler in `createOrganizationWithOwner`; `tests/integration/platform-admin.test.ts` |
| FA-ADM-11 | Zurücksetzungsnachweis für ein Mandantenkonto | MUSS | T | M9 | umgesetzt | `startTenantPasswordReset` — kein Passwort, keine Sitzung; alle Sitzungen und vertrauten Geräte enden; Eintrag mit `actorKind: 'ADMIN'` im Protokoll des Unternehmens; `tests/integration/platform-admin.test.ts` |
| FA-ADM-12 | Betreiberkonten aus der Oberfläche verwalten | MUSS | T | M10 | umgesetzt | `src/application/admin/platform-accounts.ts` — dünn über `inviteAdmin`/`resetAdmin`, damit es nur **einen** Ausstellungsweg gibt; `/admin/accounts`; `tests/integration/platform-accounts.test.ts` (Liste ohne Passwortfelder, Einladung nur als Hash, Sitzungen enden beim Sperren, eigenes Konto abgewiesen) |
| FA-ADM-13 | Sperren trifft nicht das letzte aktive Konto, Zurücksetzen darf es | MUSS | T | M10 | umgesetzt | `setAdminUserDisabled` zählt und schreibt in **einer** Transaktion. **Kein Trigger**, anders als geplant: „immer mindestens ein aktives Betreiberkonto" ist kein Invariant dieses Systems — `resetAdmin` führt absichtlich hindurch, und `admin:create` kommt mit einer neuen Adresse immer herein. Vier bestehende Tests haben den ersten Anlauf umgeworfen; zwei neue halten den Unterschied fest |
| FA-ADM-14 | Protokoll der Verwaltung, auch ohne Unternehmensbezug | MUSS | T | M10 | umgesetzt | Eigene Tabelle `PlatformAuditEntry` mit zwei Unveränderlichkeitstriggern; `/admin/audit`. **Kein Filter auf `AuditLog`**: Vorgänge an Betreiberkonten hätten dort keinen Platz, und die Verwaltung müsste das Protokoll der Mandanten lesen dürfen. `tests/integration/platform-accounts.test.ts` — ein Geschäftsvorfall erscheint nicht |
| FA-ADM-15 | Konto unkenntlich machen statt löschen | MUSS | T | M10 | umgesetzt | `anonymizeTenantUser`; Platzhalteradresse `geloescht-<id>@invalid` (RFC 2606) hält den eindeutigen Index. Die Aussperrsicherung aus FA-ROLE-04 greift ohne Zutun, weil `roleId` und `disabledAt` mitgesetzt werden. `tests/integration/platform-admin.test.ts` — Beleg behält Urheber, Protokolleintrag bleibt auflösbar, keine Anmeldung mehr möglich, zwei Anonymisierungen kollidieren nicht |
| FA-ADM-16 | Name und interne Notiz eines Unternehmens | MUSS | T | M10 | umgesetzt | `updateManagedOrganization`; die Notiz liegt **nicht** an `OrganizationMetrics` — der Test „ausschließlich Kennzahlen" hat den ersten Anlauf abgewiesen, zu Recht. Geprüft gegen den Datenexport des Mandanten, den vollständigsten Blick auf seine eigenen Daten |
| FA-ADM-17 | Zustand und Sicherung aus der Oberfläche | SOLL | M | M10 | umgesetzt | `/admin/operations` — `checkSystemStatus()` aus M7 und `/admin/api/backup` aus M8; neu ist nur der Weg dorthin. Zeitplan und Wiederherstellung bleiben Betriebsaufträge, mit Begründung auf der Seite. Manuell: A13 |
| FA-ADM-18 | Eigenes Passwort wechseln, andere Sitzungen enden | MUSS | T | M14.1 | umgesetzt | `/admin/security` → `changeAdminPassword` in `src/application/admin/admin-security.ts`. Das bisherige Passwort wird verlangt — ohne die Prüfung genügte ein übernommener Bildschirm. Die **aufrufende** Sitzung bleibt: Bei der Zurücksetzung durch einen anderen Betreiber enden alle, weil dort niemand weiß, welche die richtige ist. `tests/integration/admin-security.test.ts` |
| FA-ADM-19 | Eigene Geräte und Passkeys sehen und entfernen | MUSS | T | M14.1 | umgesetzt | Dieselbe Seite. Gefiltert wird über `adminUserId` **in der Abfrage** (`deleteMany` statt `delete`), nicht über die Kennung allein — sonst beendete eine untergeschobene fremde Kennung die Sitzung eines anderen Betreibers. Genau dieser Angriff ist geprüft |
| FA-ADM-20 | Kein „Passwort vergessen" für Betreiberkonten | MUSS | R | M14.1 | umgesetzt | Bewusste Nichtexistenz, benannt auf `/admin/security`: Ein Zurücksetzungsnachweis setzt dort Passwort **und** zweiten Faktor neu (FA-ADM-08), per Mail wäre er ein Ersatz für beide. Der Weg führt über ein zweites Betreiberkonto oder `npm run admin:reset` |

---
## 20. Mahnwesen (Katalog, M15)

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-MAHN-01 | Mahnung zu einem überfälligen, offenen Beleg | MUSS | T | M15 | umgesetzt | `refusalForReminder()` in `src/domain/reminder/dunning.ts` — **eine** Funktion für Oberfläche und Server, die Regel aus M12. `tests/unit/domain/dunning.test.ts`, `tests/integration/reminders.test.ts` |
| FA-MAHN-02 | Drei Stufen, gezählt ab der höchsten bisherigen | MUSS | T | M15 | umgesetzt | `nextReminderLevel()`. Ab der höchsten Stufe und nicht ab der Anzahl: Zwei Mahnungen derselben Stufe — etwa nach einem verlorenen Brief — dürfen die nächste nicht überspringen lassen |
| FA-MAHN-03 | Mahngebühr je Stufe, keine Verzugszinsen | MUSS | T | M15 | umgesetzt | `reminderFee1Cents` bis `-3Cents` an `CompanyProfile` (0 / 500 / 1000). Zinsen bewusst nicht: Der Basiszinssatz ändert sich halbjährlich und wäre eine Zahl, die veraltet, während die Anwendung damit rechnet |
| FA-MAHN-04 | Neue Zahlungsfrist ab dem Tag der Mahnung | MUSS | T | M15 | umgesetzt | `reminderDueDate()`; Vorgabe sieben Tage (`reminderPaymentTerms`) |
| FA-MAHN-05 | Unveränderlich, nicht löschbar, protokolliert | MUSS | T | M15 | umgesetzt | Trigger `Reminder_no_update`, `Reminder_no_delete`; Aktion `REMINDED` im Protokoll. Der Test zahlt nach der Mahnung eine Teilsumme und prüft, dass der Betrag darauf unverändert bleibt |
| FA-MAHN-06 | PDF über dieselbe Kette, ohne Steuer, eigener Nummernkreis | MUSS | T | M15 | umgesetzt | `application/reminders/render-reminder.ts`; Vorlage in `infrastructure/templates/reminder-template.ts` teilt das CSS des Belegs. `REMINDER_SEQUENCE_PREFIX` trennt den Kreis — sonst entstünde in der Rechnungsfolge eine Lücke (FA-NUM-05), was der Test eigens prüft |
| FA-MAHN-07 | Mahnen ist ein eigenes Recht | MUSS | T | M15 | umgesetzt | `invoice.remind` in `PERMITTED`. Die Migration trägt es **nur** bei Rollen mit `organization.administer` nach; eingeschränkte Rollen bekommen nichts — eine stille Rechteerweiterung wäre das Gegenteil dessen, wofür Rollen da sind |

## 21. Anwenderdokumentation (Katalog, M16)

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-DOC-01 | Handbuch ausgeliefert, öffentlich, von der Anmeldung verlinkt | MUSS | T | M16 | umgesetzt | Zwölf MDX-Dateien in `src/content/hilfe/`, gesetzt über `src/mdx-components.tsx` mit den Tokens der Anwendung. Routen `/hilfe` und `/hilfe/[thema]` in `src/routes.ts`, Link im `LegalFooter` — damit auf Anmeldung, Zurücksetzung **und** im `AppShell`. `tests/integration/route-protection.test.ts` |
| FA-DOC-02 | Zahlen im Text sind Verweise auf Konstanten | MUSS | T | M16 | umgesetzt | `tests/unit/domain/help-search.test.ts` prüft beide Richtungen: Die Konstante wird importiert **und** ihr ausformulierter Wert steht nirgends als Text. Bauart wie `privacy-notice.test.ts` aus M13 |
| FA-DOC-03 | Durchsuchbar, serverseitig, ohne JavaScript | MUSS | T | M16 | umgesetzt | `searchHelp()` in `src/domain/docs/search.ts` über den erzeugten Index; das Suchfeld ist ein `GET`-Formular. `tests/architecture/docs-index.test.ts` erzeugt den Index neu und vergleicht — wer eine MDX-Datei ändert und `npm run docs:index` vergisst, kommt dort nicht vorbei |
| FA-DOC-04 | Gliederung neben dem Inhalt, Abläufe als SVG | SOLL | T | M16.1 | umgesetzt | `HelpShell` mit Seitenleiste; das aktive Thema trägt `aria-current="page"`, und gesetzt wird über **das Attribut** statt über eine zusätzliche Klasse — die optische Auszeichnung ist dieselbe Aussage wie die für Screenreader. Vier Zeichnungen in `src/content/hilfe/diagrams.tsx` mit `currentColor`; `design-tokens.test.ts` prüft `src/content` seither mit |
| FA-DOC-05 | Bildschirmfotos werden erzeugt | SOLL | M | M16.1 | umgesetzt | `npm run docs:shots` — eigene wegwerfbare Datenbank, Beispieldaten aus `scripts/seed.ts`, neutraler Betrieb statt des Entwicklernamens, festes Fenster, helles Schema. Fünf Bilder in `public/hilfe/` |
| FA-DOC-06 | Abschnitt „Neuerungen“, das Neueste zuerst | SOLL | T | M16.2 | umgesetzt | `src/content/hilfe/neuerungen.mdx` — von Hand geschrieben, nicht aus Commit-Nachrichten abgeleitet: Die sind entwicklerseitig und beantworten nicht, was sich für den Benutzer ändert. Steht **am Ende** der Gliederung und ist von der Übersicht aus verlinkt; `tests/architecture/docs-index.test.ts` hält die Reihenfolge fest |

## Abnahmeszenarien (Katalog §19)

Durchgang vom 2026-08-24. **Was hier „belegt" heißt:** Das Szenario ist Schritt
für Schritt durch einen Test abgedeckt, der bei jedem Lauf erneut prüft — das
ist mehr als ein einmaliger Klickdurchlauf und weniger als eine Abnahme durch
den Auftraggeber. Die Freigabe bleibt seine.

Zwei Lücken hat der Durchgang aufgedeckt, beide behoben: die fehlende
Steuersumme bei gemischten Sätzen (A2) und der nie geprüfte Kundenumzug (A6).

| ID | Szenario | Stand | Beleg |
|---|---|---|---|
| A1 | Regelfall Inland | belegt | `e2e-invoice-lifecycle.test.ts` — anmelden, Kunde, Beleg, festschreiben, PDF, Zahlung, Status; `dashboard.test.ts` für die Kennzahlen |
| A2 | Gemischte Steuersätze | belegt, **Mangel behoben** | `invoice-totals.test.ts` (Rechnung, Rundung je Gruppe), `document-output.test.ts` (getrennte Aufstellung **auf dem Beleg**). Der Durchgang fand: Es gab keine Zeile „Umsatzsteuer gesamt" — bei einem Satz richtig, bei zweien musste der Leser selbst addieren |
| A3 | Reverse Charge | belegt | `editor-context.test.ts` (AE wird vorgeschlagen), `document-output.test.ts` (beide USt-IdNr und Hinweis im Satz) |
| A4 | Storno | belegt | `e2e-invoice-lifecycle.test.ts`, `invoice-lifecycle.test.ts`, `dashboard.test.ts` (Umsatz ohne stornierte Belege) |
| A5 | Umfangreiche Rechnung | belegt | `document-output.test.ts` — 60 Positionen, Seitenumbruch, Seitenangabe ab Seite 2 |
| A6 | Kundenumzug | belegt, **Lücke geschlossen** | `document-output.test.ts` — der Snapshot war gebaut, aber nie hatte jemand einen Kunden umgezogen und nachgesehen |
| A7 | Bösartige Vorlage | belegt | `rendering.test.ts` (kein ausgehender Zugriff, kein Skript), `document-output.test.ts` (verständliche Meldung bei Syntaxfehler) |
| A8 | Zugriffsschutz | belegt | `route-protection.test.ts` — 82 Prüfungen über jede Route in `routes.ts` |
| A9 | Wiederherstellung | **abgenommen** (2026-08-24) | `backup.test.ts` prüft Erzeugen, Auspacken und Gleichheit von Belegen und PDFs. Den Ernstfall — Container und Volumes löschen, aus der Sicherung neu aufsetzen — hat der Auftraggeber selbst durchgespielt; kein Test kann das tun, ohne die Anlage abzuräumen |
| A10 | Passkey statt Passwort | belegt | `browser-passkey.test.ts` mit nachgebautem Authenticator; Entfernen und erneuter Versuch in `passkeys.test.ts` |
| A11 | Vertrautes Gerät | belegt | `two-step-login.test.ts` — ohne Ankreuzen kein Gerät, fremdes Konto, Ablauf, Verfall beim Zurücksetzen |
| A12 | Zurück aus der Sackgasse | belegt | `platform-admin.test.ts` — Einladung erneut ausstellen, Zurücksetzungsnachweis, `actorKind: ADMIN` im Protokoll des Unternehmens |
| A13 | Zweiter Betreiber | belegt | `platform-accounts.test.ts` — einladen, letztes aktives Konto nicht sperrbar, Zurücksetzen desselben Kontos erlaubt |
| A14 | Konto unkenntlich machen | belegt | `platform-admin.test.ts` — Belege unverändert, Protokolleintrag auflösbar, keine Anmeldung mehr möglich, Vorgang in beiden Protokollen |
| A15 | Was die Verwaltung sieht | belegt | `platform-admin.test.ts` (nur Kennzahlen, Notiz nicht im Export), `tests/architecture/platform-repository.test.ts` (Wächter über die Delegates) |
| A16 | Beleg eines Kleinunternehmers | **abgenommen** (2026-08-24) | Die Bestandteile sind belegt (`document-output.test.ts`, `letterhead.test.ts`); das Aussehen hat der Auftraggeber am erzeugten Beleg geprüft |
| A17 | Eigenes Briefpapier | belegt | `letterhead.test.ts` (eine Seite, A4, Bogen auf **jeder** Seite, Hash nach Austausch unverändert), `browser-letterhead.test.ts` |
| A18 | Gespeichert heißt gespeichert | belegt | `tests/architecture/save-feedback.test.ts`, `browser-invoice-editor.test.ts` (Fehler im Blickfeld) |
| A19 | Impressum und Datenschutz | belegt | `legal-notices.test.ts`, `browser-legal.test.ts` — 404 ohne Inhalt, ohne Sitzung erreichbar, Markup bleibt Text |
| A20 | Zustellung | offen | Von Hand durchzuspielen: ohne `SMTP_URL` unverändert, mit `SMTP_URL` kommt die Mail und der Link steht trotzdem da, unbekannte Adresse liest sich wie eine bekannte, kein zweiter Nachweis binnen fünf Minuten. Automatisiert belegt sind die Teile: `mailer.test.ts`, `invitation-delivery.test.ts`, `password-reset-request.test.ts` |
| A21 | Mahnlauf | offen | Von Hand: drei Stufen ausstellen, vierte wird abgewiesen; PDF ohne Steuerausweis; Teilzahlung ändert die ausgestellte Mahnung nicht. Automatisiert belegt in `tests/integration/reminders.test.ts` |
| A22 | Handbuch | offen | Von Hand: abgemeldet aufrufen, suchen, ohne JavaScript erneut suchen. Automatisiert belegt sind Erreichbarkeit (`route-protection.test.ts`), Suche (`help-search.test.ts`) und die Aktualität des Index (`docs-index.test.ts`) |

**Stand: alle neunzehn Szenarien durch.** Siebzehn laufen bei jedem Testlauf
mit; die beiden, die kein Test führen kann — die Sichtprüfung des Belegs (A16)
und die Wiederherstellung nach vollständigem Verlust (A9) —, hat der
Auftraggeber am 2026-08-24 selbst durchgespielt und bestätigt.

Damit ist die Bedingung aus Katalog §19 erfüllt: „Manuell durchzuspielen, bevor
V1 als fertig gilt." Die **Abnahme der Meilensteine M5 bis M13** ist davon
unberührt und steht weiterhin aus — die Szenarien prüfen das Verhalten, nicht
die Vollständigkeit der IDs.
