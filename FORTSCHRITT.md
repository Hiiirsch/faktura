# FORTSCHRITT

Statusverfolgung aller Anforderungen aus `rechnungs-app-anforderungen.md`.

**Status:** `offen` — noch nicht begonnen oder in Arbeit · `umgesetzt` — implementiert
und durch den genannten Nachweis belegt · `abgenommen` — vom Auftraggeber freigegeben.

**Nachweis:** Pfad zur Testdatei bzw. `Review:` / `Manuell:` bei den
Verifikationsarten R und M.

**MS:** Meilenstein laut Anforderungskatalog §16. Ein `†` markiert IDs, die in §16
**keinem** Meilenstein zugeordnet sind — der eingetragene Meilenstein ist ein
Vorschlag und steht noch zur Freigabe aus.

Stand: 2026-08-11 · 98 von 171 erledigt (97 abgenommen: M0–M4, 1 umgesetzt) · **M5 offen**

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
| FA-RECH-02 | Kundenauswahl befüllt Adresse/Ziel/Steuerkategorie vor | MUSS | T | M4 | abgenommen | Manuell: Kundenauswahl im Editor belegt Zahlungsziel und Steuerverfahren vor (`src/app/invoices/editor-data.ts`) |
| FA-RECH-03 | Positionen hinzufügen, löschen, duplizieren, sortieren | MUSS | M | M4 | abgenommen | Manuell: Positionen hinzufügen, löschen, duplizieren; Sortieren per Drag & Drop und über Schaltflächen oben/unten (tastaturbedienbar) |
| FA-RECH-04 | Positionsfelder vollständig | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Bezeichnung, Beschreibung, Menge, Einheit, Preis, Satz je Position |
| FA-RECH-05 | Positionsrabatt in Prozent | SOLL | T | M4 | abgenommen | `tests/unit/domain/invoice-totals.test.ts`, `tests/integration/invoice-lifecycle.test.ts` — Positionsrabatt in Prozent, auch mit Nachkommastellen |
| FA-RECH-06 | Katalog-Autocomplete im Bezeichnungsfeld | SOLL | M | M4 | abgenommen | Manuell: Auswahlfeld „Aus Katalog übernehmen" im Editor füllt die letzte Position |
| FA-RECH-07 | Rechnungs-, Leistungs- und Fälligkeitsdatum erfassbar | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Rechnungs-, Leistungs- und Fälligkeitsdatum als Kalendertage |
| FA-RECH-08 | Fälligkeit aus Datum + Zahlungsziel vorbelegt, überschreibbar | MUSS | T | M4 | abgenommen | Manuell: Fälligkeit wird aus Rechnungsdatum und Zahlungsziel vorbelegt und ist überschreibbar |
| FA-RECH-09 | Einleitungs- und Schlusstext je Rechnung | SOLL | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Einleitungs- und Schlusstext je Beleg |
| FA-RECH-10 | Duplizieren als neuer Entwurf ohne Nummer | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Kopie ohne Nummer, ohne Snapshot, ohne Zahlungen |
| FA-RECH-11 | Entwürfe löschbar, festgeschriebene nicht | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Entwurf löschbar, festgeschriebener Beleg nicht (auch nicht am Use Case vorbei) |
| FA-RECH-12 | Vollständigkeitsprüfung vor Festschreiben blockiert | MUSS | T | M4 | abgenommen | `tests/unit/domain/invoice-completeness.test.ts`, `tests/integration/invoice-lifecycle.test.ts` — alle Verstöße gemeinsam gemeldet, Beleg bleibt Entwurf |
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
| FA-NUM-08 | Festgeschriebene Rechnung über UI nicht änderbar | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — inhaltliche Änderung am festgeschriebenen Beleg abgewiesen |
| FA-NUM-09 | Unveränderbarkeit auch in der Persistenzschicht | MUSS | T | M4 | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — Datenbank-Trigger weisen auch den direkten Schreibzugriff ab, inklusive Rückweg auf Entwurf |
| FA-NUM-10 | PDFs mit SHA-256 gespeichert, nie überschrieben | MUSS | T | M4 → M5 | offen | Setzt die PDF-Erzeugung voraus; Artefaktspeicher entsteht mit M5 |

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
| FA-TPL-01 | Vorlage aus Liquid-HTML + CSS, als Datei oder ZIP | MUSS | M | M5 | offen | — |
| FA-TPL-02 | Mehrere Vorlagen, eine als Standard | MUSS | T | M5 | offen | — |
| FA-TPL-03 | Abweichende Vorlage je Rechnung wählbar | SOLL | T | M5 | offen | — |
| FA-TPL-04 | Editor im Browser mit Highlighting und Live-Vorschau | SOLL | M | M5 | offen | — |
| FA-TPL-05 | DIN-5008-konforme Standardvorlage, Erststart-Import | MUSS | M | M5 | offen | — |
| FA-TPL-06 | Template-Variablen in der UI dokumentiert | MUSS | M | M5 | offen | — |
| FA-TPL-07 | Syntaxfehler → verständliche Meldung, kein Absturz | MUSS | T | M5 | offen | — |
| FA-TPL-08 | Seitenränder und -format je Vorlage konfigurierbar | SOLL | T | M5 | offen | — |
| FA-TPL-09 | Vorlagenänderung verändert erzeugte PDFs nicht | MUSS | T | M5 | offen | — |

## 8. PDF-Ausgabe

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-PDF-01 | Festgeschriebene Rechnung als PDF herunterladbar | MUSS | T | M5 | offen | — |
| FA-PDF-02 | Vorschau im Editor, aktualisiert nach Eingabepause | MUSS | M | M5 | offen | — |
| FA-PDF-03 | Entwurf als Vorschau-PDF, sichtbar gekennzeichnet | SOLL | M | M5 | offen | — |
| FA-PDF-04 | ≥60 Positionen brechen ohne Verlust über Seiten um | MUSS | T | M5 | offen | — |
| FA-PDF-05 | Tabellenkopf wiederholt sich auf Folgeseiten | MUSS | M | M5 | offen | — |
| FA-PDF-06 | Seitenangabe „Seite X von Y" auf jeder Seite | MUSS | T | M5 | offen | — |
| FA-PDF-07 | Summenblock nicht durch Seitenumbruch getrennt | SOLL | M | M5 | offen | — |
| FA-PDF-08 | Anschriftfeld im Fensterumschlag DIN lang sichtbar | MUSS | M | M5 | offen | — |
| FA-PDF-09 | Konfigurierbares Dateinamenmuster | SOLL | T | M5 | offen | — |
| FA-PDF-10 | Rendering 10 Positionen unter 3 s | SOLL | T | M5 | offen | — |
| FA-PDF-11 | Fehlgeschlagenes Rendering hinterlässt keine Datei | MUSS | T | M5 | offen | — |

## 9. Pflichtangaben auf dem Dokument

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-PFL-01 | Name und Anschrift beider Parteien | MUSS | T | M5 | offen | — |
| FA-PFL-02 | Steuernummer oder USt-IdNr des Ausstellers | MUSS | T | M5 | offen | — |
| FA-PFL-03 | Ausstellungsdatum | MUSS | T | M5 | offen | — |
| FA-PFL-04 | Fortlaufende Rechnungsnummer | MUSS | T | M5 | offen | — |
| FA-PFL-05 | Menge und Art der Leistung je Position | MUSS | T | M5 | offen | — |
| FA-PFL-06 | Zeitpunkt bzw. Zeitraum der Leistung | MUSS | T | M5 | offen | — |
| FA-PFL-07 | Entgelt nach Steuersätzen aufgeschlüsselt | MUSS | T | M5 | offen | — |
| FA-PFL-08 | Steuersatz und -betrag bzw. Befreiungshinweis | MUSS | T | M5 | offen | — |
| FA-PFL-09 | Reverse Charge: beide USt-IdNr + Hinweis | MUSS | T | M5 | offen | — |
| FA-PFL-10 | Bankverbindung und Zahlungsziel | MUSS | T | M5 | offen | — |
| FA-PFL-11 | Stornodokument bezeichnet und mit Bezugsnummer | MUSS | T | M5 | offen | — |

## 10. Dashboard

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| FA-DASH-01 | Offener Gesamtbetrag | MUSS | T | M6 | offen | — |
| FA-DASH-02 | Überfälliger Betrag und Anzahl | MUSS | T | M6 | offen | — |
| FA-DASH-03 | Umsatz laufender Monat und laufendes Jahr | MUSS | T | M6 | offen | — |
| FA-DASH-04 | Stornos und Entwürfe fließen nicht in den Umsatz | MUSS | T | M6 | umgesetzt | `tests/unit/domain/invoice-status.test.ts` — `countsTowardRevenue`; Storno lässt den Umsatz exakt auf den Ausgangswert zurückfallen |
| FA-DASH-05 | Diagramm Umsatz je Monat über 12 Monate | MUSS | M | M6 | offen | — |
| FA-DASH-06 | Liste überfälliger Rechnungen nach Dauer sortiert | MUSS | M | M6 | offen | — |
| FA-DASH-07 | Liste der in 14 Tagen fälligen Rechnungen | SOLL | M | M6 | offen | — |
| FA-DASH-08 | Zuletzt bearbeitete Rechnungen mit Status | SOLL | M | M6 | offen | — |
| FA-DASH-09 | Alle Kennzahlen aus einer zentralen Funktion | MUSS | R | M6 | offen | — |
| FA-DASH-10 | Umsätze auf Nettobasis, im UI beschriftet | MUSS | M | M6 | offen | — |
| FA-DASH-11 | Umsatzstärkste Kunden des laufenden Jahres | KANN | M | M6 | offen | — |

## 11. Sicherheit

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-SEC-01 | Ohne Session liefert jede Route 401/403, Test über alle Routen | MUSS | T | M1 | abgenommen | `tests/integration/route-protection.test.ts` — läuft jede Route des Verzeichnisses ohne Sitzung gegen den gebauten Server |
| NFA-SEC-02 | Keine öffentliche Registrierung, Erstuser per CLI | MUSS | R | M1 | abgenommen | `scripts/create-user.ts`; keine Registrierungsroute in `src/routes.ts`; Container: `node dist/create-user.mjs` |
| NFA-SEC-03 | Argon2id ≥64 MB, ≥3 Iterationen | MUSS | R | M1 | abgenommen | `tests/unit/infrastructure/security.test.ts` — prüft `m=65536,t=3,p=1` im erzeugten Hash |
| NFA-SEC-04 | Passwort ≥12 Zeichen, Abgleich Kompromittierungsliste | MUSS | T | M1 | abgenommen | `tests/unit/domain/auth-policies.test.ts`, `tests/unit/infrastructure/security.test.ts`; Liste in `resources/compromised-passwords.txt` (100.000 Einträge, offline) |
| NFA-SEC-05 | TOTP-2FA mit einmalig anzeigbaren Recovery-Codes | MUSS | M | M1 | abgenommen | Manuell: TOTP unter /settings/security eingerichtet, QR-Code gescannt, Codes einmalig angezeigt · `tests/unit/domain/auth-policies.test.ts` |
| NFA-SEC-06 | Session-Token ≥256 Bit, nur Hash in der DB | MUSS | R | M1 | abgenommen | `tests/unit/infrastructure/security.test.ts` — 256 Bit, nur SHA-256-Hash in der Datenbank |
| NFA-SEC-07 | Cookie HttpOnly/Secure/SameSite=Lax, Rotation bei Login | MUSS | T | M1 | abgenommen | `tests/integration/route-protection.test.ts` (Attribute + Rotation), `tests/unit/infrastructure/security.test.ts` (Secure) |
| NFA-SEC-08 | Sperre 15 min nach 10 Fehlversuchen, protokolliert | MUSS | T | M1 | abgenommen | `tests/integration/route-protection.test.ts` — Sperre nach 10 Versuchen, Audit-Einträge |
| NFA-SEC-09 | Aktive Sessions einsehbar und beendbar | SOLL | M | M1 | abgenommen | Manuell: Sitzungsübersicht unter /settings/security, einzeln und gesammelt beendbar |
| NFA-SEC-10 | CSRF-Schutz für alle schreibenden Aktionen | MUSS | T | M1 | abgenommen | `tests/integration/route-protection.test.ts` — ohne Token, fremde Herkunft, falsches Token |
| NFA-SEC-11 | Serverseitige Schemavalidierung aller Eingaben | MUSS | R | M1 | abgenommen | Zod-Schemata in `src/app/login/actions.ts`, `src/app/settings/security/actions.ts`, `src/infrastructure/config/env.ts` |
| NFA-SEC-12 | Renderer ohne Netzwerkzugriff, nachgewiesen | MUSS | T | M5 | offen | — |
| NFA-SEC-13 | JavaScript im Rendering-Kontext deaktiviert | MUSS | R | M5 | offen | — |
| NFA-SEC-14 | Rendering-Timeout (Standard 15 s) bricht kontrolliert ab | MUSS | T | M5 | offen | — |
| NFA-SEC-15 | Uploads: Größe, MIME, Magic Bytes, ZIP-Slip-Schutz | MUSS | T | M5 | offen | — |
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
| NFA-COMP-03 | Vollständiger Datenexport maschinenlesbar | MUSS | M | M7 | offen | — |
| NFA-COMP-04 | UI erklärt Archivierung statt Löschung | SOLL | M | M7 | offen | — |
| NFA-COMP-05 | Keine Datenübertragung an Dritte, offline lauffähig | MUSS | T | M7 | offen | — |
| NFA-COMP-06 | Keine externen Fonts, Skripte, Analysedienste | MUSS | R | M7 | offen | — |

## 13. Betrieb

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-BETR-01 | Start über `docker compose up` inkl. Migration | MUSS | M | M0 | abgenommen | Manuell: `docker compose up -d --build` auf leerem Datenstand — Migration `20260810105328_init_audit_log` angewandt, Container `healthy`, `GET /api/health` → 200 |
| NFA-BETR-02 | Konfiguration nur über ENV, vollständige `.env.example` | MUSS | R | M0 | abgenommen | `.env.example`, `src/infrastructure/config/env.ts` (Zod-Schema, Abbruch beim Start) |
| NFA-BETR-03 | Täglicher Backup-Job für DB und Dateispeicher | MUSS | M | M7 | offen | — |
| NFA-BETR-04 | Konsistente DB-Sicherung, kein einfaches Kopieren | MUSS | R | M7 | offen | — |
| NFA-BETR-05 | Backup manuell auslösbar und herunterladbar | SOLL | M | M7 | offen | — |
| NFA-BETR-06 | Wiederherstellung dokumentiert und einmal durchgeführt | MUSS | M | M7 | offen | — |
| NFA-BETR-07 | Nach Restore alle Daten und PDFs vollständig | MUSS | M | M7 | offen | — |
| NFA-BETR-08 | Healthcheck prüft DB und Renderer | MUSS | T | M7 | offen | — |
| NFA-BETR-09 | Strukturierte Logs auf stdout, Sicherheitsereignisse erkennbar | MUSS | R | M7 | offen | — |
| NFA-BETR-10 | Keine Passwörter, Token, Kundendatensätze in Logs | MUSS | R | M7 | offen | — |
| NFA-BETR-11 | README: Installation, Konfiguration, Backup, Restore, Update | MUSS | R | M7 | offen | — |

## 14. Architektur & Erweiterbarkeit

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-ARCH-01 | Domain ohne Persistenz-/UI-/Framework-Importe, Lint erzwingt | MUSS | T | M0 | abgenommen | `tests/architecture/layering.test.ts` |
| NFA-ARCH-02 | Ausgabeneutrales Dokumentmodell | MUSS | R | M5 | offen | — |
| NFA-ARCH-03 | Dokumentmodell enthält alle Felder aus Spec §9.2 | MUSS | T | M5 | offen | — |
| NFA-ARCH-04 | Einheiten als UN/ECE-Rec-20-Codes, Labels erst in der Anzeige | MUSS | T | M5 | offen | — |
| NFA-ARCH-05 | Steuerkategorien als UNTDID-5305-Codes | MUSS | T | M5 | offen | — |
| NFA-ARCH-06 | Konfigurierbare PDF-Nachbearbeitungskette, Testprozessor wirkt | MUSS | T | M5 | offen | — |
| NFA-ARCH-07 | Template-Engine und Renderer hinter Schnittstellen | MUSS | R | M5 | offen | — |
| NFA-ARCH-08 † | Statusänderungen erzeugen Domain-Events | SOLL | T | M4 † | abgenommen | `tests/integration/invoice-lifecycle.test.ts` — zusätzlicher Handler ohne Änderung der Kernlogik; ein fehlschlagender Handler kippt den Vorgang nicht |
| NFA-ARCH-09 † | Dokumenttyp als Enum modelliert | SOLL | R | M0 † | abgenommen | `src/domain/document/document-type.ts`, `tests/unit/domain/codes.test.ts` |
| NFA-ARCH-10 | DB-Zugriff nur über ORM, kein ungeprüftes Roh-SQL | MUSS | R | M0 | abgenommen | `tests/architecture/no-raw-sql.test.ts` (Lint-Regel + Quellcode-Scan) |

## 15. Qualität, Performance & Bedienung

| ID | Kurz | Prio | V | MS | Status | Nachweis |
|---|---|---|---|---|---|---|
| NFA-QUAL-01 | Domain-Testabdeckung ≥90 % | MUSS | T | M3 | abgenommen | `npm run test:coverage` — Domain-Schicht 100 % Statements, Functions und Lines bei einer Schwelle von 90 % |
| NFA-QUAL-02 | E2E über den kritischen Gesamtpfad | MUSS | T | M7 | offen | — |
| NFA-QUAL-03 | Build bricht bei TS-/Lint-Fehlern, kein `any` in der Domain | MUSS | R | M0 | abgenommen | `npm run verify`; `eslint.config.mjs` (`no-explicit-any` als Fehler, `--max-warnings=0`); `next.config.ts` (`ignoreBuildErrors: false`) |
| NFA-QUAL-04 | Listenansicht mit 1.000 Rechnungen unter 1 s | SOLL | T | M6 | offen | — |
| NFA-QUAL-05 | Dashboard bei 1.000 Rechnungen unter 1 s | SOLL | T | M6 | offen | — |
| NFA-QUAL-06 | Seed-Kommando mit realistischen Testdaten | MUSS | M | M7 | offen | — |
| NFA-QUAL-07 † | UI vollständig deutsch, Texte zentral | MUSS | R | M0 † | abgenommen | `src/i18n/de.ts`; Label-Tabellen als `Record<Code, string>` — ein fehlendes Label ist ein Compilerfehler. Bei jedem Meilenstein erneut zu prüfen |
| NFA-QUAL-08 † | Deutsche Formatierung für Beträge, Datum, Zahlen | MUSS | T | M0 † | abgenommen | `tests/unit/ui/format.test.ts` |
| NFA-QUAL-09 † | Tastaturbedienbarkeit, Labels an Formularfeldern | SOLL | M | M6 † | offen | — |
| NFA-QUAL-10 † | Nutzbar ab 1280 px voll, ab 768 px lesend | SOLL | M | M6 † | offen | — |
| NFA-QUAL-11 † | Rückfrage bei ungespeicherten Änderungen im Editor | SOLL | M | M4 † | abgenommen | Manuell: `beforeunload` im Rechnungseditor, sobald Änderungen vorliegen |
| NFA-QUAL-12 † | Bestätigung mit Erklärtext bei destruktiven Aktionen | MUSS | M | M4 † | abgenommen | Manuell: `ConfirmButton` bei Festschreiben, Stornieren, Entwurf löschen und Zahlung zurücknehmen — der Text nennt die Folge |

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
