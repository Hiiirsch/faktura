# Faktura — Frontend & Design

Ergänzt `rechnungs-app-spec.md` und `rechnungs-app-anforderungen.md`. Dieses Dokument
ist für die Umsetzung verbindlich: alle Farben, Größen und Abstände werden aus den
Tokens in §2 abgeleitet, nicht frei gewählt.

---

## 1. Gestalterische These

**Das Dokument ist das Produkt. Die Oberfläche ist Werkzeug.**

Faktura ist kein Ort, an dem man sich aufhält. Man kommt herein, bringt eine Rechnung
heraus, prüft wer nicht gezahlt hat, geht wieder. Jede Fläche, die um den Beleg herum
um Aufmerksamkeit wirbt, arbeitet gegen diesen Zweck.

Daraus folgt die eine tragende Entscheidung:

> **Das Blatt ist die einzige erhabene Fläche der Anwendung.** Die Dokumentvorschau hat
> als einziges Element einen echten Schatten, reines Weiß und **eckige Kanten** —
> Papier hat keine abgerundeten Ecken. Alles andere ist flach, ohne Karten, ohne
> Schatten, getrennt allein durch Haarlinien und Weißraum, und trägt 3 px Radius.

Diese Inversion — Chrome weich und flach, Inhalt hart und erhaben — trägt die gesamte
Bildsprache. Sie ist an genau einer Stelle mutig und überall sonst diszipliniert.

**Zweites Prinzip: Die Zahl ist die Überschrift.** Die größte Schrift der Anwendung ist
keine Headline, sondern ein monospacer Betrag. Auf dem Dashboard steht der offene
Gesamtbetrag groß in Fira Mono, das Label klein darüber. Wer die App öffnet, liest
zuerst eine Zahl.

---

## 2. Design-Tokens

Als CSS-Custom-Properties auf `:root` definieren. Keine Farbe, kein Abstand und keine
Schriftgröße darf außerhalb dieser Liste im Code auftauchen.

### 2.1 Farbe

| Token | Wert | Verwendung |
|---|---|---|
| `--surface` | `#F5F6F3` | Grundfläche, kühles Recyclingpapier |
| `--surface-sunken` | `#EDEEEA` | Sidebar, Tabellenköpfe, Eingabefelder |
| `--sheet` | `#FFFFFF` | ausschließlich die Dokumentvorschau |
| `--ink` | `#1C1F1C` | Fließtext, Zahlen |
| `--ink-muted` | `#5C625C` | Sekundärtext, Labels |
| `--ink-faint` | `#8B918B` | Platzhalter, deaktiviert |
| `--rule` | `#DCDED8` | alle Trennlinien, 1 px |
| `--accent` | `#2A3EA0` | Aktion, Fokus, Links |
| `--accent-hover` | `#1F2E7A` | |
| `--accent-wash` | `#E8EAF6` | aktiver Navigationseintrag, Auswahl |
| `--ocker` | `#A8741A` | überfällig |
| `--ocker-wash` | `#F7EFDD` | |
| `--moss` | `#3F6B4A` | bezahlt |
| `--moss-wash` | `#E6EFE7` | |
| `--danger` | `#9B2C2C` | ausschließlich in Bestätigungsdialogen destruktiver Aktionen |

**Herkunft des Akzents:** `--accent` ist Kugelschreiberblau — die Farbe, in der ein
Formular unterschrieben wird. Es liest sich als amtlich, nicht als Software-Marke.

**Überfällig ist kein Rot.** Offene Forderungen sind Normalbetrieb, kein Notfall. Ein
Dashboard, das zur Hälfte rot leuchtet, erzeugt binnen zwei Wochen Blindheit gegen
genau die Information, die es hervorheben soll. Rot ist reserviert für Handlungen, die
Daten zerstören.

### 2.2 Typografie

Beide Schnitte lokal einbinden (`woff2`, `font-display: swap`), **keine externen
Font-CDNs** — siehe NFA-COMP-06.

- **Fira Sans** — Oberfläche, Fließtext. Schnitte 400, 500, 600, 700.
- **Fira Mono** — alle Zahlen, Beträge, Rechnungs- und Kundennummern, IBAN, Datum,
  Zählerstände. Schnitte 400, 500.

Die Wahl ist im Gegenstand begründet, nicht im Geschmack: Fira stammt von Erik
Spiekermann, dessen Arbeiten die visuelle Sprache deutscher Verkehrs- und
Verwaltungsinformation prägen. Genau dieses Register soll ein Rechnungsprogramm
treffen.

| Rolle | Größe / Zeilenhöhe | Schnitt |
|---|---|---|
| `--type-metric` | 40 / 1.0 | Fira Mono 500, Tabellenziffern |
| `--type-title` | 24 / 1.25 | Fira Sans 600 |
| `--type-section` | 16 / 1.3 | Fira Sans 600 |
| `--type-body` | 15 / 1.55 | Fira Sans 400 |
| `--type-ui` | 14 / 1.4 | Fira Sans 400/500 |
| `--type-data` | 14 / 1.4 | Fira Mono 400, Tabellenziffern |
| `--type-small` | 13 / 1.45 | Fira Sans 400 |
| `--type-label` | 11 / 1.2 | Fira Sans 600, Versalien, `letter-spacing: .07em` |

Global gesetzt: `font-variant-numeric: tabular-nums lining-nums` auf allen
Zahlenkontexten. Beträge werden **rechtsbündig** gesetzt, sodass Dezimaltrennzeichen in
Tabellen exakt untereinander stehen. Das ist der eigentliche Grund für Monospace — nicht
Ästhetik, sondern Vergleichbarkeit auf einen Blick.

### 2.3 Raster, Radius, Erhebung

- Basiseinheit 4 px. Erlaubte Abstände: 4, 8, 12, 16, 24, 32, 48, 64.
- `--radius: 3px` für alle Bedienelemente. `--radius-sheet: 0`.
- Genau **zwei** Erhebungsstufen:
  - Alles: keine. Trennung über `1px solid var(--rule)`.
  - Das Blatt: `0 1px 2px rgba(28,31,28,.06), 0 12px 32px -8px rgba(28,31,28,.18)`.
- Dialoge sind die einzige Ausnahme; sie erhalten dieselbe Erhebung wie das Blatt,
  behalten aber `--radius`.

### 2.4 Bewegung

- Zustandswechsel (Hover, Fokus, Auswahl): 120 ms `ease-out`.
- Dialog: 160 ms.
- **Der eine inszenierte Moment:** das Festschreiben. Die vergebene Rechnungsnummer
  erscheint im Blattkopf mit einem kurzen Stempel-Eindruck (Skalierung 1.06 → 1, leichte
  Rotation −1.5° → 0, Deckkraft 0 → 1, 320 ms), gleichzeitig kippt das Statusfeld von
  Entwurf auf Offen.
- Sonst nichts. Keine Seiten-Übergänge, keine Scroll-Effekte, keine Skeleton-Shimmer.
- `prefers-reduced-motion: reduce` schaltet **alle** Bewegung auf 0 ms, einschließlich
  des Stempels — die Nummer erscheint dann schlicht.

---

## 3. Layout

```
┌──────────────┬────────────────────────────────────────────────────┐
│ [ORG-ZONE]   │  Seitenkopf: Titel            [Sekundär] [Primär]  │
│ Faktura      ├────────────────────────────────────────────────────┤
│ Musterfirma  │                                                    │
│              │                                                    │
│ Übersicht    │   Inhalt, max. 1200 px, Innenabstand 32            │
│ Rechnungen   │                                                    │
│ Kunden       │                                                    │
│ Leistungen   │                                                    │
│              │                                                    │
│ Einstellungen│                                                    │
│              │                                                    │
│ ──────────── │                                                    │
│ [NUTZER-ZONE]│                                                    │
└──────────────┴────────────────────────────────────────────────────┘
   240 px fix
```

- Sidebar 240 px, `--surface-sunken`, **Textnavigation ohne Icons**. Icons in einer
  fünfzeiligen Navigation sind Dekoration; der aktive Eintrag wird durch `--accent-wash`
  und einen 2 px breiten Balken links markiert.
- `[ORG-ZONE]` und `[NUTZER-ZONE]` sind für V1 statische Blöcke fester Höhe (Firmenname
  bzw. eigener Name). Siehe §7.
- Der Seitenkopf ist klebrig, trägt Titel links und maximal zwei Aktionen rechts.
- Ab 1024 px klappt die Sidebar zu einem Auszug; unter 768 px ist die App lesend
  nutzbar, das Erstellen von Rechnungen ist für Desktop ausgelegt.

---

## 4. Screens

### 4.1 Übersicht

```
Übersicht

  OFFEN GESAMT        DAVON ÜBERFÄLLIG     UMSATZ AUGUST      UMSATZ 2026
  12.480,00 €         3.210,00 €           8.900,00 €         74.300,00 €
                      3 Rechnungen         netto              netto
  ─────────────────────────────────────────────────────────────────────

  Umsatz je Monat                                    letzte 12 Monate
  ▁▃▂▅▄▆▃▇▅▆▄█
  Sep  Okt  Nov  Dez  Jan  Feb  Mär  Apr  Mai  Jun  Jul  Aug

  ─────────────────────────────────────────────────────────────────────
  Überfällig                          Fällig in den nächsten 14 Tagen
  RE-2026-0031  Meier GmbH             RE-2026-0044  Schulz KG
  1.190,00 €    seit 24 Tagen          2.380,00 €    in 6 Tagen
  ...                                  ...
```

Die vier Kennzahlen stehen in `--type-metric`, die Labels darüber in `--type-label`.
Kein Rahmen, keine Karte, keine Farbfläche — nur Weißraum und eine Haarlinie darunter.
Das Balkendiagramm ist einfarbig in `--ink`, ohne Achsengitter, ohne Legende; der
laufende Monat in `--accent`.

### 4.2 Rechnungsliste

```
Rechnungen                                        [Neue Rechnung]

[Alle] [Entwurf] [Offen] [Überfällig] [Bezahlt] [Storniert]   [Suche…]

NUMMER         KUNDE            DATUM       FÄLLIG      BETRAG   STATUS
RE-2026-0044   Schulz KG        01.08.2026  15.08.2026  2.380,00 ● Offen
RE-2026-0031   Meier GmbH       04.07.2026  18.07.2026  1.190,00 ● Offen · 24 T
—              Weber & Co       —           —             840,00 ○ Entwurf
RE-2026-0029   Bauer AG         28.06.2026  12.07.2026  3.570,00 ● Bezahlt
```

Tabelle ohne Zebrastreifen, Zeilen getrennt durch `--rule`. Beträge rechtsbündig und
monospaced. Entwürfe zeigen in der Nummernspalte ein Gedankenstrich-Zeichen, keinen
Platzhaltertext. Überfälligkeit erscheint als Zusatz am Status, nicht als eigener
Filter-Status — sie ist ein abgeleiteter Zustand (FA-STAT-02).

### 4.3 Rechnungseditor

```
RE-Entwurf                    [Vorschau als PDF]  [Festschreiben]
┌──────────────────────────────┬──────────────────────────────────┐
│ Kunde                        │  ┌────────────────────────────┐  │
│ [Schulz KG           ▾]      │  │                            │  │
│                              │  │   Musterfirma              │  │
│ Rechnungsdatum  Leistung     │  │                            │  │
│ [01.08.2026]    [Juli 2026]  │  │   Schulz KG                │  │
│ Fällig                       │  │   Musterweg 1              │  │
│ [15.08.2026]  14 Tage        │  │                            │  │
│                              │  │   Rechnung                 │  │
│ POSITIONEN                   │  │   ─────────────────────    │  │
│ ⠿ Beratung    8 Std  120,00  │  │   1 Beratung  8   960,00   │  │
│ ⠿ Workshop    1 Psch 800,00  │  │   2 Workshop  1   800,00   │  │
│ [+ Position] [aus Katalog]   │  │                            │  │
│                              │  │   Netto        1.760,00    │  │
│ Netto           1.760,00 €   │  │   19 % USt       334,40    │  │
│ 19 % USt          334,40 €   │  │   Gesamt       2.094,40    │  │
│ Gesamt          2.094,40 €   │  └────────────────────────────┘  │
└──────────────────────────────┴──────────────────────────────────┘
        Formular, min 480 px            Blatt, klebrig, eckig, Schatten
```

Das Blatt skaliert proportional und bleibt beim Scrollen stehen. Bei mehrseitigen
Rechnungen erscheinen die Seiten untereinander mit 16 px Abstand — als Stapel, nicht als
Reiter.

Der Summenblock im Formular spiegelt exakt die Beschriftungen auf dem Blatt. Zwei
Vokabulare für dieselbe Zahl wären eine unnötige Übersetzungsleistung.

### 4.4 Zustände

**Leer:** Eine Zeile in `--type-body`, darunter die Aktion. „Noch keine Rechnungen.
Die erste Rechnung entsteht in etwa zwei Minuten." + `[Neue Rechnung]`. Keine
Illustration, kein Icon.

**Fehler:** benennt Ursache und Ausweg, im Ton der Anwendung, ohne Entschuldigung.
Nicht „Ups, da ist etwas schiefgelaufen", sondern „Die Vorlage konnte nicht gerendert
werden: unbekannte Variable `kunde.name` in Zeile 24. Erwartet wird `buyer.companyName`."

**Laden:** Ein 2 px hoher Fortschrittsbalken in `--accent` am oberen Rand des
Inhaltsbereichs. Keine Skelett-Platzhalter, keine Spinner in Buttons — stattdessen wird
der Button deaktiviert und behält seine Beschriftung.

---

## 5. Komponenten

| Komponente | Festlegung |
|---|---|
| Button primär | `--accent`, weiße Schrift, 36 px Höhe, `--radius` |
| Button sekundär | transparent, 1 px `--rule`, `--ink` |
| Button still | nur Text in `--accent`, für tertiäre Aktionen |
| Button destruktiv | `--danger`, ausschließlich in Bestätigungsdialogen |
| Eingabefeld | `--surface-sunken`, 1 px `--rule`, 36 px, Fokusring 2 px `--accent` mit 2 px Abstand |
| Betragsfeld | rechtsbündig, Fira Mono, Währung als festes Suffix außerhalb des Feldes |
| Combobox | Tastaturbedienbar, Filterung ab dem ersten Zeichen |
| Datumsfeld | Direkteingabe `TT.MM.JJJJ` **und** Kalenderauswahl; Eingabe hat Vorrang |
| Statusfeld | Punkt + Text, nie Farbe allein (§6) |
| Tabelle | Kopf `--surface-sunken`, `--type-label`, Zeilen durch `--rule` getrennt |
| Positionszeile | Griff zum Sortieren links, Löschen rechts, beides erst bei Hover oder Fokus sichtbar |
| Dialog | max. 480 px, Titel, ein Absatz Erklärung, zwei Aktionen |
| Toast | unten links, 4 s, Wortlaut spiegelt den auslösenden Button |

Basis ist shadcn/ui, aber die Voreinstellungen für Radius, Schatten und Farbe werden
vollständig durch die Tokens ersetzt. Ungeänderte shadcn-Komponenten sind ein Fehler,
kein Zeitgewinn.

---

## 6. Statusdarstellung

| Status | Punkt | Fläche | Beschriftung |
|---|---|---|---|
| Entwurf | `--ink-faint`, offen | keine | Entwurf |
| Offen | `--accent`, gefüllt | keine | Offen |
| Offen, überfällig | `--ocker`, gefüllt | `--ocker-wash` | Offen · 24 Tage überfällig |
| Teilbezahlt | `--accent`, halb | keine | Teilbezahlt · 800 von 2.094 € |
| Bezahlt | `--moss`, gefüllt | `--moss-wash` | Bezahlt |
| Storniert | `--ink-faint`, gefüllt | `--surface-sunken` | Storniert |

Status wird **nie allein durch Farbe** übermittelt. Jedes Feld trägt Text, und die
Punktform unterscheidet sich zusätzlich (offen, halb, gefüllt). Das ist zugleich
Barrierefreiheit und Druckbarkeit.

---

## 7. Reservierte Zonen für den Mehrbenutzerbetrieb

Der spätere Ausbau zu Teams innerhalb mehrerer Organisationen ist Zielbild, wird in V1
aber **nicht** gebaut. Damit er später nicht das Layout aufbricht, gilt:

| Zone | V1 | Später |
|---|---|---|
| `[ORG-ZONE]` Sidebar-Kopf | Firmenname, statisch, 56 px hoch | Organisationswechsler gleicher Höhe |
| `[NUTZER-ZONE]` Sidebar-Fuß | eigener Name + Initialenkreis, statisch | Menü mit Profil, Abmelden, Mitglieder |
| Listenspalte „Erstellt von" | im Tabellenschema definiert, ausgeblendet | eingeblendet ab zwei Mitgliedern |
| Einstellungs-Navigation | Gruppe „Organisation" mit Firmendaten darin | Punkt „Mitglieder" reiht sich ein |

**Wichtiger als jede dieser Zonen:** Sichtbarkeit und Aktivierung aller Aktionen laufen
in V1 bereits über eine einzige Funktion `can(action, subject)`, die durchgängig `true`
liefert. Ein späteres Rollenmodell füllt diese Funktion — statt jeden Button einzeln
nachzurüsten und dabei einen zu vergessen.

---

## 8. Ton und Wortwahl

- **Deutsch, Sie-Form vermieden.** Die Oberfläche spricht den Nutzer nicht an, sondern
  benennt Dinge und Handlungen: „Rechnung erstellen", nicht „Erstellen Sie Ihre
  Rechnung".
- **Buttons sagen, was passiert.** „Festschreiben", nicht „Absenden". „Kunde
  speichern", nicht „OK".
- **Eine Handlung behält ihren Namen.** Der Button heißt „Festschreiben", der Dialog
  fragt „Rechnung festschreiben?", der Toast meldet „Rechnung festgeschrieben".
- **Fachsprache ja, Systemsprache nein.** „Nummernkreis" und „Leistungszeitraum" sind
  die Begriffe des Gegenstands und werden verwendet. „Entity", „Record" oder „Sync"
  erscheinen nirgends.
- **Bestätigungsdialoge erklären die Folge, nicht die Aktion.** Beim Festschreiben:
  „Die Rechnung erhält die Nummer RE-2026-0045 und ist danach nicht mehr änderbar.
  Korrekturen laufen über eine Stornorechnung."
- Alle Texte liegen in einer zentralen Datei (NFA-QUAL-07).

---

## 9. Zusätzliche Anforderungen

Zur Aufnahme in `rechnungs-app-anforderungen.md`.

| ID | Anforderung | Prio | Verif. |
|---|---|---|---|
| FA-UI-01 | Sämtliche Farben, Abstände, Radien und Schriftgrößen stammen aus den Tokens in §2; im Komponentencode stehen keine Literalwerte. | MUSS | R |
| FA-UI-02 | Die Dokumentvorschau ist die einzige Fläche mit Schatten und die einzige mit Radius 0. | MUSS | R |
| FA-UI-03 | Alle Beträge, Nummern und Datumsangaben werden monospaced mit Tabellenziffern und rechtsbündig gesetzt. | MUSS | M |
| FA-UI-04 | Schriften werden lokal ausgeliefert; es existiert keine Anfrage an ein externes Font-CDN. | MUSS | T |
| FA-UI-05 | Status wird nie allein durch Farbe kodiert; jedes Statusfeld trägt Text und eine unterscheidbare Punktform. | MUSS | M |
| FA-UI-06 | Überfälligkeit erscheint als Zusatz am Status Offen, nicht als eigener Status. | MUSS | M |
| FA-UI-07 | Beim Festschreiben wird die Nummer im Blattkopf animiert eingesetzt; bei `prefers-reduced-motion` erscheint sie ohne Bewegung. | SOLL | T |
| FA-UI-08 | Außer Zustandswechseln und dem Festschreiben existiert keine Animation. | MUSS | R |
| FA-UI-09 | Leerzustände nennen eine konkrete nächste Handlung und enthalten keine Illustration. | SOLL | M |
| FA-UI-10 | Fehlermeldungen benennen Ursache und Ausweg und enthalten keine Entschuldigungsformel. | MUSS | R |
| FA-UI-11 | Button-, Dialog- und Toast-Wortlaut derselben Handlung verwenden denselben Verbstamm. | MUSS | R |
| FA-UI-12 | Die Sidebar-Navigation ist textbasiert; der aktive Eintrag ist durch Fläche und Balken markiert. | MUSS | M |
| FA-UI-13 | Datumsfelder akzeptieren Direkteingabe im Format `TT.MM.JJJJ` zusätzlich zur Kalenderauswahl. | MUSS | T |
| FA-UI-14 | Sichtbarkeit und Aktivierung aller Aktionen laufen über eine zentrale `can()`-Funktion. | MUSS | R |
| FA-UI-15 | Die Sidebar-Zonen für Organisation und Nutzer haben feste Höhe, sodass spätere Menüs das Layout nicht verschieben. | SOLL | R |
| FA-UI-16 | Die Spalte „Erstellt von" ist im Tabellenschema angelegt und in V1 ausgeblendet. | SOLL | R |
| NFA-UI-01 | Kontrastverhältnis mindestens 4.5:1 für Text und 3:1 für Bedienelemente, geprüft über alle Tokenkombinationen. | MUSS | T |
| NFA-UI-02 | Jedes fokussierbare Element zeigt einen sichtbaren Fokusring; `outline: none` ohne Ersatz kommt nicht vor. | MUSS | T |
| NFA-UI-03 | Der gesamte Rechnungseditor inklusive Positionssortierung ist per Tastatur bedienbar. | MUSS | M |
| NFA-UI-04 | Es existieren keine externen Netzwerkanfragen aus dem Frontend heraus. | MUSS | T |
| NFA-UI-05 | Ein dunkles Farbschema ist verfügbar; die Dokumentvorschau bleibt darin weiß. | KANN | M |

---

## 10. Vor dem Bauen

Die Umsetzung beginnt nicht mit Komponenten, sondern mit dem Tokensatz: `globals.css`
mit allen Custom Properties, Tailwind-Theme darauf abgebildet, Schriften eingebunden.
Erst danach entsteht die erste Komponente. Ein Tokensatz, der nachträglich unter
fertige Komponenten geschoben wird, hinterlässt immer Reste.

Als Prüfstein taugt eine einzelne Seite: die **Rechnungsliste mit Testdaten**, gebaut
vor allem anderen. Sie enthält Tabelle, Statusfelder, Filter, Zahlensatz, Leerzustand
und Seitenkopf — also fast das gesamte Vokabular. Wenn sie stimmt, stimmt der Rest.
