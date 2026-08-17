# FORTSCHRITT

Statusverfolgung aller Anforderungen aus `rechnungs-app-anforderungen.md`.

**Status:** `offen` — noch nicht begonnen oder in Arbeit · `umgesetzt` — implementiert
und durch den genannten Nachweis belegt · `abgenommen` — vom Auftraggeber freigegeben.

**Nachweis:** Pfad zur Testdatei bzw. `Review:` / `Manuell:` bei den
Verifikationsarten R und M.

**MS:** Meilenstein laut Anforderungskatalog §16. Ein `†` markiert IDs, die in §16
**keinem** Meilenstein zugeordnet sind — der eingetragene Meilenstein ist ein
Vorschlag und steht noch zur Freigabe aus.

Stand: 2026-08-15 · 133 von 171 erledigt (93 abgenommen: M0–M4, 40 umgesetzt) ·
**M5 umgesetzt, Abnahme offen** · **M5.6 (PDF-Vorschau), M5.7 (Empfänger ohne
Kunde), M5.8 (überarbeitete Oberfläche), M6 (Übersicht), M6.1 (Ausführung) und
M6.2 (zweistufige Anmeldung) umgesetzt** — vier zuvor abgenommene IDs (FA-RECH-02, -12, FA-NUM-08,
FA-PFL-01) sind durch M5.7 im Wortlaut geändert und stehen erneut zur Abnahme.

Hinzu kommen 25 IDs aus `faktura-frontend-design.md` §9 (Abschnitt 16), die nicht
Teil der ursprünglichen 171 sind: alle 25 umgesetzt. FA-UI-07 und FA-UI-13 waren
bis M5.8 offen; FA-UI-17 bis -20 sind mit der Überarbeitung des Entwurfs
hinzugekommen.

**Verworfene HTML-Vorschau (M5.6).** Die Vorschau zeigte bis dahin eine
HTML-Nachbildung des Belegs. Sie konnte nie stimmen: `@page`-Ränder gelten nur
beim Drucken, am Bildschirm lief der Inhalt randlos über die volle Breite. Seit
M5.6 steht im Rahmen das erzeugte PDF. Folge für die Nachweise: Die
Pflichtangaben FA-PFL-01 bis -11 werden am Satz geprüft, den der Renderer
erhält, nicht an der fertigen Datei — Chromium bettet die Belegschrift als
Teilmenge ein, die Textbytes sind dann Glyphennummern und ohne vollwertigen
PDF-Parser nicht lesbar.

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
| FA-KUND-02 | Automatische eindeutige Kundennummer | MUSS | T | M2 | abgenommen | `tests/unit/domain/master-data.test.ts` (Format), `tests/integration/master-data.test.ts` (fortlaufend, auch bei gleichzeitiger Anlage) |
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
| FA-CALC-05 | §19: Satz 0, Kategorie E, Pflichthinweis | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-totals.test.ts`, `tests/unit/domain/master-data.test.ts` — §19 setzt sich über Kundenland und USt-IdNr hinweg |
| FA-CALC-06 | EU-B2B mit USt-IdNr: Kategorie AE, Satz 0, Hinweis | MUSS | T | M3 | abgenommen | `tests/unit/domain/master-data.test.ts` — EU-Kunde mit USt-IdNr ergibt AE mit Satz 0 |
| FA-CALC-07 | Drittland: Kategorie G vorgeschlagen | SOLL | T | M3 | abgenommen | `tests/unit/domain/master-data.test.ts` — CH, US und GB ergeben G |
| FA-CALC-08 | Vorgeschlagene Kategorie je Rechnung überschreibbar | MUSS | T | M3 | abgenommen | `tests/integration/invoice-numbering.test.ts` — Beleg mit abweichendem Verfahren wird übernommen; Feld `Invoice.taxScheme` |
| FA-CALC-09 | Gemischte Steuersätze korrekt und getrennt ausgewiesen | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-totals.test.ts`, `tests/integration/invoice-numbering.test.ts` — 7 % und 19 % getrennt ausgewiesen |
| FA-CALC-10 | Berechnung als reine Funktion ohne DB-Zugriff | MUSS | R | M3 | abgenommen | Review: `src/domain/invoice/totals.ts` ohne Datenbankbezug; `tests/unit/domain/invoice-totals.test.ts` prüft Wiederholbarkeit und Seiteneffektfreiheit |
| FA-CALC-11 | Tests: Rundung, Rabatt, Gruppen, §19, RC, Null, negativ | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-totals.test.ts` — Rundungsgrenzfälle, Rabatte, mehrere Gruppen, §19, Reverse Charge, Nullbeträge, negative Positionen |

## 5. Nummernkreis & Unveränderbarkeit

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-NUM-01 | Format konfigurierbar mit `{YYYY}` `{YY}` `{MM}` `{SEQ:n}` | MUSS | T | M3 | abgenommen | `tests/unit/domain/invoice-number.test.ts` — alle vier Platzhalter, Mehrfachnutzung, Breitenwachstum |
| FA-NUM-02 | Nummer ausschließlich beim Festschreiben | MUSS | T | M3 | abgenommen | `tests/integration/invoice-numbering.test.ts` — Entwurf ohne Nummer, Vergabe erst beim Festschreiben |
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
| FA-TPL-09 | Vorlagenänderung verändert erzeugte PDFs nicht | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — nach vollständigem Austausch der Vorlage liefert der Abruf denselben Hash und dieselben Bytes |

## 8. PDF-Ausgabe

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-PDF-01 | Festgeschriebene Rechnung als PDF herunterladbar | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts`; Route `/api/invoices/[id]/pdf` |
| FA-PDF-02 | Vorschau des Belegs, aktualisiert nach Eingabepause | MUSS | T | M5 | umgesetzt | `tests/integration/browser-preview.test.ts` — im Rahmen steht seit M5.6 das erzeugte PDF selbst, nicht mehr eine HTML-Nachbildung; `tests/integration/document-output.test.ts` |
| FA-PDF-03 | Entwurf als Vorschau-PDF, sichtbar gekennzeichnet | SOLL | M | M5 | umgesetzt | `tests/integration/document-output.test.ts` — Entwurfsvermerk im Blattkopf, nach dem Festschreiben nicht mehr |
| FA-PDF-04 | ≥60 Positionen brechen ohne Verlust über Seiten um | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — 60 Positionen, alle enthalten, mehrseitiges PDF |
| FA-PDF-05 | Tabellenkopf wiederholt sich auf Folgeseiten | MUSS | M | M5 | umgesetzt | `display: table-header-group` in der Standardvorlage; Manuell: Tabellenkopf auf Folgeseiten |
| FA-PDF-06 | Seitenangabe „Seite X von Y“ ab Seite 2 | MUSS | T | M5 | umgesetzt | `tests/unit/domain/page-numbering.test.ts`, `tests/unit/infrastructure/page-number-stamp.test.ts`, `tests/integration/document-output.test.ts` — einseitiger Beleg ohne Angabe, mehrseitiger ab Seite 2 |
| FA-PDF-07 | Summenblock nicht durch Seitenumbruch getrennt | SOLL | M | M5 | umgesetzt | `break-inside: avoid` auf Summenblock und Positionszeilen; Manuell: Summenblock bleibt zusammen |
| FA-PDF-08 | Anschriftfeld im Fensterumschlag DIN lang sichtbar | MUSS | M | M5 | umgesetzt | Anschriftfeld 85 × 45 mm ab 45 mm Blattoberkante (DIN 5008 Form B); Manuell: Sichtprüfung im Fensterumschlag DIN lang |
| FA-PDF-09 | Konfigurierbares Dateinamenmuster | SOLL | T | M5 | umgesetzt | `tests/unit/domain/template-upload.test.ts` (Muster und Filterung); einstellbar unter Einstellungen › Nummernkreis |
| FA-PDF-10 | Rendering 10 Positionen unter 3 s | SOLL | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — 10 Positionen unter 3 s bei laufendem Browser |
| FA-PDF-11 | Fehlgeschlagenes Rendering hinterlässt keine Datei | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — kaputte Vorlage hinterlässt weder Artefakt noch Datei; Schreiben über Zwischendatei und `rename` |

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
| NFA-SEC-02 | Keine öffentliche Registrierung, Erstuser per CLI | MUSS | R | M1 | abgenommen | `scripts/create-user.ts`; keine Registrierungsroute in `src/routes.ts`; Container: `node dist/create-user.mjs` |
| NFA-SEC-03 | Argon2id ≥64 MB, ≥3 Iterationen | MUSS | R | M1 | abgenommen | `tests/unit/infrastructure/security.test.ts` — prüft `m=65536,t=3,p=1` im erzeugten Hash |
| NFA-SEC-04 | Passwort ≥12 Zeichen, Abgleich Kompromittierungsliste | MUSS | T | M1 | abgenommen | `tests/unit/domain/auth-policies.test.ts`, `tests/unit/infrastructure/security.test.ts`; Liste in `resources/compromised-passwords.txt` (100.000 Einträge, offline) |
| NFA-SEC-05 | TOTP-2FA mit einmalig anzeigbaren Recovery-Codes | MUSS | M | M1 | umgesetzt | Manuell: TOTP unter /settings/security eingerichtet, QR-Code gescannt, Codes einmalig angezeigt · `tests/unit/domain/auth-policies.test.ts`; seit M6.2 zweistufig: `tests/integration/two-step-login.test.ts`, `tests/integration/browser-two-step-login.test.ts` |
| NFA-SEC-06 | Session-Token ≥256 Bit, nur Hash in der DB | MUSS | R | M1 | abgenommen | `tests/unit/infrastructure/security.test.ts` — 256 Bit, nur SHA-256-Hash in der Datenbank |
| NFA-SEC-07 | Cookie HttpOnly/Secure/SameSite=Lax, Rotation bei Login | MUSS | T | M1 | abgenommen | `tests/integration/route-protection.test.ts` (Attribute + Rotation), `tests/unit/infrastructure/security.test.ts` (Secure) |
| NFA-SEC-08 | Sperre 15 min nach 10 Fehlversuchen, protokolliert | MUSS | T | M1 | umgesetzt | `tests/integration/route-protection.test.ts` — Sperre nach 10 Versuchen, Audit-Einträge; `tests/integration/two-step-login.test.ts` — die Sperre zählt seit M6.2 auch im zweiten Schritt weiter |
| NFA-SEC-09 | Aktive Sessions einsehbar und beendbar | SOLL | M | M1 | abgenommen | Manuell: Sitzungsübersicht unter /settings/security, einzeln und gesammelt beendbar |
| NFA-SEC-10 | CSRF-Schutz für alle schreibenden Aktionen | MUSS | T | M1 | abgenommen | `tests/integration/route-protection.test.ts` — ohne Token, fremde Herkunft, falsches Token |
| NFA-SEC-11 | Serverseitige Schemavalidierung aller Eingaben | MUSS | R | M1 | abgenommen | Zod-Schemata in `src/app/login/actions.ts`, `src/app/settings/security/actions.ts`, `src/infrastructure/config/env.ts` |
| NFA-SEC-12 | Renderer ohne Netzwerkzugriff, nachgewiesen | MUSS | T | M5 | offen | — |
| NFA-SEC-13 | JavaScript im Rendering-Kontext deaktiviert | MUSS | R | M5 | offen | — |
| NFA-SEC-14 | Rendering-Timeout (Standard 15 s) bricht kontrolliert ab | MUSS | T | M5 | offen | — |
| NFA-SEC-15 | Uploads: Größe, MIME, Magic Bytes, ZIP-Slip-Schutz | MUSS | T | M5 | umgesetzt | `tests/unit/domain/template-upload.test.ts` — ZIP-Slip, Magic Bytes, Größenlimit, strenges UTF-8 |
| NFA-SEC-16 | Uploads außerhalb des Webroots, nur authentifiziert | MUSS | T | M5 | offen | — |
| NFA-SEC-17 | CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy | MUSS | R | M1 | abgenommen | `tests/unit/infrastructure/security.test.ts`, `tests/integration/route-protection.test.ts` |
| NFA-SEC-18 | Fehlermeldungen ohne Stacktrace/Pfade/SQL | MUSS | R | M1 | abgenommen | Review: generische Meldungen in `login.ts`; Healthcheck ohne Details; Ursachen nur im Serverlog |
| NFA-SEC-19 | Bindung nur an 127.0.0.1, TLS im Reverse Proxy | MUSS | R | M1 | abgenommen | Review: `docker-compose.yml` ohne `ports` am App-Dienst; TLS in `Caddyfile` |
| NFA-SEC-20 | Container läuft nicht als Root | MUSS | R | M1 | abgenommen | Manuell: `docker compose exec app id` → uid=1000(node) |
| NFA-SEC-21 | Keine Secrets im Repo oder Image | MUSS | R | M1 | abgenommen | Review: `.gitignore` und `.dockerignore` schließen `.env` aus; Konfiguration nur über ENV |
| NFA-SEC-22 † | Automatisierte Abhängigkeitsprüfung blockiert Build | SOLL | R | M0 † | abgenommen | `.github/workflows/ci.yml`, `npm run audit` (`--audit-level=high`) |

## 12. Datenschutz & Nachvollziehbarkeit

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-COMP-01 | Änderungen an Rechnungen/Kunden/Firma protokolliert | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts`, `tests/integration/master-data.test.ts` — Rechnungen, Kunden und Firmendaten mit Zeitpunkt, Aktion und Akteur |
| NFA-COMP-02 | Audit-Log über die Anwendung nicht änder-/löschbar | MUSS | R | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Prisma-Erweiterung und Datenbank-Trigger weisen Ändern und Löschen ab |
| NFA-COMP-03 | Vollständiger Datenexport maschinenlesbar | MUSS | M | M7 | umgesetzt | `/settings/backup` → `/api/export`; `src/application/export/export-data.ts` — Kunden, Belege mit Positionen und Zahlungen, Vorlagen, Nummernkreise und das Protokoll als JSON. Zugangsdaten bewusst nicht enthalten |
| NFA-COMP-04 | UI erklärt Archivierung statt Löschung | SOLL | M | M7 | umgesetzt | Kundenseite (`archiveExplanation`), Katalogseite und Belegseite (`noDeleteExplanation`) — jeweils dort, wo jemand zu löschen versucht, nicht in einer Hilfeseite |
| NFA-COMP-05 | Keine Datenübertragung an Dritte, offline lauffähig | MUSS | T | M7 | umgesetzt | `tests/architecture/offline.test.ts` — keine fremde Adresse im Quelltext, `default-src 'none'` mit `connect-src 'self'`, keine Telemetriepakete; `tests/integration/rendering.test.ts` weist die Blockade im Renderer nach (NFA-SEC-12) |
| NFA-COMP-06 | Keine externen Fonts, Skripte, Analysedienste | MUSS | R | M7 | umgesetzt | `tests/architecture/design-tokens.test.ts` — Schriften aus dem Paket, keine externe Adresse im Frontend |

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

## 14. Architektur & Erweiterbarkeit

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-ARCH-01 | Domain ohne Persistenz-/UI-/Framework-Importe, Lint erzwingt | MUSS | T | M0 | abgenommen | `tests/architecture/layering.test.ts` — seit M5.5a zusätzlich: Prisma-Client nur aus `src/infrastructure/repositories/**` |
| NFA-ARCH-02 | Ausgabeneutrales Dokumentmodell | MUSS | R | M5 | offen | — |
| NFA-ARCH-03 | Dokumentmodell enthält alle Felder aus Spec §9.2 | MUSS | T | M5 | offen | — |
| NFA-ARCH-04 | Einheiten als UN/ECE-Rec-20-Codes, Labels erst in der Anzeige | MUSS | T | M5 | offen | — |
| NFA-ARCH-05 | Steuerkategorien als UNTDID-5305-Codes | MUSS | T | M5 | offen | — |
| NFA-ARCH-06 | Konfigurierbare PDF-Nachbearbeitungskette, Testprozessor wirkt | MUSS | T | M5 | umgesetzt | `tests/integration/document-output.test.ts` — Reihenfolge, Durchreichen des Fehlers, leere Kette in V1 |
| NFA-ARCH-07 | Template-Engine und Renderer hinter Schnittstellen | MUSS | R | M5 | offen | — |
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
| FA-UI-14 | Aktionen laufen über eine zentrale `can()`-Funktion | MUSS | R | M5.5b | umgesetzt | `src/domain/policy/can.ts`; `tests/unit/domain/policy.test.ts` |
| FA-UI-15 | Sidebar-Zonen für Organisation und Nutzer mit fester Höhe | SOLL | R | M5.5b | umgesetzt | `src/app/app-shell.tsx` — `h-zone` (56 px) für beide Zonen |
| FA-UI-16 | Spalte „Erstellt von" im Tabellenschema angelegt, in V1 ausgeblendet | SOLL | R | M5.5b | umgesetzt | `src/ui/components/table.tsx` (`hidden`-Spalten); Rechnungsliste führt sie im Schema |
| FA-UI-17 | Bestätigungen als Dialog der Anwendung, nicht als `window.confirm`; der Dialog nennt die Folge | MUSS | T | M5.8 | umgesetzt | `src/ui/components/dialog.tsx`; `tests/integration/browser-invoice-list.test.ts` — natives `<dialog>`, Escape schließt, kein Browserfenster |
| FA-UI-18 | Jede Aktion ohne Seitenwechsel wird durch einen Toast bestätigt | MUSS | T | M5.8 | umgesetzt | `src/ui/components/toast.tsx`; `tests/integration/browser-invoice-list.test.ts` |
| FA-UI-19 | Belege aus der Liste heraus bezahlen, stornieren, duplizieren, herunterladen | MUSS | T | M5.8 | umgesetzt | `src/app/invoices/page.tsx`; `tests/integration/browser-invoice-list.test.ts` — sichtbar bei Hover und bei Tastaturfokus |
| FA-UI-20 | Mehrfachauswahl mit Sammelaktionen; Auswahl funktioniert ohne JavaScript | SOLL | T | M5.8 | umgesetzt | `src/app/invoices/selection-bar.tsx` — Sichtbarkeit über `:has(:checked)` in CSS; `tests/integration/browser-invoice-list.test.ts` |
| NFA-UI-01 | Kontrast ≥ 4.5:1 für Text, ≥ 3:1 für Bedienelemente | MUSS | T | M5.5b | umgesetzt | `tests/unit/ui/contrast.test.ts` — beide Farbschemata, seit M5.8 auch die rote Fläche der zerstörenden Zeilenaktion; `--ink-faint` gegenüber dem Entwurf abgedunkelt |
| NFA-UI-02 | Sichtbarer Fokusring überall; kein `outline: none` ohne Ersatz | MUSS | T | M5.5b | umgesetzt | `tests/architecture/design-tokens.test.ts`; `FOCUS_RING` in `src/ui/components/form.tsx` |
| NFA-UI-03 | Rechnungseditor inklusive Positionssortierung per Tastatur bedienbar | MUSS | M | M5.5b | umgesetzt | `src/app/invoices/invoice-editor.tsx` — `KeyboardSensor` mit `sortableKeyboardCoordinates`, zusätzlich die Knöpfe „Nach oben"/„Nach unten". Verifikationsart M: die Abnahme am Gerät steht aus |
| NFA-UI-04 | Keine externen Netzwerkanfragen aus dem Frontend | MUSS | T | M5.5b | umgesetzt | `tests/architecture/design-tokens.test.ts`; zusätzlich sperrt die CSP in `src/infrastructure/security/security-headers.ts` |
| NFA-UI-05 | Dunkles Farbschema verfügbar; Dokumentvorschau bleibt weiß | KANN | M | M5.5b | umgesetzt | `src/app/globals.css` — Tokenüberschreibung unter `prefers-color-scheme: dark`, `--sheet` unverändert; `tests/unit/ui/contrast.test.ts` prüft beide Schemata |

---

## Abnahmeszenarien (Katalog §17)

| ID | Szenario | Status |
|---|---|---|
| A1 | Regelfall Inland | offen |
| A2 | Gemischte Steuersätze | offen |
| A3 | Reverse Charge | offen |
| A4 | Storno | offen |
| A5 | Umfangreiche Rechnung (60 Positionen) | offen |
| A6 | Kundenumzug | offen |
| A7 | Bösartige Vorlage | offen |
| A8 | Zugriffsschutz | offen |
| A9 | Wiederherstellung | offen |
