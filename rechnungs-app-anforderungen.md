# Anforderungskatalog: Rechnungs-Webapp

Ergänzt die Spezifikation (`rechnungs-app-spec.md`). Jede Anforderung ist atomar,
prüfbar und einer Verifikationsmethode zugeordnet.

## Konventionen

**Priorität**
- **MUSS** — Abnahmerelevant. Ohne diese Anforderung gilt V1 als nicht fertig.
- **SOLL** — Wichtig, kann bei Zeitdruck in eine Folgeversion.
- **KANN** — Optional.

**Verifikation**
- **T** — automatisierter Test (Unit/Integration/E2E), muss in der Suite liegen
- **M** — manuelle Prüfung nach dokumentiertem Szenario
- **R** — Code-/Konfigurations-Review

**ID-Schema:** `FA-<Bereich>-<Nr>` funktional, `NFA-<Bereich>-<Nr>` nicht-funktional.

> **Hinweis:** Die Abschnitte zu Pflichtangaben, GoBD und Aufbewahrung geben den
> allgemeinen Stand wieder und sind keine Rechts- oder Steuerberatung. Vor dem
> Produktivbetrieb mit dem eigenen Steuerberater abgleichen — insbesondere, welche
> Pflichthinweise im konkreten Fall gelten.

---

## 1. Einstellungen & Stammdaten

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-STAMM-01 | Firmendaten (Name, Anschrift, Land, Kontakt) sind über die UI erfassbar und änderbar. | MUSS | T |
| FA-STAMM-02 | Steuernummer und USt-IdNr sind getrennt erfassbar; mindestens eines der beiden Felder ist Pflicht. | MUSS | T |
| FA-STAMM-03 | Das Kleinunternehmer-Flag (§19 UStG) ist setzbar und wirkt sich auf die Steuerermittlung neuer Rechnungen aus. | MUSS | T |
| FA-STAMM-04 | Bankverbindung (Kontoinhaber, IBAN, BIC, Institut) ist erfassbar; die IBAN wird per Prüfsummenverfahren validiert. | MUSS | T |
| FA-STAMM-05 | Ein Logo ist hochladbar (PNG/JPG/SVG, max. 2 MB) und in der Vorschau sichtbar. | MUSS | M |
| FA-STAMM-06 | Standard-Zahlungsziel, Standard-Steuersatz und Standardwährung sind konfigurierbar. | MUSS | T |
| FA-STAMM-07 | Ein Fußzeilentext ist mehrzeilig erfassbar. | SOLL | M |
| FA-STAMM-08 | Handelsregisterdaten und Geschäftsführer sind optional erfassbar. | SOLL | T |
| FA-STAMM-09 | Änderungen an den Firmenstammdaten werden im Audit-Log protokolliert. | MUSS | T |
| FA-STAMM-10 | Ein Leistungskatalog mit wiederverwendbaren Positionen ist pflegbar (Bezeichnung, Preis, Einheit, Steuersatz). | SOLL | T |

## 2. Kundenverwaltung

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-KUND-01 | Kunden sind anlegbar, bearbeitbar und in einer Liste durchsuchbar. | MUSS | T |
| FA-KUND-02 | Jeder Kunde erhält eine eindeutige, automatisch vergebene Kundennummer. | MUSS | T |
| FA-KUND-03 | Das Land wird als ISO-3166-1-alpha-2-Code gespeichert, nicht als Freitext. | MUSS | R |
| FA-KUND-04 | Eine USt-IdNr ist erfassbar und wird formal auf das Länderformat geprüft. | MUSS | T |
| FA-KUND-05 | Ein kundenspezifisches Zahlungsziel überschreibt den globalen Standard. | MUSS | T |
| FA-KUND-06 | Kunden können archiviert, aber nicht gelöscht werden, sofern Rechnungen existieren. | MUSS | T |
| FA-KUND-07 | Archivierte Kunden erscheinen nicht in der Auswahl neuer Rechnungen, bleiben aber in Altrechnungen sichtbar. | MUSS | T |
| FA-KUND-08 | Die Kundendetailseite zeigt alle zugehörigen Rechnungen mit Status und Betrag. | MUSS | M |
| FA-KUND-09 | Eine Leitweg-ID (Buyer Reference) ist optional erfassbar. | SOLL | T |
| FA-KUND-10 | Kunden sind als CSV importierbar und exportierbar. | KANN | M |

## 3. Rechnungserstellung

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-RECH-01 | Eine Rechnung ist als Entwurf speicherbar, ohne dass eine Rechnungsnummer vergeben wird. | MUSS | T |
| FA-RECH-02 | Bei Auswahl eines Kunden werden Adresse, Zahlungsziel und Steuerkategorie automatisch vorbefüllt. | MUSS | T |
| FA-RECH-03 | Positionen sind hinzufügbar, löschbar, duplizierbar und per Drag&Drop sortierbar. | MUSS | M |
| FA-RECH-04 | Jede Position hat Bezeichnung, optionale Beschreibung, Menge, Einheit, Einzelpreis und Steuersatz. | MUSS | T |
| FA-RECH-05 | Ein Positionsrabatt in Prozent ist erfassbar. | SOLL | T |
| FA-RECH-06 | Katalogpositionen sind über Autocomplete im Bezeichnungsfeld übernehmbar. | SOLL | M |
| FA-RECH-07 | Rechnungsdatum, Leistungsdatum bzw. -zeitraum und Fälligkeitsdatum sind erfassbar. | MUSS | T |
| FA-RECH-08 | Das Fälligkeitsdatum wird aus Rechnungsdatum + Zahlungsziel vorbelegt, ist aber überschreibbar. | MUSS | T |
| FA-RECH-09 | Frei formulierbare Einleitungs- und Schlusstexte sind je Rechnung erfassbar. | SOLL | T |
| FA-RECH-10 | Eine bestehende Rechnung ist als neuer Entwurf duplizierbar; die Kopie erhält keine Nummer. | MUSS | T |
| FA-RECH-11 | Entwürfe sind löschbar; festgeschriebene Rechnungen nicht. | MUSS | T |
| FA-RECH-12 | Vor dem Festschreiben prüft das System auf Vollständigkeit (Kunde, mind. eine Position, Datumsfelder) und blockiert mit klarer Meldung. | MUSS | T |
| FA-RECH-13 | Beim Festschreiben werden Käufer- und Verkäuferdaten als unveränderlicher Snapshot in die Rechnung kopiert. | MUSS | T |
| FA-RECH-14 | Eine Änderung der Kundenstammdaten verändert bereits festgeschriebene Rechnungen nicht. | MUSS | T |
| FA-RECH-15 | Die Rechnungsliste ist nach Status, Kunde, Zeitraum und Volltext filterbar. | MUSS | M |
| FA-RECH-16 | Die Rechnungsliste ist nach Nummer, Datum, Betrag und Fälligkeit sortierbar. | SOLL | M |

## 4. Berechnung & Steuer

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-CALC-01 | Alle Geldbeträge werden intern als Integer in Cent gespeichert und verarbeitet; Gleitkommatypen kommen in der Berechnungskette nicht vor. | MUSS | R |
| FA-CALC-02 | Der Positionsnettobetrag wird kaufmännisch auf Cent gerundet. | MUSS | T |
| FA-CALC-03 | Positionen werden nach Kombination aus Steuersatz und Steuerkategorie gruppiert; die Steuer wird je Gruppe gerundet, nicht je Position. | MUSS | T |
| FA-CALC-04 | Die Summe der Steuerbeträge aller Gruppen entspricht exakt der ausgewiesenen Gesamtsteuer. | MUSS | T |
| FA-CALC-05 | Bei aktiviertem Kleinunternehmer-Flag erhalten alle Positionen Steuersatz 0 und Kategorie `E`; ein Pflichthinweis wird automatisch ergänzt. | MUSS | T |
| FA-CALC-06 | Bei EU-Kunden mit hinterlegter USt-IdNr wird Kategorie `AE` (Reverse Charge) mit Steuersatz 0 vorgeschlagen und ein Hinweistext ergänzt. | MUSS | T |
| FA-CALC-07 | Bei Kunden außerhalb der EU wird Kategorie `G` vorgeschlagen. | SOLL | T |
| FA-CALC-08 | Die vorgeschlagene Steuerkategorie ist je Rechnung manuell überschreibbar. | MUSS | T |
| FA-CALC-09 | Gemischte Steuersätze innerhalb einer Rechnung werden korrekt verarbeitet und getrennt ausgewiesen. | MUSS | T |
| FA-CALC-10 | Die Berechnung ist als reine Funktion ohne Datenbankzugriff implementiert und vollständig unit-testbar. | MUSS | R |
| FA-CALC-11 | Für die Berechnungslogik existieren Tests für: Rundungsgrenzfälle, Rabatte, mehrere Steuergruppen, §19, Reverse Charge, Nullbeträge und negative Positionen. | MUSS | T |

## 5. Nummernkreis & Unveränderbarkeit

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-NUM-01 | Das Nummernformat ist konfigurierbar und unterstützt die Platzhalter `{YYYY}`, `{YY}`, `{MM}`, `{SEQ:n}`. | MUSS | T |
| FA-NUM-02 | Die Rechnungsnummer wird ausschließlich beim Festschreiben vergeben. | MUSS | T |
| FA-NUM-03 | Nummernvergabe und Statuswechsel erfolgen in einer einzigen Datenbanktransaktion. | MUSS | R |
| FA-NUM-04 | Zwei nebenläufige Festschreibungen erzeugen niemals dieselbe Nummer. | MUSS | T |
| FA-NUM-05 | Der Zähler startet zu Jahresbeginn neu, sofern das Format eine Jahreskomponente enthält. | SOLL | T |
| FA-NUM-06 | Der aktuelle Zählerstand ist in den Einstellungen einsehbar. | SOLL | M |
| FA-NUM-07 | Ein einmaliger manueller Startwert ist setzbar, um eine Migration aus einem Altsystem lückenlos fortzuführen. | SOLL | T |
| FA-NUM-08 | Nach dem Festschreiben sind Positionen, Beträge, Daten und Kundenbezug einer Rechnung über die UI nicht mehr änderbar. | MUSS | T |
| FA-NUM-09 | Die Unveränderbarkeit wird zusätzlich in der Persistenzschicht durchgesetzt, nicht nur im UI. | MUSS | T |
| FA-NUM-10 | Erzeugte PDFs werden mit SHA-256-Prüfsumme gespeichert und nie überschrieben. | MUSS | T |

## 6. Status & Zahlungen

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-STAT-01 | Der Status einer Rechnung ist genau einer von: Entwurf, Offen, Teilbezahlt, Bezahlt, Storniert. | MUSS | T |
| FA-STAT-02 | Überfälligkeit ist ein abgeleiteter Zustand und wird nicht persistiert. | MUSS | R |
| FA-STAT-03 | Zahlungen werden als einzelne Datensätze mit Betrag, Datum und optionaler Zahlungsart erfasst. | MUSS | T |
| FA-STAT-04 | Bei Zahlungseingang unterhalb des Gesamtbetrags wechselt der Status auf Teilbezahlt. | MUSS | T |
| FA-STAT-05 | Erreicht oder übersteigt die Summe der Zahlungen den Bruttobetrag, wechselt der Status automatisch auf Bezahlt. | MUSS | T |
| FA-STAT-06 | Eine Schnellaktion „Als vollständig bezahlt markieren" erfasst eine Zahlung über den Restbetrag zum gewählten Datum. | MUSS | T |
| FA-STAT-07 | Erfasste Zahlungen sind korrigierbar bzw. stornierbar; der Status wird neu abgeleitet. | SOLL | T |
| FA-STAT-08 | Eine Stornierung erzeugt ein eigenständiges Stornodokument mit eigener Nummer und Bezug auf die Originalrechnung. | MUSS | T |
| FA-STAT-09 | Die stornierte Originalrechnung wechselt auf Status Storniert und bleibt vollständig erhalten. | MUSS | T |
| FA-STAT-10 | Eine Stornierung ist auch nach vollständiger Bezahlung möglich. | SOLL | T |
| FA-STAT-11 | Jeder Statuswechsel wird mit Zeitstempel und Auslöser im Audit-Log protokolliert. | MUSS | T |

## 7. Vorlagen

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-TPL-01 | Eine Vorlage besteht aus Liquid-HTML und CSS und ist als Datei oder ZIP hochladbar. | MUSS | M |
| FA-TPL-02 | Mehrere Vorlagen sind parallel verwaltbar; eine ist als Standard markierbar. | MUSS | T |
| FA-TPL-03 | Je Rechnung ist eine abweichende Vorlage wählbar. | SOLL | T |
| FA-TPL-04 | Vorlagen sind im Browser bearbeitbar, mit Syntax-Highlighting und Live-Vorschau anhand von Beispieldaten. | SOLL | M |
| FA-TPL-05 | Eine funktionsfähige, DIN-5008-konforme Standardvorlage wird ausgeliefert und beim Erststart importiert. | MUSS | M |
| FA-TPL-06 | Die verfügbaren Template-Variablen sind in der UI dokumentiert. | MUSS | M |
| FA-TPL-07 | Ein Syntaxfehler in einer Vorlage führt zu einer verständlichen Fehlermeldung, nicht zu einem Absturz oder einem leeren PDF. | MUSS | T |
| FA-TPL-08 | Seitenränder und Seitenformat sind je Vorlage konfigurierbar. | SOLL | T |
| FA-TPL-09 | Eine geänderte Vorlage verändert bereits erzeugte PDFs nicht. | MUSS | T |

## 8. PDF-Ausgabe

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-PDF-01 | Jede festgeschriebene Rechnung ist als PDF herunterladbar. | MUSS | T |
| FA-PDF-02 | Im Editor wird eine Vorschau des gerenderten Dokuments angezeigt, die sich nach Eingabepausen aktualisiert. | MUSS | M |
| FA-PDF-03 | Auch Entwürfe sind als Vorschau-PDF exportierbar, sichtbar als Entwurf gekennzeichnet. | SOLL | M |
| FA-PDF-04 | Eine Rechnung mit mindestens 60 Positionen bricht über mehrere Seiten um, ohne dass Inhalte abgeschnitten werden. | MUSS | T |
| FA-PDF-05 | Der Kopf der Positionstabelle wiederholt sich auf jeder Folgeseite. | MUSS | M |
| FA-PDF-06 | Jede Seite trägt eine Seitenangabe im Format „Seite X von Y". | MUSS | T |
| FA-PDF-07 | Der Summenblock wird nicht durch einen Seitenumbruch getrennt. | SOLL | M |
| FA-PDF-08 | Das Anschriftfeld ist so positioniert, dass es im Fensterumschlag DIN lang sichtbar ist. | MUSS | M |
| FA-PDF-09 | Der Dateiname des Downloads folgt einem konfigurierbaren Muster, standardmäßig `Rechnung_<Nummer>_<Kunde>.pdf`. | SOLL | T |
| FA-PDF-10 | Das Rendering einer Rechnung mit 10 Positionen dauert im Normalbetrieb unter 3 Sekunden. | SOLL | T |
| FA-PDF-11 | Ein fehlgeschlagenes Rendering hinterlässt keine unvollständige Datei im Artefaktspeicher. | MUSS | T |

## 9. Pflichtangaben auf dem Dokument

Prüfbar anhand der ausgelieferten Standardvorlage.

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-PFL-01 | Vollständiger Name und Anschrift des eigenen Unternehmens und des Kunden werden ausgegeben. | MUSS | T |
| FA-PFL-02 | Steuernummer oder USt-IdNr des eigenen Unternehmens wird ausgegeben. | MUSS | T |
| FA-PFL-03 | Ausstellungsdatum wird ausgegeben. | MUSS | T |
| FA-PFL-04 | Die fortlaufende Rechnungsnummer wird ausgegeben. | MUSS | T |
| FA-PFL-05 | Menge und Art bzw. Umfang der Leistung werden je Position ausgegeben. | MUSS | T |
| FA-PFL-06 | Der Zeitpunkt bzw. Zeitraum der Leistung wird ausgegeben. | MUSS | T |
| FA-PFL-07 | Das Entgelt wird nach Steuersätzen aufgeschlüsselt ausgegeben. | MUSS | T |
| FA-PFL-08 | Steuersatz und Steuerbetrag werden ausgewiesen; bei Steuerbefreiung stattdessen der entsprechende Hinweis. | MUSS | T |
| FA-PFL-09 | Bei Reverse Charge werden beide USt-IdNr sowie der Hinweis auf die Steuerschuldnerschaft des Leistungsempfängers ausgegeben. | MUSS | T |
| FA-PFL-10 | Bankverbindung und Zahlungsziel werden ausgegeben. | MUSS | T |
| FA-PFL-11 | Ein Stornodokument ist als solches eindeutig bezeichnet und nennt die Nummer der stornierten Rechnung. | MUSS | T |

## 10. Dashboard

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-DASH-01 | Das Dashboard zeigt den offenen Gesamtbetrag aller nicht bezahlten, nicht stornierten Rechnungen. | MUSS | T |
| FA-DASH-02 | Es zeigt den überfälligen Betrag und die Anzahl überfälliger Rechnungen. | MUSS | T |
| FA-DASH-03 | Es zeigt den Umsatz des laufenden Monats und des laufenden Jahres. | MUSS | T |
| FA-DASH-04 | Stornierte Rechnungen und Entwürfe fließen in keine Umsatzkennzahl ein. | MUSS | T |
| FA-DASH-05 | Ein Diagramm zeigt den Umsatz je Monat über die letzten 12 Monate. | MUSS | M |
| FA-DASH-06 | Eine Liste zeigt überfällige Rechnungen, sortiert nach Überfälligkeitsdauer. | MUSS | M |
| FA-DASH-07 | Eine Liste zeigt Rechnungen, die in den nächsten 14 Tagen fällig werden. | SOLL | M |
| FA-DASH-08 | Die zuletzt bearbeiteten Rechnungen werden mit Statuskennzeichnung angezeigt. | SOLL | M |
| FA-DASH-09 | Alle Kennzahlen stammen aus einer einzigen zentralen Auswertungsfunktion. | MUSS | R |
| FA-DASH-10 | Umsätze werden auf Nettobasis ausgewiesen; die Bezugsgröße ist im UI beschriftet. | MUSS | M |
| FA-DASH-11 | Ein Kennzahlenblock zeigt die umsatzstärksten Kunden des laufenden Jahres. | KANN | M |

## 11. Sicherheit

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| NFA-SEC-01 | Ohne gültige Session liefert jede Server Action, API- und Download-Route 401 oder 403 — nachgewiesen durch einen Test, der alle Routen automatisiert durchläuft. | MUSS | T |
| NFA-SEC-02 | Es existiert keine öffentliche Registrierung; der Erstbenutzer wird per CLI angelegt. | MUSS | R |
| NFA-SEC-03 | Passwörter werden mit Argon2id gehasht (≥64 MB Speicher, ≥3 Iterationen). | MUSS | R |
| NFA-SEC-04 | Passwörter müssen mindestens 12 Zeichen haben und werden gegen eine Liste bekannter kompromittierter Passwörter geprüft. | MUSS | T |
| NFA-SEC-05 | TOTP-Zweifaktorauthentifizierung ist aktivierbar, inklusive einmalig anzeigbarer Recovery-Codes. | MUSS | M |
| NFA-SEC-06 | Session-Token bestehen aus mindestens 256 Bit Entropie; in der Datenbank liegt nur deren Hash. | MUSS | R |
| NFA-SEC-07 | Session-Cookies sind `HttpOnly`, `Secure` und `SameSite=Lax`; das Token rotiert bei jedem Login. | MUSS | T |
| NFA-SEC-08 | Nach 10 fehlgeschlagenen Loginversuchen wird der Zugang für 15 Minuten gesperrt; Fehlversuche werden protokolliert. | MUSS | T |
| NFA-SEC-09 | Aktive Sessions sind einsehbar und einzeln sowie gesammelt beendbar. | SOLL | M |
| NFA-SEC-10 | Alle schreibenden Aktionen sind gegen CSRF geschützt (Origin-Prüfung und Token). | MUSS | T |
| NFA-SEC-11 | Sämtliche Eingaben werden serverseitig gegen ein Schema validiert; Client-Validierung ist nicht die einzige Prüfung. | MUSS | R |
| NFA-SEC-12 | Der PDF-Renderer hat keinen Netzwerkzugriff: ein Template mit externer Bildreferenz erzeugt nachweislich keinen ausgehenden Request. | MUSS | T |
| NFA-SEC-13 | JavaScript ist im Rendering-Kontext deaktiviert. | MUSS | R |
| NFA-SEC-14 | Das Rendering bricht nach einem konfigurierbaren Timeout (Standard 15 s) kontrolliert ab. | MUSS | T |
| NFA-SEC-15 | Uploads werden auf Größe, MIME-Typ und Magic Bytes geprüft; ZIP-Archive sind gegen Path Traversal abgesichert. | MUSS | T |
| NFA-SEC-16 | Hochgeladene Dateien liegen außerhalb des öffentlich ausgelieferten Verzeichnisses und sind nur über authentifizierte Routen erreichbar. | MUSS | T |
| NFA-SEC-17 | Die Anwendung setzt CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY` und `Referrer-Policy`. | MUSS | R |
| NFA-SEC-18 | Fehlermeldungen an den Client enthalten keine Stacktraces, Dateipfade oder SQL-Fragmente. | MUSS | R |
| NFA-SEC-19 | Die Anwendung bindet ausschließlich an `127.0.0.1`; TLS terminiert im vorgelagerten Reverse Proxy. | MUSS | R |
| NFA-SEC-20 | Der Anwendungscontainer läuft nicht als Root. | MUSS | R |
| NFA-SEC-21 | Es existieren keine Secrets im Repository oder im Container-Image. | MUSS | R |
| NFA-SEC-22 | Die Abhängigkeitsprüfung läuft automatisiert; Funde mit Schweregrad hoch oder kritisch blockieren den Build. | SOLL | R |

## 12. Datenschutz & Nachvollziehbarkeit

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| NFA-COMP-01 | Alle Änderungen an Rechnungen, Kunden und Firmenstammdaten werden mit Zeitpunkt, Aktion und Akteur protokolliert. | MUSS | T |
| NFA-COMP-02 | Das Audit-Log ist über die Anwendung nicht löschbar oder änderbar. | MUSS | R |
| NFA-COMP-03 | Ein vollständiger Datenexport aller Kunden- und Rechnungsdaten in maschinenlesbarer Form ist auslösbar. | MUSS | M |
| NFA-COMP-04 | Die UI erklärt an der Stelle des Löschversuchs, warum Rechnungsdaten nur archiviert und nicht gelöscht werden. | SOLL | M |
| NFA-COMP-05 | Es werden keine Daten an Dritte übertragen; die Anwendung funktioniert ohne ausgehende Internetverbindung. | MUSS | T |
| NFA-COMP-06 | Es sind keine externen Schriftarten, Skripte oder Analysedienste eingebunden. | MUSS | R |

## 13. Betrieb

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| NFA-BETR-01 | Die Anwendung startet vollständig über `docker compose up` inklusive Datenbankmigration. | MUSS | M |
| NFA-BETR-02 | Die gesamte Konfiguration erfolgt über Umgebungsvariablen; eine vollständige `.env.example` liegt bei. | MUSS | R |
| NFA-BETR-03 | Ein automatischer täglicher Backup-Job sichert Datenbank und Dateispeicher konsistent. | MUSS | M |
| NFA-BETR-04 | Die Datenbanksicherung erfolgt konsistent über ein dafür vorgesehenes Verfahren, nicht durch einfaches Kopieren der Datei im laufenden Betrieb. | MUSS | R |
| NFA-BETR-05 | Ein Backup ist über die Oberfläche manuell auslösbar und herunterladbar. | SOLL | M |
| NFA-BETR-06 | Die Wiederherstellung ist dokumentiert und wurde mindestens einmal nachweislich durchgeführt. | MUSS | M |
| NFA-BETR-07 | Nach einer Wiederherstellung sind alle Rechnungen, Kunden, Vorlagen und PDFs vollständig vorhanden. | MUSS | M |
| NFA-BETR-08 | Ein Healthcheck-Endpunkt prüft Datenbankverbindung und Verfügbarkeit des Renderers. | MUSS | T |
| NFA-BETR-09 | Logs werden strukturiert auf stdout ausgegeben; sicherheitsrelevante Ereignisse sind als solche erkennbar. | MUSS | R |
| NFA-BETR-10 | Logs enthalten keine Passwörter, Token oder vollständigen Kundendatensätze. | MUSS | R |
| NFA-BETR-11 | Das README beschreibt Installation, Konfiguration, Backup, Restore und Update in nachvollziehbaren Schritten. | MUSS | R |

## 14. Architektur & Erweiterbarkeit

Diese Anforderungen sind Selbstzweck-verdächtig, aber genau sie entscheiden über den
Aufwand der Nachrüstung. Sie werden per Review und durch Struktur-Tests geprüft.

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| NFA-ARCH-01 | Die Domain-Schicht enthält keine Importe aus Persistenz-, UI- oder Framework-Modulen; ein Lint-Regelwerk erzwingt dies. | MUSS | T |
| NFA-ARCH-02 | Es existiert ein ausgabeneutrales Dokumentmodell, aus dem sowohl die HTML-Ausgabe als auch künftige Formate erzeugt werden. | MUSS | R |
| NFA-ARCH-03 | Das Dokumentmodell enthält alle in der Spezifikation §9.2 genannten normrelevanten Felder. | MUSS | T |
| NFA-ARCH-04 | Einheiten werden als UN/ECE-Rec-20-Codes gespeichert; die deutschen Labels entstehen erst in der Anzeigeschicht. | MUSS | T |
| NFA-ARCH-05 | Steuerkategorien werden als UNTDID-5305-Codes gespeichert. | MUSS | T |
| NFA-ARCH-06 | Die PDF-Pipeline besitzt eine konfigurierbare Nachbearbeitungskette; ein Testprozessor lässt sich einhängen und verändert nachweislich die Ausgabe. | MUSS | T |
| NFA-ARCH-07 | Template-Engine und PDF-Renderer sind hinter Schnittstellen gekapselt und austauschbar, ohne aufrufenden Code zu ändern. | MUSS | R |
| NFA-ARCH-08 | Statusänderungen erzeugen Domain-Events, an die sich zusätzliche Handler ohne Änderung der Kernlogik anhängen lassen. | SOLL | T |
| NFA-ARCH-09 | Der Dokumenttyp ist als Enum modelliert, sodass weitere Belegarten ergänzbar sind. | SOLL | R |
| NFA-ARCH-10 | Der Datenbankzugriff erfolgt ausschließlich über den ORM; es existieren keine ungeprüften Roh-SQL-Aufrufe. | MUSS | R |

## 15. Qualität, Performance & Bedienung

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| NFA-QUAL-01 | Die Testabdeckung der Domain-Schicht (Berechnung, Status, Nummernkreis) beträgt mindestens 90 %. | MUSS | T |
| NFA-QUAL-02 | Es existieren End-to-End-Tests für den Pfad: Anmelden → Kunde anlegen → Rechnung erstellen → festschreiben → PDF laden → Zahlung erfassen → stornieren. | MUSS | T |
| NFA-QUAL-03 | Der Build schlägt bei TypeScript-Fehlern oder Lint-Verstößen fehl; `any` ist in der Domain-Schicht unzulässig. | MUSS | R |
| NFA-QUAL-04 | Listenansichten mit 1.000 Rechnungen laden in unter 1 Sekunde. | SOLL | T |
| NFA-QUAL-05 | Das Dashboard lädt bei 1.000 Rechnungen in unter 1 Sekunde. | SOLL | T |
| NFA-QUAL-06 | Es existiert ein Seed-Kommando, das realistische Testdaten erzeugt (Kunden, Rechnungen über mehrere Jahre, alle Statuswerte). | MUSS | M |
| NFA-QUAL-07 | Die Oberfläche ist vollständig auf Deutsch; Texte liegen zentral, sodass weitere Sprachen ergänzbar sind. | MUSS | R |
| NFA-QUAL-08 | Beträge, Datumsangaben und Zahlen werden nach deutschen Konventionen formatiert. | MUSS | T |
| NFA-QUAL-09 | Alle Kernfunktionen sind per Tastatur bedienbar; Formularfelder haben zugeordnete Labels. | SOLL | M |
| NFA-QUAL-10 | Die Anwendung ist auf Bildschirmbreiten ab 1280 px uneingeschränkt und ab 768 px lesend nutzbar. | SOLL | M |
| NFA-QUAL-11 | Ungespeicherte Änderungen im Rechnungseditor lösen beim Verlassen eine Rückfrage aus. | SOLL | M |
| NFA-QUAL-12 | Destruktive Aktionen (Festschreiben, Stornieren, Entwurf löschen) erfordern eine Bestätigung mit erklärendem Text. | MUSS | M |

---

## 16. Zuordnung zu Meilensteinen

| Meilenstein | Abzudeckende Anforderungen |
|---|---|
| M0 Fundament | NFA-BETR-01, -02; NFA-ARCH-01, -10; NFA-QUAL-03 |
| M1 Auth & Sicherheit | NFA-SEC-01 bis -11, -17 bis -21 |
| M2 Stammdaten | FA-STAMM-*, FA-KUND-* |
| M3 Domain-Kern | FA-CALC-*, FA-NUM-01 bis -07, FA-STAT-01 bis -05; NFA-QUAL-01 |
| M4 Rechnungen | FA-RECH-*, FA-NUM-08 bis -10, FA-STAT-06 bis -11, NFA-COMP-01, -02 |
| M5 Vorlagen & PDF | FA-TPL-*, FA-PDF-*, FA-PFL-*, NFA-SEC-12 bis -16, NFA-ARCH-02 bis -07 |
| M6 Dashboard | FA-DASH-*, NFA-QUAL-04, -05 |
| M7 Betrieb | NFA-BETR-03 bis -11, NFA-COMP-03 bis -06, NFA-QUAL-02, -06 |

---

## 17. Abnahmeszenarien

Manuell durchzuspielen, bevor V1 als fertig gilt.

**A1 — Regelfall Inland**
Kunde in Deutschland anlegen, Rechnung mit drei Positionen zu 19 % erstellen,
festschreiben, PDF prüfen (alle Pflichtangaben aus §9 vorhanden), Zahlung erfassen,
Status wird Bezahlt, Dashboard-Kennzahlen ändern sich entsprechend.

**A2 — Gemischte Steuersätze**
Rechnung mit Positionen zu 7 % und 19 % sowie einem Positionsrabatt. Prüfen: getrennte
Steueraufstellung, Summe der Gruppen = Gesamtsteuer, korrekte Rundung.

**A3 — Reverse Charge**
Kunde in Österreich mit USt-IdNr. Rechnung erstellen: Kategorie `AE` wird
vorgeschlagen, Steuerbetrag 0, beide USt-IdNr und der Hinweis auf die
Steuerschuldnerschaft erscheinen im PDF.

**A4 — Storno**
Festgeschriebene, bereits bezahlte Rechnung stornieren. Prüfen: Stornodokument mit
eigener Nummer und Bezug, Original bleibt vollständig erhalten, Nummernkreis bleibt
lückenlos, Dashboard rechnet die Rechnung aus dem Umsatz heraus.

**A5 — Umfangreiche Rechnung**
Rechnung mit 60 Positionen und langen Beschreibungstexten. Prüfen: sauberer
Seitenumbruch, wiederholter Tabellenkopf, korrekte Seitenzählung, ungetrennter
Summenblock.

**A6 — Kundenumzug**
Kundenadresse nach dem Festschreiben einer Rechnung ändern, PDF erneut erzeugen.
Die alte Rechnung zeigt weiterhin die ursprüngliche Adresse.

**A7 — Bösartige Vorlage**
Vorlage mit externer Bildreferenz und eingebettetem Skript hochladen. Prüfen: kein
ausgehender Request, kein Skript ausgeführt, verständliche Fehlermeldung bei
Syntaxfehlern.

**A8 — Zugriffsschutz**
Ohne Anmeldung eine bekannte PDF-Download-URL und mehrere Seiten-Routen aufrufen.
Alle liefern 401/403 und geben keine Inhalte preis.

**A9 — Wiederherstellung**
Backup erzeugen, Container samt Volumes löschen, aus dem Backup wiederherstellen.
Alle Daten und PDFs sind vollständig vorhanden.
