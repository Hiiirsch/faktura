# Spezifikation: Rechnungs-Webapp (Self-Hosted, Single-Tenant)

Diese Spec ist als Arbeitsgrundlage für Claude Code gedacht. Sie beschreibt Zielbild,
Datenmodell, Architektur und Umsetzungsreihenfolge. Abschnitte mit **[V2]** sind
bewusst *nicht* Teil der ersten Version, bestimmen aber das Design.

---

## 1. Zielsetzung & Scope

Eine selbst gehostete Webanwendung für die eigene Rechnungsstellung eines Einzel-
unternehmens/Freiberuflers.

**In Scope (V1)**
- Stammdaten des eigenen Unternehmens über ein Einstellungsmenü
- Kundenverwaltung
- Rechnungserstellung mit Positionen, Live-Vorschau, PDF-Export
- Frei gestaltbare Rechnungsvorlagen als HTML/CSS-Template (Upload)
- Statusverwaltung (Entwurf, Offen, Teilbezahlt, Bezahlt, Storniert)
- Dashboard mit Kennzahlen und Fälligkeitsübersicht
- Authentifizierung, Härtung, Backup

**Explizit nicht in Scope (V1), aber vorbereitet**
- E-Rechnung (ZUGFeRD / XRechnung) → siehe §9
- Mahnwesen, Angebote/Aufträge, wiederkehrende Rechnungen → siehe §13
- Mandantenfähigkeit / Mehrbenutzer → siehe §13
- Buchhaltungs-Export (DATEV), Banking-Anbindung

**Nicht-Ziele**
- Keine Cloud-/SaaS-Fähigkeit, kein Multi-Tenant-Datenmodell
- Keine mobile App, aber responsive Web-UI

---

## 2. Tech-Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server Actions, ein Deployment-Artefakt |
| DB | SQLite via Prisma | Single-User, Backup = Dateikopie; Migration zu Postgres bleibt offen |
| UI | Tailwind CSS + shadcn/ui | Schnell, konsistent |
| Formulare | React Hook Form + Zod | Ein Zod-Schema für Client- *und* Server-Validierung |
| Templating | LiquidJS | Logikarm und gesandboxed — kein beliebiger Code aus Templates |
| PDF | Playwright (headless Chromium) | Vollwertiges CSS, `@page`, Seitenumbrüche, Kopf-/Fußzeilen |
| Auth | Eigene Session-Auth (Cookie) + Argon2id + TOTP | Kein externer IdP nötig, volle Kontrolle |
| Tests | Vitest + Playwright E2E | Fokus auf Berechnungs- und Nummernkreis-Logik |

**Wichtig:** Alle Geldbeträge intern als **Integer in Cent** speichern und rechnen.
Niemals `float`. Mengen als Decimal mit definierter Nachkommastellenzahl (Vorschlag: 4).

---

## 3. Architektur

Vier Schichten, strikt getrennt — das ist die Grundlage für die Erweiterbarkeit:

```
UI (React)
  └─ Application Layer (Server Actions / Use Cases)
       └─ Domain Layer (reine TS-Funktionen: Berechnung, Statuslogik, Nummernkreis)
            └─ Infrastructure (Prisma, Dateisystem, Renderer, Auth)
```

### 3.1 Zentrale Abstraktion: das Render-Modell

Der wichtigste Baustein für spätere Erweiterungen. Zwischen Datenbank und Ausgabe
steht ein **kanonisches, ausgabeneutrales Dokumentmodell** (`InvoiceDocument`).

```
DB-Entities ──► buildInvoiceDocument() ──► InvoiceDocument ──┬──► HTML-Renderer ──► PDF
                                                             └──► [V2] ZUGFeRD-XML-Mapper
```

`InvoiceDocument` enthält **alle** Felder, die EN 16931 (die Norm hinter ZUGFeRD und
XRechnung) verlangt — auch solche, die das HTML-Template heute ignoriert. Nur so lässt
sich die E-Rechnung später ohne Datenmigration nachrüsten. Details in §9.

### 3.2 Ausgabe-Pipeline mit Post-Processor-Hooks

```
InvoiceDocument
   → TemplateEngine.render()      → HTML
   → PdfRenderer.render()         → PDF-Buffer
   → PdfPostProcessor[]           → PDF-Buffer     ← Erweiterungspunkt
   → ArtifactStore.save()         → Datei + Hash
```

`PdfPostProcessor` ist in V1 eine leere Kette. ZUGFeRD wird später schlicht als zwei
Prozessoren eingehängt: PDF/A-3-Konvertierung und XML-Einbettung. Ohne diesen Hook
müsste die Pipeline später aufgebrochen werden.

Beide Interfaces (`TemplateEngine`, `PdfRenderer`) werden über einen kleinen
Registry-/DI-Container aufgelöst, nicht direkt importiert.

### 3.3 Domain-Events

Jede Zustandsänderung einer Rechnung erzeugt ein Event (`InvoiceIssued`,
`InvoicePaid`, `InvoiceCancelled`). In V1 schreiben die Handler nur ins Audit-Log.
Später hängen dort E-Mail-Versand, Mahnläufe und Buchhaltungs-Export an.

---

## 4. Datenmodell

Prisma-Schema als Entwurf. Namen bewusst englisch, UI-Labels deutsch.

```prisma
// ─── Stammdaten ────────────────────────────────────────────────

model CompanyProfile {
  id                  Int      @id @default(1)   // Singleton
  legalName           String
  addressLine1        String
  addressLine2        String?
  postalCode          String
  city                String
  countryCode         String   @default("DE")    // ISO 3166-1 alpha-2
  email               String?
  phone               String?
  website             String?

  taxNumber           String?                    // Steuernummer
  vatId               String?                    // USt-IdNr, BT-31
  isSmallBusiness     Boolean  @default(false)   // §19 UStG
  registerCourt       String?                    // Amtsgericht
  registerNumber      String?                    // HRB
  managingDirector    String?

  bankAccountHolder   String?
  iban                String?
  bic                 String?
  bankName            String?

  logoAssetId         String?
  defaultPaymentTerms Int      @default(14)      // Tage
  defaultTaxRate      Int      @default(19)      // Prozent
  defaultCurrency     String   @default("EUR")   // ISO 4217
  footerText          String?
  defaultTemplateId   String?
  invoiceNumberFormat String   @default("RE-{YYYY}-{SEQ:4}")
  updatedAt           DateTime @updatedAt
}

model Customer {
  id             String    @id @default(cuid())
  customerNumber String    @unique
  companyName    String?
  contactName    String?
  addressLine1   String
  addressLine2   String?
  postalCode     String
  city           String
  countryCode    String    @default("DE")
  email          String?
  phone          String?
  vatId          String?                          // relevant für Reverse Charge
  buyerReference String?                          // BT-10, Leitweg-ID (B2G)
  paymentTerms   Int?                             // überschreibt Default
  notes          String?
  isArchived     Boolean   @default(false)        // statt Löschen
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  invoices       Invoice[]
}

// ─── Rechnungen ────────────────────────────────────────────────

model Invoice {
  id             String        @id @default(cuid())
  documentType   DocumentType  @default(INVOICE)
  invoiceNumber  String?       @unique            // erst beim Festschreiben!
  status         InvoiceStatus @default(DRAFT)

  customerId     String
  customer       Customer      @relation(fields: [customerId], references: [id])

  // Snapshot: eingefroren beim Festschreiben, danach unveränderlich
  snapshotBuyer   Json?
  snapshotSeller  Json?

  issueDate      DateTime?
  serviceDateFrom DateTime?                       // BT-72 Leistungsdatum
  serviceDateTo   DateTime?
  dueDate        DateTime?

  currency       String        @default("EUR")
  introText      String?
  outroText      String?
  purchaseOrderRef String?                        // BT-13 Bestellnummer

  // Stornobezug: BT-25/BT-26
  precedingInvoiceId String?
  precedingInvoice   Invoice?  @relation("Cancellation", fields: [precedingInvoiceId], references: [id])
  cancelledBy        Invoice[] @relation("Cancellation")

  templateId     String?
  lines          InvoiceLine[]
  payments       Payment[]
  artifacts      InvoiceArtifact[]

  // denormalisierte Summen in Cent, beim Speichern neu berechnet
  netTotalCents   Int          @default(0)
  taxTotalCents   Int          @default(0)
  grossTotalCents Int          @default(0)
  paidTotalCents  Int          @default(0)

  issuedAt       DateTime?
  cancelledAt    DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([status, dueDate])
  @@index([customerId])
}

model InvoiceLine {
  id            String   @id @default(cuid())
  invoiceId     String
  invoice       Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  position      Int
  name          String
  description   String?
  quantity      Decimal  @db.Decimal(18, 4)
  unitCode      String   @default("C62")     // UN/ECE Rec 20 — siehe §9.2
  unitPriceCents Int
  taxRate       Int                          // Prozent, ganzzahlig
  taxCategory   String   @default("S")       // UNTDID 5305 — siehe §9.2
  discountPercent Decimal? @db.Decimal(5, 2)
  lineNetCents  Int                          // berechnet, persistiert

  @@unique([invoiceId, position])
}

model Payment {
  id          String   @id @default(cuid())
  invoiceId   String
  invoice     Invoice  @relation(fields: [invoiceId], references: [id])
  amountCents Int
  paidAt      DateTime
  method      String?
  note        String?
  createdAt   DateTime @default(now())
}

// Erzeugte PDFs — unveränderlich, mit Hash zur Integritätsprüfung
model InvoiceArtifact {
  id          String   @id @default(cuid())
  invoiceId   String
  invoice     Invoice  @relation(fields: [invoiceId], references: [id])
  kind        String   // "pdf" | [V2] "zugferd-pdf" | "xrechnung-xml"
  filePath    String
  sha256      String
  byteSize    Int
  createdAt   DateTime @default(now())
}

// ─── Vorlagen & Assets ─────────────────────────────────────────

model Template {
  id          String   @id @default(cuid())
  name        String
  description String?
  htmlSource  String   // Liquid-Template
  cssSource   String
  pageFormat  String   @default("A4")
  marginsJson Json     // { top, right, bottom, left } in mm
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Asset {
  id          String   @id @default(cuid())
  fileName    String
  mimeType    String
  byteSize    Int
  sha256      String
  storagePath String
  createdAt   DateTime @default(now())
}

// ─── Katalog & Betrieb ─────────────────────────────────────────

model CatalogItem {
  id             String  @id @default(cuid())
  name           String
  description    String?
  unitPriceCents Int
  unitCode       String  @default("C62")
  taxRate        Int     @default(19)
  isArchived     Boolean @default(false)
}

model NumberSequence {
  id        String @id @default(cuid())
  scope     String @unique   // z.B. "INVOICE-2026"
  lastValue Int    @default(0)
}

model AuditLog {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  action     String
  actorId    String?
  diffJson   Json?
  ipAddress  String?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  totpSecret   String?
  totpEnabled  Boolean   @default(false)
  failedLogins Int       @default(0)
  lockedUntil  DateTime?
  createdAt    DateTime  @default(now())
  sessions     Session[]
}

model Session {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String   @unique
  userAgent  String?
  ipAddress  String?
  expiresAt  DateTime
  createdAt  DateTime @default(now())
}

enum DocumentType { INVOICE CREDIT_NOTE }
enum InvoiceStatus { DRAFT ISSUED PARTIALLY_PAID PAID CANCELLED }
```

### 4.1 Bewusste Design-Entscheidungen

- **Snapshot statt Referenz:** Beim Festschreiben werden Käufer- und Verkäuferdaten als
  JSON in die Rechnung kopiert. Zieht ein Kunde um, ändert sich keine Altrechnung.
- **Kein `OVERDUE`-Status:** Überfälligkeit ist abgeleitet
  (`status ∈ {ISSUED, PARTIALLY_PAID} && dueDate < heute`). Kein Cronjob nötig.
- **Kein Hard-Delete:** Kunden werden archiviert, festgeschriebene Rechnungen nur
  storniert. Entwürfe dürfen gelöscht werden.
- **Denormalisierte Summen:** damit Dashboard-Abfragen keine Aggregation über alle
  Positionen brauchen. Neuberechnung zentral in einer einzigen Domain-Funktion.

---

## 5. Berechnungslogik

Eine reine, testbare Funktion `calculateInvoiceTotals(lines) → Totals`.

1. Pro Position: `lineNet = round(quantity × unitPrice × (1 − discount))`,
   kaufmännisch auf Cent gerundet.
2. Positionen nach **(Steuersatz, Steuerkategorie)** gruppieren → das ist die
   Steueraufstellung (in EN 16931: BG-23). Diese Gruppierung ist auf dem PDF
   auszuweisen.
3. Pro Gruppe: `taxAmount = round(groupNet × rate / 100)`.
   **Steuer je Gruppe runden, nicht je Position** — sonst entstehen Centdifferenzen.
4. `grossTotal = netTotal + taxTotal`.

**Sonderfälle**
- Kleinunternehmer (§19 UStG): alle Positionen `taxCategory = "E"`, `taxRate = 0`,
  Pflichthinweis im Dokument.
- Reverse Charge (EU-B2B mit gültiger USt-IdNr): `taxCategory = "AE"`, `taxRate = 0`,
  Hinweistext plus beide USt-IdNr auf dem Beleg.
- Drittland: `taxCategory = "G"`.

Die Kategorie wird beim Anlegen einer Rechnung aus Kundenland + USt-IdNr +
Kleinunternehmer-Flag **vorgeschlagen** und ist manuell überschreibbar.

---

## 6. Nummernkreis & Unveränderbarkeit (GoBD)

- Format konfigurierbar, Platzhalter: `{YYYY}`, `{YY}`, `{MM}`, `{SEQ:n}`.
- Vergabe **ausschließlich** beim Festschreiben, in einer DB-Transaktion mit
  Inkrement der `NumberSequence`. Entwürfe haben keine Nummer.
- Lückenlosigkeit: Eine vergebene Nummer wird nie freigegeben. Eine fehlerhafte
  Rechnung wird storniert, nicht gelöscht.
- Ab `ISSUED` sind Rechnung und Positionen schreibgeschützt. Durchsetzung auf
  **zwei** Ebenen: Guard im Use Case *und* Prüfung in der Repository-Schicht.
- Storno erzeugt ein neues Dokument (`documentType = CREDIT_NOTE`) mit eigener
  Nummer und `precedingInvoiceId` auf das Original. Das Original wechselt auf
  `CANCELLED`.
- Jede Statusänderung landet im `AuditLog`.
- Erzeugte PDFs werden mit SHA-256 gespeichert und nie überschrieben.

---

## 7. Statusmodell

```
DRAFT ──festschreiben──► ISSUED ──Teilzahlung──► PARTIALLY_PAID ──Restzahlung──► PAID
  │                        │                          │
  │ löschen                └──────storno──────────────┴──► CANCELLED
  ▼
 (weg)
```

- `PAID` wird automatisch gesetzt, sobald `paidTotalCents >= grossTotalCents`.
- Zahlungen sind einzelne `Payment`-Datensätze, keine Boolean-Flagge. Das macht
  Teilzahlungen und spätere Kontoabgleiche möglich.
- Storno ist auch nach `PAID` erlaubt (dann mit Rückzahlungsvermerk).

---

## 8. Vorlagen-System

### 8.1 Format

Eine Vorlage besteht aus einem Liquid-HTML-Dokument und einer CSS-Datei. Upload als
`.html` + `.css` oder als ZIP mit `template.html`, `style.css` und optionalem
`assets/`-Ordner.

Verfügbare Variablen (Auszug, vollständige Referenz im UI dokumentieren):

```liquid
{{ seller.legalName }}, {{ seller.vatId }}, {{ seller.iban }}
{{ buyer.companyName }}, {{ buyer.addressLine1 }}, {{ buyer.countryCode }}
{{ invoice.number }}, {{ invoice.issueDate | date: "%d.%m.%Y" }}
{{ invoice.dueDate }}, {{ invoice.serviceDateFrom }}

{% for line in lines %}
  {{ line.position }} {{ line.name }} {{ line.quantity }} {{ line.unitLabel }}
  {{ line.unitPrice | money }} {{ line.lineNet | money }}
{% endfor %}

{% for group in taxBreakdown %}
  {{ group.rate }}% auf {{ group.net | money }} = {{ group.tax | money }}
{% endfor %}

{{ totals.net | money }} {{ totals.tax | money }} {{ totals.gross | money }}
{{ notices }}   <!-- §19-/Reverse-Charge-Hinweise, automatisch befüllt -->
```

Eigene Filter: `money` (Cent → lokalisierter Betrag mit Währung), `date`, `decimal`.

### 8.2 Layout-Anforderungen

- A4, Standardränder 25/20/20/20 mm, konfigurierbar je Vorlage.
- Anschriftfeld nach DIN 5008 positionierbar (Fensterumschlag DIN lang), Falzmarken
  optional als CSS-Element.
- Positionstabelle muss über Seiten umbrechen: `<thead>` wiederholt sich automatisch,
  `page-break-inside: avoid` auf Zeilen.
- Fußzeile mit „Seite X von Y" über Playwright-`footerTemplate`, nicht über CSS.
- Bankverbindung/Pflichtangaben als wiederholte Fußzeile auf jeder Seite.

### 8.3 Mitgelieferte Standardvorlage

Eine schlichte, DIN-konforme Vorlage wird im Repo als Seed ausgeliefert und beim
ersten Start importiert. Sie dient gleichzeitig als Referenzimplementierung und als
Grundlage für den Vorlagen-Editor (Monaco im UI, mit Live-Vorschau).

### 8.4 Sicherheit von Vorlagen

Hochgeladene Templates sind ausführbarer Inhalt und werden entsprechend behandelt:

- Liquid statt Nunjucks/EJS: keine beliebige Codeausführung im Template.
- Der Rendering-Browser läuft **ohne Netzwerkzugriff** (Request-Interception blockt
  alles außer `data:` und lokalen Asset-Pfaden). Verhindert SSRF über
  `<img src="http://interner-dienst/...">` und Datenabfluss.
- JavaScript im Renderer deaktiviert.
- Assets nur aus dem Asset-Store, referenziert über IDs, nicht über freie Pfade.
- Upload-Validierung: Größenlimit, MIME-Prüfung, ZIP-Slip-Schutz beim Entpacken.
- Rendering-Timeout (z.B. 15 s) und Speicherlimit pro Job.

---

## 9. Vorbereitung auf E-Rechnung **[V2]**

Nichts davon wird in V1 implementiert — aber diese Punkte machen die Nachrüstung
später zu einer Erweiterung statt zu einem Umbau.

### 9.1 Was später dazukommt

ZUGFeRD ist ein PDF/A-3 mit eingebettetem EN-16931-XML. Chromium erzeugt kein PDF/A.
Die Nachrüstung besteht dann aus:
1. `ZugferdXmlMapper`: `InvoiceDocument` → CII-XML
2. `PdfAConverter` (Ghostscript) als Post-Processor
3. `XmlEmbedder` (z.B. pdf-lib) als zweiter Post-Processor
4. Neue `InvoiceArtifact.kind`-Werte

Weil §3.2 die Post-Processor-Kette bereits vorsieht, ändert sich an der bestehenden
Pipeline nichts.

### 9.2 Was V1 dafür schon richtig machen muss

Diese Felder kosten jetzt fast nichts und sind später kaum nachträglich zu befüllen:

| Feld | Norm | Hinweis |
|---|---|---|
| `unitCode` | UN/ECE Rec 20 | `C62` Stück, `HUR` Stunde, `DAY` Tag, `MON` Monat, `KGM` kg, `MTR` m, `MTK` m², `LTR` l, `E48` Leistungseinheit |
| `taxCategory` | UNTDID 5305 | `S` Regelsatz, `AE` Reverse Charge, `E` steuerbefreit (§19), `G` Ausfuhr Drittland, `K` innergem. Lieferung, `Z` Nullsatz |
| `countryCode` | ISO 3166-1 alpha-2 | nie Klartext-Ländernamen speichern |
| `currency` | ISO 4217 | |
| `buyerReference` | BT-10 | Leitweg-ID, Pflicht bei B2G |
| `serviceDateFrom/To` | BT-72 | Leistungsdatum, Pflichtangabe |
| `precedingInvoiceId` | BT-25/26 | Stornobezug |
| Steueraufstellung | BG-23 | Gruppierung nach Satz+Kategorie, siehe §5 |

Im UI werden Einheiten als deutsche Labels angezeigt („Stunde"), intern aber immer
als Code gespeichert. Eine Mapping-Tabelle `unitCode → Label` liegt im Domain Layer.

---

## 10. Oberfläche

### 10.1 Screens

| Route | Inhalt |
|---|---|
| `/login` | Passwort + TOTP |
| `/` | Dashboard |
| `/invoices` | Liste, Filter nach Status/Kunde/Zeitraum, Volltextsuche, Sortierung |
| `/invoices/new`, `/invoices/[id]` | Editor mit Live-Vorschau |
| `/customers`, `/customers/[id]` | Kundenliste und -detail mit Rechnungshistorie |
| `/catalog` | Leistungskatalog |
| `/settings/company` | Firmendaten, Logo, Bank, Steuer |
| `/settings/templates` | Vorlagen verwalten, Editor, Testvorschau |
| `/settings/numbering` | Nummernkreis-Format, aktueller Stand |
| `/settings/security` | Passwort, 2FA, aktive Sessions |
| `/settings/backup` | Backup erstellen/herunterladen, Restore-Hinweise |

### 10.2 Rechnungseditor

Zweispaltig: links Formular, rechts PDF-Vorschau (debounced, ~500 ms).

- Kunde per Combobox wählen → Adresse, Zahlungsziel, Steuerkategorie vorbefüllt
- Positionen als Tabelle: Zeilen hinzufügen, duplizieren, per Drag&Drop sortieren
- Katalog-Autocomplete im Feld „Bezeichnung"
- Summenblock live berechnet
- Aktionen: *Als Entwurf speichern* · *Festschreiben* · *PDF herunterladen* ·
  *Duplizieren* · *Als bezahlt markieren* · *Stornieren*
- Beim Festschreiben ein Bestätigungsdialog mit Hinweis auf die Unveränderbarkeit

### 10.3 Dashboard

Kachelzeile:
- Offener Betrag gesamt
- Davon überfällig (Betrag + Anzahl)
- Umsatz laufender Monat
- Umsatz laufendes Jahr

Darunter:
- Balkendiagramm Umsatz pro Monat (rollierende 12 Monate, nur festgeschriebene,
  nicht stornierte Rechnungen)
- Liste „Überfällig" (nach Tagen absteigend) und „Fällig in den nächsten 14 Tagen"
- Letzte 10 Rechnungen mit Statusbadge
- Top-Kunden nach Umsatz im laufenden Jahr

Alle Kennzahlen kommen aus einer einzigen `getDashboardMetrics()`-Funktion, damit sie
nicht an mehreren Stellen unterschiedlich definiert werden.

---

## 11. Sicherheit

Die App läuft auf einem eigenen Server und enthält personenbezogene Kundendaten.
Härtung ist Teil von V1, nicht optional.

### 11.1 Authentifizierung
- Keine öffentliche Registrierung. Erstbenutzer über CLI-Seed-Kommando.
- Passwort-Hashing mit **Argon2id** (Parameter: ≥64 MB Memory, 3 Iterationen).
- Mindestlänge 12 Zeichen, Abgleich gegen eine Liste kompromittierter Passwörter.
- **TOTP-2FA** verpflichtend aktivierbar, mit Recovery-Codes.
- Session-Token: 256 Bit Zufall, nur der Hash liegt in der DB.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, Ablauf 7 Tage, Rotation bei Login.
- Rate Limiting auf `/login`: exponentielles Backoff, Account-Sperre nach
  10 Fehlversuchen für 15 Minuten.
- Session-Übersicht mit „überall abmelden".

### 11.2 Anwendungsebene
- **Jede** Server Action prüft die Session als erste Anweisung. Ein zentrales
  `requireSession()`-Helper, kein Verlass auf Middleware allein.
- CSRF-Schutz über Origin-Prüfung plus Double-Submit-Token.
- Alle Eingaben serverseitig mit Zod validiert — Client-Validierung zählt nicht.
- Prisma verhindert SQL-Injection; kein `$queryRawUnsafe`.
- Security-Header: strikte CSP (kein `unsafe-inline` im App-Kontext),
  `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
  HSTS mit `preload`.
- Uploads: Größenlimit (Logo 2 MB, Template 5 MB), MIME- und Magic-Byte-Prüfung,
  Speicherung außerhalb des Webroots mit generierten Dateinamen, Auslieferung nur
  über authentifizierte Route mit `Content-Disposition: attachment`.
- PDF-Downloads laufen ebenfalls über eine authentifizierte Route, niemals über
  statisch erreichbare Pfade.
- Fehlermeldungen ohne Stacktraces nach außen.

### 11.3 Betriebsebene
- Reverse Proxy (Caddy empfohlen, TLS automatisch) vor der App; App bindet nur an
  `127.0.0.1`.
- Container läuft als Nicht-Root-User, Dateisystem soweit möglich read-only.
- Chromium für das PDF-Rendering mit `--no-sandbox` **vermeiden**; stattdessen im
  Container die nötigen Capabilities bereitstellen.
- Automatische Sicherheitsupdates des Basis-Images, `npm audit` im CI.
- Optional, empfohlen: die App zusätzlich hinter VPN/Tailscale oder eine
  IP-Allowlist legen. Ein Rechnungssystem muss nicht öffentlich erreichbar sein.

### 11.4 Datenschutz & Aufbewahrung
- Datenexport (alle Kunden- und Rechnungsdaten als JSON) über Einstellungen.
- Löschkonzept: Kunden werden archiviert, nicht gelöscht — Rechnungen unterliegen
  10 Jahren Aufbewahrungspflicht. Das ist im UI zu erklären.
- Audit-Log für alle Änderungen an Rechnungen und Stammdaten.

---

## 12. Betrieb

- **Deployment:** Docker Compose mit einem Service (App inkl. Chromium) plus Caddy.
  Volumes für `data/` (SQLite) und `storage/` (Assets, PDFs).
- **Konfiguration:** ausschließlich über Umgebungsvariablen, `.env.example` im Repo.
  Secrets nie im Image.
- **Migrationen:** `prisma migrate deploy` beim Container-Start.
- **Backup:** Nightly-Job, der die SQLite-DB über `VACUUM INTO` konsistent sichert
  (nicht einfach kopieren) und zusammen mit `storage/` in ein datiertes,
  optional verschlüsseltes Archiv packt. Aufbewahrung 30 Tage. Manueller Download
  über die Einstellungen. **Restore-Prozedur im README dokumentieren und einmal
  testen** — ein ungetestetes Backup ist keins.
- **Logging:** strukturiert (JSON) auf stdout, Auth-Ereignisse separat.
- **Healthcheck:** `/api/health` prüft DB-Verbindung und Renderer-Verfügbarkeit.

---

## 13. Konkrete Erweiterungspunkte **[V2+]**

| Erweiterung | Was dafür heute schon steht |
|---|---|
| ZUGFeRD/XRechnung | Post-Processor-Kette, normkonformes `InvoiceDocument`, Code-Felder |
| E-Mail-Versand | Domain-Events; nur ein neuer Handler + SMTP-Adapter nötig |
| Mahnwesen | Abgeleitete Überfälligkeit, `Payment`-Historie, Event `InvoiceOverdue` |
| Angebote/Aufträge | `documentType`-Enum erweitern, gleiche Pipeline und Templates |
| Wiederkehrende Rechnungen | „Duplizieren" existiert; ergänzt um `RecurringSchedule` + Job |
| Mehrbenutzer | `User`-Tabelle existiert; Rollen-Feld und Policy-Layer ergänzen |
| Mandantenfähigkeit | `CompanyProfile` ist Singleton — Umstellung erfordert `tenantId`-Spalten. Bewusster Trade-off gegen Komplexität in V1 |
| Postgres statt SQLite | Prisma abstrahiert; nur `Decimal`-Typen und `VACUUM INTO`-Backup anpassen |
| DATEV-Export | Aus `InvoiceDocument` ableitbar, Steueraufstellung liegt bereits vor |

---

## 14. Umsetzungsreihenfolge

Jeder Meilenstein soll lauffähig und getestet sein, bevor der nächste beginnt.

**M0 — Fundament**
Next.js + TypeScript + Tailwind + Prisma aufsetzen, Docker Compose, `.env.example`,
Linting, Vitest, Schichtenstruktur mit leeren Modulen anlegen.

**M1 — Auth & Sicherheit**
User-Seed-CLI, Login, Sessions, Argon2id, TOTP, Rate Limiting, `requireSession()`,
Security-Header, CSRF. Erst danach entstehen Features.

**M2 — Stammdaten**
Einstellungen (Firma, Bank, Steuer, Logo-Upload), Kundenverwaltung mit CRUD,
Archivierung, Suche.

**M3 — Domain-Kern**
`calculateInvoiceTotals`, Steuerkategorie-Ermittlung, Nummernkreis,
Statusübergänge — als reine Funktionen mit hoher Testabdeckung.
*Hier zuerst die Tests schreiben.* Sonderfälle: §19, Reverse Charge, Rabatte,
Rundung über mehrere Steuergruppen, Teilzahlungen.

**M4 — Rechnungen**
Editor, Positionen, Entwurf speichern, Festschreiben mit Snapshot und
Unveränderbarkeits-Guards, Zahlungen erfassen, Stornierung, Audit-Log.

**M5 — Vorlagen & PDF**
`InvoiceDocument`-Builder, LiquidJS-Engine mit Filtern, Playwright-Renderer inkl.
Netzwerk-Blockade, Post-Processor-Kette (leer), Artifact-Store mit Hash,
Standardvorlage als Seed, Upload und Editor, Live-Vorschau.

**M6 — Dashboard**
`getDashboardMetrics()`, Kacheln, Chart, Fälligkeitslisten, Filter.

**M7 — Betrieb**
Backup-Job, Restore-Doku, Healthcheck, Logging, E2E-Tests für die kritischen Pfade
(Login → Rechnung anlegen → festschreiben → PDF → bezahlen → stornieren).

---

## 15. Akzeptanzkriterien

- Eine festgeschriebene Rechnung lässt sich über die UI nicht mehr inhaltlich ändern.
- Zwei parallele Festschreibungen erzeugen nie dieselbe Nummer (Transaktionstest).
- Eine Rechnung mit 60 Positionen bricht sauber über mehrere Seiten um, mit
  wiederholtem Tabellenkopf und korrekter Seitenzählung.
- Eine Rechnung mit gemischten Steuersätzen (7 % und 19 %) weist eine korrekte,
  gruppierte Steueraufstellung aus; Summe der Gruppen = ausgewiesene Gesamtsteuer.
- Ein Template mit `<img src="http://example.com/x.png">` erzeugt keinen ausgehenden
  Request.
- Ohne gültige Session liefert jede Server Action und jede Download-Route 401/403.
- Nach Restore aus einem Backup ist der Datenstand vollständig, inklusive PDFs.
