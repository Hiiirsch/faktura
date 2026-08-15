# CLAUDE.md — Leitplanken für dieses Projekt

Verbindliche Grundlagen: `rechnungs-app-spec.md` (Architektur, Datenmodell),
`rechnungs-app-anforderungen.md` (prüfbarer Anforderungskatalog) und
`faktura-frontend-design.md` (Gestaltung, Tokens, FA-UI-*/NFA-UI-*). Alle drei sind
nicht verhandelbar. Widersprüche werden gemeldet, nicht still gelöst.

## Rollen & Arbeitsweise

- Der Nutzer ist Auftraggeber und Reviewer, Claude ist umsetzender Entwickler.
- **Meilensteinweise:** genau ein Meilenstein (M0–M7, Spec §14) wird abgearbeitet,
  danach Stopp und Warten auf Freigabe.
- **Testgetrieben in M3** (Berechnung, Steuerlogik, Nummernkreis, Statusübergänge):
  Tests zuerst, dann Implementierung.
- **Anforderungs-IDs referenzieren:** jeder Test und jede Commit-Nachricht nennt die
  abgedeckten IDs, z. B. `feat(invoice): Nummernkreis (FA-NUM-01..04)`.
- **Keine Scope-Erweiterung:** alles mit `[V2]` wird nicht implementiert — die
  Architektur muss es nur ermöglichen. Zusatzideen werden vorgeschlagen, nicht gebaut.
- **Keine Platzhalter:** kein TODO, kein auskommentierter Code, keine Funktion, die
  nur ein leeres Objekt zurückgibt. Was geliefert wird, läuft.
- `FORTSCHRITT.md` wird bei jeder Änderung mitgeführt (Status + Nachweis je ID).

## Technische Leitplanken

1. **Geld ausschließlich als Integer in Cent.** Keine Fließkommazahlen irgendwo in der
   Berechnungskette — auch nicht als Zwischenwert, auch nicht in der Persistenz.
   Mengen als skalierte Ganzzahl (10^4), Steuersätze und Rabatte als Basispunkte
   (1900 = 19 %). Zwischenprodukte laufen über `bigint`; das Produkt aus Menge,
   Cent-Betrag und Rabattfaktor überschreitet `Number.MAX_SAFE_INTEGER` schon bei
   alltäglichen Größen.
   Zwei Rundungsregeln aus Spec §5: je Position **einmal** runden, die Steuer **je
   Gruppe** — nicht je Position. Gerundet wird symmetrisch zur Null, damit eine
   Gutschrift die Rechnung exakt neutralisiert.
2. **Normierte Codes speichern, Labels erst anzeigen** (Spec §9.2): Einheiten als
   UN/ECE Rec 20 (`C62`, `HUR`, …), Steuerkategorien als UNTDID 5305 (`S`, `AE`, `E`,
   `G`, `K`, `Z`), Länder als ISO 3166-1 alpha-2, Währungen als ISO 4217.
   Deutsche Klartext-Labels entstehen ausschließlich in der Anzeigeschicht.
3. **Domain-Schicht ist rein:** `src/domain/**` importiert nichts aus Framework-, UI-
   oder Persistenzmodulen (kein `next/*`, `react`, `@prisma/client`, `node:*`).
   Erzwungen durch `@typescript-eslint/no-restricted-imports` je Schicht und durch
   `tests/architecture/layering.test.ts`, der ESLint programmatisch auf eine Fixture
   ansetzt und beweist, dass die Regel anschlägt (NFA-ARCH-01). Bewusst ohne
   `eslint-plugin-boundaries` — dessen Modul-Resolver kollidiert mit dem von
   `eslint-config-next`.
4. **Kein `any` in der Domain-Schicht.** `@typescript-eslint/no-explicit-any` ist
   Fehler; Build bricht bei TS- oder Lint-Verstößen ab (NFA-QUAL-03).
5. **Sprache:** Oberfläche Deutsch, Code und Bezeichner Englisch. Alle UI-Texte
   zentral in `src/i18n/de.ts`, typisiert — keine deutschen Strings in Komponenten.
   Ton nach Frontend-Entwurf §8: Die Oberfläche spricht den Nutzer nicht an,
   sondern benennt Dinge und Handlungen — „Rechnung erstellen", nicht „Erstellen
   Sie Ihre Rechnung".
6. **Sicherheit ist kein Nachtrag:** M1 kommt vor allen Features. Ab dann wird jede
   neue Route und jede Server Action sofort abgesichert (`requireSession()` als erste
   Anweisung), nicht nachträglich.
7. **Kalendertage als `YYYY-MM-DD`-String**, nicht als `DateTime`: Rechnungs-,
   Leistungs-, Fälligkeits- und Zahlungsdatum sind Kalendertage. Als Zeitpunkt
   gespeichert kippten Monatsumsatz und Überfälligkeit an der Tagesgrenze. Echte
   Zeitpunkte (`issuedAt`, Protokolle) bleiben `DateTime`. „Heute" kommt aus
   `todayIn(APP_TIMEZONE, now)`.
8. **Umsatzrelevanz an einer Stelle** (`src/domain/invoice/revenue.ts`): Gutschriften
   zählen nie mit — die Neutralisierung geschieht dadurch, dass das Original auf
   `CANCELLED` wechselt. Zählte die Gutschrift zusätzlich, fehlte der Betrag zweimal.
   Gutschriften führen positive Beträge; die Richtung steckt im Belegtyp (EN 16931).
9. **Kein Roh-SQL im Anwendungscode** (NFA-ARCH-10): kein `$queryRaw*`,
   `$executeRaw*`. Ausnahme ist der Backup-Job (`VACUUM INTO`), der außerhalb des
   Anwendungscodes im Betriebsskript läuft.

## Festgelegte Versionen

Alle Versionen sind exakt gepinnt, ohne `^`. Zwei bewusste Abweichungen von der
jeweils neuesten Fassung, beide durch Fehlschläge belegt:

- **TypeScript 5.9.3** statt 7.0.2 — `typescript-eslint@8` verlangt `typescript <6.1.0`.
  Mit TS 7 gäbe es kein typbewusstes Linting und damit keine Durchsetzung von
  NFA-ARCH-01 und NFA-QUAL-03.
- **ESLint 9.39.5** statt 10.8.1 — das in `eslint-config-next@16` gebündelte
  `eslint-plugin-react` bricht unter ESLint 10 (`contextOrFilename.getFilename is not
  a function`).
- **Prisma 6.19.3** statt 7.9.1 — Prisma 7 verlangt `prisma.config.ts` und einen
  Driver-Adapter (`better-sqlite3`, nativ kompiliert). Zurückgestellt, bis der
  Nutzen den Aufwand im Container rechtfertigt.

Laufzeit: Node 24.13.0 (`.nvmrc`), Next 16.3.0, React 19.2.8, Tailwind 4.3.3,
Vitest 4.1.10, Zod 4.4.3, lucide-react 1.31.0.

## Gestaltung (seit M5.5b, überarbeitet in M5.8)

`src/app/globals.css` ist die **einzige** Stelle mit Farbwerten, Schriftgrößen,
Radien und Erhebungen. Im Komponentencode stehen ausschließlich die daraus
erzeugten Utilities (`bg-surface`, `text-ink-muted`, `border-rule`) — FA-UI-01.

Die Standardpalette von Tailwind ist mit `--color-*: initial` gelöscht, ebenso
`--radius-*`, `--shadow-*`, `--text-*`, `--font-*` und `--container-*`. `bg-red-500`
ist damit keine Regelverletzung, die jemand bemerken müsste, sondern eine Klasse,
die es nicht gibt. `tests/architecture/design-tokens.test.ts` fängt zusätzlich ab,
was der Compiler nicht sieht: Literalwerte in Attributen, `outline: none` ohne
Ersatz, Verweise ins Netz.

Dasselbe Löschen hat allerdings eine stille Seite: `text-3xl` erzeugt keine
Regel mehr und fällt deshalb **nicht auf** — die Überschrift erscheint einfach
in der geerbten Größe. Drei Seiten trugen so seit M5.5b eine Größe, die es
nicht gab. Der Architekturtest prüft die Schriftskala jetzt eigens.

**Es gibt keine `dark:`-Variante im Komponentencode.** Das dunkle Schema
überschreibt Tokenwerte unter `prefers-color-scheme: dark`; kein Bauteil kennt den
Unterschied. Ausgenommen ist `--sheet`: Das Blatt bleibt auch nachts weiß, und
`--sheet-ink` trägt dafür die feste dunkle Schrift.

**Drei** Erhebungsstufen (seit M5.8): keine — `shadow-raised` — das Blatt
(`shadow-sheet`). Die mittlere gilt ausschließlich für Flächen, die *über* dem
Inhalt liegen: Dialog, Toast, Auswahlleiste, Kennzahlenfläche. Eine Liste in
eine Karte zu setzen bleibt ein Fehler — sie liegt nicht über dem Inhalt, sie
ist der Inhalt. Der Architekturtest führt dafür eine Namensliste, damit die
Ausbreitung der Ausnahme im Diff sichtbar wird. Getrennt wird sonst weiterhin
durch `1px solid var(--rule)` und Weißraum.

Bewegung folgt dem Katalog aus §2.4 des Entwurfs; jede Dauer ist ein Token
(`--duration-state`, `-dialog`, `-toast`, `-stamp`, `-progress`). Es gibt genau
zwei Keyframes, beide in `globals.css`: den Ladebalken und den Stempel beim
Festschreiben. `prefers-reduced-motion` schaltet alles ab.

Symbole kommen aus **einem** Satz (`lucide-react`, gepinnt) mit der Strichstärke
aus `ICON_STROKE`. Ein Symbol ohne Beschriftung gibt es nicht: In der Navigation
steht der Text daneben, bei Zeilenaktionen im `sr-only`-Element — ein
Screenreader liest kein Piktogramm. Eingefärbt wird nie außer über
`currentColor`.

Bestätigungen laufen über `ConfirmDialog` (natives `<dialog>` mit
`showModal()`), nicht über `window.confirm`: Das Browserfenster lässt sich nicht
gestalten und erklärt die Folge nicht. Fokusfalle, Escape und Hintergrundsperre
kommen vom Browser statt aus nachgebautem JavaScript.

Schriften kommen aus `@fontsource/fira-sans` und `@fontsource/fira-mono` (nur der
Latin-Ausschnitt, nur die Schnitte aus §2.2). Kein Font-CDN (FA-UI-04,
NFA-COMP-06).

Sichtbarkeit und Aktivierung jeder Aktion laufen über `can()` in
`src/domain/policy/can.ts` (FA-UI-14) — ein späteres Rollenmodell füllt eine
Funktion, statt jeden Knopf einzeln nachzurüsten.

## Schichten

```
src/app/            Next.js App Router — Routen, Layouts (UI)
src/ui/             React-Komponenten, Formatter (UI)
src/i18n/           zentrale deutsche Texte
src/application/    Use Cases / Server Actions
src/domain/         reine TypeScript-Logik — keine Fremdimporte
src/infrastructure/ Prisma, Dateisystem, Renderer, Auth
  └ repositories/   der einzige Ort, an dem der Prisma-Client erreichbar ist
```

Erlaubte Richtungen: `app → application, ui, i18n, domain` · `ui → domain, i18n` ·
`i18n → domain` · `application → domain, infrastructure` · `infrastructure → domain` ·
`domain → domain`.

**Mandantenkontext (seit M5.5a).** Aller Datenzugriff läuft über
`src/infrastructure/repositories/**`. Jede Funktion dort nimmt einen
`OrganizationContext` als **ersten Pflichtparameter** — eine ungefilterte Abfrage
ist damit ein Typfehler, kein übersehener Filter. Der Typ ist markiert und
entsteht ausschließlich in `organizationContextOf()`; aufgerufen wird die
Funktion beim Auflösen der Sitzung (`ActiveSession.organization`) und im
Einrichtungsskript.

`getPrismaClient()` ist nur noch aus `infrastructure/repositories/**` und
`infrastructure/db/**` importierbar (Lint-Regel `persistenceRestriction`,
nachgewiesen in `tests/architecture/layering.test.ts`). Der Typ schützt vor
Vergessen, die Lint-Regel vor Umgehen — eines allein genügt nicht.

Zwei dokumentierte Ausnahmen ohne Kontext: `auth-repository.ts` (die Anmeldung
löst über die global eindeutige E-Mail auf — welcher Mandant, ist das *Ergebnis*
der Abfrage) und `pingDatabase()` für den Healthcheck.

Transaktionen öffnet `runInTransaction`. Der Rückruf bekommt **keinen**
Prisma-Client, sondern einen undurchsichtigen `TransactionHandle`; sonst ließe
sich innerhalb einer Transaktion an der Repository-Schicht vorbei abfragen.

`InvoiceLine` und `Payment` tragen `organizationId` mit, gefiltert wird aber über
`invoice.organizationId` — genau ein maßgeblicher Abfragepfad. Die Spalte ist
Absicherung für eine spätere Row Level Security unter PostgreSQL (Spec §13);
Trigger halten sie mit dem Beleg gleich.

Zusätzlich: `src/routes.ts` ist das zentrale Routenverzeichnis. Jede neue Route wird
dort eingetragen — `tests/architecture/routes.test.ts` gleicht es gegen das
Dateisystem ab, damit der Zugriffsschutz-Test aus NFA-SEC-01 vollständig bleibt.
Ein Pfad, der dort fehlt, gilt als geschützt.

`src/proxy.ts` (seit Next 16 der Nachfolger von `middleware.ts`) setzt Sicherheits-
Header und CSRF-Token und wehrt Anfragen ohne Sitzungscookie früh ab. Er läuft in
der Edge-Laufzeit ohne Datenbankzugriff und ist deshalb **nicht** die eigentliche
Prüfung — die ist `requireSession()` bzw. `requireSessionOrThrow()` als erste
Anweisung jeder Seite und jeder Server Action. Schreibende Aktionen rufen davor
`assertRequestIntegrity(formData)` auf (Herkunft + CSRF-Token).

Module dürfen beim Import keine Seiteneffekte haben: `getPrismaClient()` und
`getEnv()` werden erst beim Aufruf ausgewertet. Sonst scheitert der
Produktionsbuild, der die Seiten ohne Zugangsdaten analysiert.

Formulare mit `useActionState` (Client-Komponenten) erhalten Eingaben bei
Validierungsfehlern, funktionieren aber **nur mit JavaScript** — React liefert
für sie keine serverseitige Aktionskennung aus. Solche Seiten tragen einen
`<NoScriptNotice>`. Wo Bedienung ohne JavaScript zählt (Anmeldung), wird das
Formular aus einer Server-Komponente mit einfacher Server Action gerendert.

Unveränderbarkeit liegt in **Datenbank-Triggern**, nicht in einer Prisma-Erweiterung:
Um zu entscheiden, ob ein Beleg festgeschrieben ist, müsste die Erweiterung seinen
Status lesen — diese Zusatzabfrage liefe innerhalb einer Transaktion auf der
einzigen SQLite-Verbindung in einen Deadlock. Trigger laufen in derselben
Transaktion und greifen auch ohne Prisma. Geschützt sind Belege ab dem
Festschreiben (inklusive Rückweg auf Entwurf), ihre Positionen und das Audit-Log.
Änderbar bleiben nur Status, Zahlungsstand, Stornovermerk.

Weil sich festgeschriebene Belege und Protokolleinträge **nicht löschen lassen**,
räumen die Integrationstests nicht per `deleteMany` auf, sondern kopieren eine
migrierte Vorlagendatenbank (`tests/integration/setup/database.ts`).

SQLite hat genau einen Schreiber. `getPrismaClient()` setzt deshalb
`connection_limit=1`; nebenläufige Transaktionen warten aufeinander, statt in einen
Socket-Timeout zu laufen (FA-NUM-04).

Migrationen, die eine Tabelle neu aufbauen, verlieren handgeschriebene
CHECK-Bedingungen **und alle Trigger** — SQLite kennt kein
`ALTER TABLE ADD CONSTRAINT`. Jede solche Migration legt sie am Ende neu an;
`20260811113615_organization_context` ist die Vorlage dafür. Zwei Fallen dabei:

- Trigger, die eine *andere* Tabelle lesen (`InvoiceLine_immutable_after_issue`
  liest `Invoice`), lassen `ALTER TABLE … RENAME` scheitern, solange diese
  Tabelle gerade nicht existiert. Sie werden deshalb **vor** dem Neuaufbau
  ausdrücklich verworfen und danach neu angelegt.
- Der Singleton-Zwang auf `CompanyProfile` liegt seit M5.5a im eindeutigen Index
  auf `organizationId` statt in einer CHECK-Bedingung. Ein Integrationstest
  deckt sein Fehlen auf.

Dateien, die sowohl von der Edge-Laufzeit, von Serverkomponenten als auch von
Client-Komponenten gelesen werden (z. B. `infrastructure/security/csrf.ts`), bleiben
importfrei — jede Abhängigkeit von `node:crypto` landet sonst im Browser-Bündel.

## Ausgabe (seit M5)

Der Weg vom Beleg zur Datei ist an einer Stelle beschrieben
(`src/application/documents/render-invoice.ts`), damit Vorschau und Download
nicht auseinanderlaufen. Seit M5.6 gehen sie denselben Weg **bis zum Ende**:
Die Vorschau zeigt das PDF selbst, eingebettet über `?inline=1`. Eine
HTML-Nachbildung daneben konnte nie stimmen — `@page`-Ränder gelten nur beim
Drucken.

Dafür braucht die PDF-Route das Sicherheitsprofil `pdf` (`src/routes.ts`): kein
`sandbox`, sonst startet der eingebaute Betrachter des Browsers nicht, und
`frame-ancestors 'self'`, sonst greift `X-Frame-Options: DENY`.

Für einen **festgeschriebenen** Beleg entsteht das PDF genau einmal und liegt
danach als `InvoiceArtifact` mit SHA-256 vor. Deshalb verändert eine spätere
Vorlagenänderung erzeugte PDFs nicht (FA-TPL-09) — ausgeliefert wird die Datei,
nicht ein bei jedem Abruf neu gesetztes Dokument. Ein **Entwurf** wird bei jedem
Abruf neu gesetzt und nie abgelegt.

Geschrieben wird über eine Zwischendatei und `rename`; ein abgebrochener Lauf
hinterlässt damit nichts (FA-PDF-11). Trigger `InvoiceArtifact_no_update` weist
jede Änderung am Artefakt ab.

Die **Seitenangabe** entsteht nicht in der Fußzeile von Chromium, sondern als
Nachbearbeiter (`page-number-stamp.ts`, pdf-lib). Grund: Sie erscheint erst ab
Seite 2 (FA-PDF-06), und dafür muss die Gesamtseitenzahl bekannt sein — beim
Setzen ist sie es nicht. Ein einseitiges PDF kommt **bytegleich** aus dem
Stempel zurück, sonst hinge der Hash des Artefakts an der Version von pdf-lib.
Damit ist die Post-Processor-Kette aus NFA-ARCH-06 kein leeres Versprechen
mehr; ZUGFeRD hängt sich später an dieselbe Stelle.

Die Schrift des Belegs ist **dieselbe wie in der Oberfläche** (Fira Sans) und
wird als `data:`-URI in jedes Dokument eingebettet. Der Renderer hat keinen
Netzwerkzugriff und der Container keine installierten Schriften — käme sie nicht
mit, setzte Chromium den Beleg in einer Ersatzschrift mit anderen Umbrüchen als
in der Vorschau.

Im Container läuft **Chromium aus der Paketverwaltung** (`CHROMIUM_PATH`), nicht
der Download von Playwright: So kommt es über `apt` an Aktualisierungen. Es
startet ohne `--no-sandbox` (Spec §11.3).

Dafür wirft `docker-compose.yml` erst **alle** Capabilities ab und gibt genau
vier zurück: `SYS_ADMIN`, `SETUID`, `SETGID`, `SYS_CHROOT`. Am Image
ausprobiert — ohne `SYS_CHROOT` scheitert die Sandbox an
`sys_chroot("/proc/self/fdinfo/")`, ohne `SETUID`/`SETGID` am Benutzerwechsel,
und ohne `SYS_ADMIN` gibt es unter Dockers Standard-Seccomp gar keine Sandbox.
Damit trägt der Dienst weniger als die vierzehn Capabilities der Voreinstellung.
Der Anwendungsprozess selbst hat davon nichts: Er läuft als `node` mit leerer
effektiver Menge; erreichbar sind die vier nur über das setuid-Hilfsprogramm
`chrome-sandbox` aus dem Paket `chromium-sandbox`.

`playwright-core/browsers.json` wird zur Laufzeit gelesen und muss deshalb in
`outputFileTracingIncludes` stehen — sonst scheitert der Renderer im Container
schon beim Laden des Moduls.

## Empfänger (seit M5.7)

Ein Beleg trägt seinen Empfänger in einer von drei Quellen, entschieden durch
`Invoice.buyerMode`: `CUSTOMER` (Verweis in die Stammdaten), `FIELDS` (dieselben
Felder, am Beleg erfasst) oder `FREE` (ein Anschriftenblock, wie eingegeben).
`customerId` ist dafür **optional** geworden.

Was das nicht lockert: §14 UStG verlangt Name und Anschrift des Empfängers.
`validateBuyer()` in `src/domain/invoice/buyer.ts` prüft das je Quelle — ein
freier Block aus einer einzigen Zeile ist ein Name ohne Adresse und wird
abgewiesen.

Im Modus `FREE` wird **kein** Name gespeichert. Er entsteht beim Lesen aus der
ersten nichtleeren Zeile (`buyerDisplayName()`); ihn zusätzlich abzulegen hieße,
zwei Wahrheiten zu pflegen, und die zweite wäre die, die nach einer Korrektur
nicht mehr stimmt.

Die Umwandlung „gespeicherte Spalten → Partei" steht an genau einer Stelle
(`src/application/invoices/invoice-buyer.ts`), weil sie an zweien gebraucht wird:
beim Festschreiben für den Snapshot und beim Setzen eines Entwurfs. Zwei
Umsetzungen liefen auseinander, und die Abweichung fiele erst auf, wenn ein
festgeschriebener Beleg anders aussieht als seine Vorschau.

Die Migration `20260815132123_free_recipient` baut `Invoice` neu auf. Dabei
wurde eine stille Lücke geschlossen: `Invoice_organization_matches_*` prüfte
den Kundenmandanten über einen Vergleich, der bei `customerId IS NULL` nach
SQLite-Semantik NULL ergibt und damit *durchließe*. Die Bedingung lautet jetzt
ausdrücklich `NEW."customerId" IS NOT NULL AND …`.

## Listenaktionen (seit M5.8)

Zeilenaktionen und Mehrfachauswahl liegen in **einem** Formular um die ganze
Tabelle — verschachtelte Formulare erlaubt HTML nicht. Daraus folgen zwei
Dinge, die man beide erst im Browser merkt:

- Die Belegkennung wird an die Aktion **gebunden** (`action.bind(null, id)`),
  nicht über `name`/`value` des Knopfes übertragen. React belegt `name` eines
  absendenden Knopfes selbst, um die Aktionskennung für den Betrieb ohne
  JavaScript zu übertragen (`$ACTION_ID_…`), und überschreibt dabei einen
  eigenen Namen. Das Feld kam serverseitig nie an, und die Aktion brach still
  ab — kein Fehler, keine Meldung, nur nichts.
- Die Auswahlleiste wird über `group-has-[input:checked]` in CSS eingeblendet,
  nicht über React-Zustand. So funktioniert die Auswahl ohne JavaScript; nur
  die **Anzahl** der gewählten Belege zählt ein Effekt nach, und ohne
  JavaScript bleibt es bei der allgemeinen Beschriftung.

Rückmeldung nach einer Schnellaktion kommt aus der Adresse
(`?erledigt=<schlüssel>`), nicht aus einem Zustandsspeicher: Die Aktionen laufen
in einem Formular ohne Rückkanal, ein POST endet ohnehin besser mit einer
Umleitung, und die Meldung soll ein Neuladen **nicht** überleben — sie gilt
einer Handlung, nicht einem Zustand.

Sammelaktionen sind bewusst nur zwei: bezahlt markieren und Entwürfe löschen.
Stornieren bleibt einzeln — es erzeugt je Beleg eine nummerierte Gutschrift.

## Meilensteine (Spec §14)

| MS | Inhalt | Status |
|---|---|---|
| M0 | Fundament: Next.js, TS, Tailwind, Prisma, Docker, Lint, Vitest, Schichten | abgenommen |
| M1 | Auth & Sicherheit — vor allen Features | abgenommen |
| M2 | Stammdaten: Firma, Kunden, Katalog | abgenommen |
| M3 | Domain-Kern: Berechnung, Steuer, Nummernkreis, Status — **Tests zuerst** | abgenommen |
| M4 | Rechnungen: Editor, Festschreiben, Zahlungen, Storno, Audit | abgenommen |
| M5 | Vorlagen & PDF: InvoiceDocument, Liquid, Playwright, Artefakte | umgesetzt |
| M5.5a | Mandantenkontext: `organizationId`, Repository-Schicht mit Pflichtparameter | umgesetzt |
| M5.5b | Gestaltung: Tokensatz, Schriften, Rahmen, Bestandsscreens auf Tokens | umgesetzt |
| M5.6 | Vorschau zeigt das erzeugte PDF statt einer HTML-Nachbildung | umgesetzt |
| M5.7 | Empfänger ohne Kundendatensatz: Felder am Beleg oder freier Block | umgesetzt |
| M5.8 | Überarbeitete Oberfläche: Entwurf, Dialog/Toast, Zeilenaktionen, Zweispaltigkeit | umgesetzt |
| M6 | Dashboard: `getDashboardMetrics()`, Kacheln, Chart, Listen | offen |
| M7 | Betrieb: Backup, Restore, Healthcheck, Logging, E2E | offen |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
