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

Ein `overrides`-Eintrag hebt `deepmerge-ts` auf 8.0.2. Der Grund ist eine
Sicherheitsmeldung (Stack Exhaustion beim Verschmelzen rekursiver Objektgraphen)
in der Kette `prisma → @prisma/config → deepmerge-ts`; `npm audit` bricht
darüber ab, und die Kette läuft im Container mit — der Startvorgang wendet die
Migrationen an. Der von npm vorgeschlagene Ausweg wäre ein Rückschritt auf
Prisma 6.12.0 gewesen. Stattdessen wird nur die betroffene Unterabhängigkeit
angehoben; dass die Werkzeugkette das verträgt, ist nachgesehen worden:
`validate`, `generate` und ein vollständiges `migrate deploy` auf frischer
Datei (28 Tabellen, 27 Trigger).

Laufzeit: Node 24.13.0 (`.nvmrc`), Next 16.3.0, React 19.2.8, Tailwind 4.3.3,
Vitest 4.1.10, Zod 4.4.3, lucide-react 1.31.0, pdfjs-dist 6.2.108 (Belegvorschau,
seit M12 — die größte Abhängigkeit im Browser, bewusst in Kauf genommen).

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

Die **Marke** (seit M9) steht in `src/ui/components/brand.tsx` als Inline-SVG mit
`currentColor` — nur so folgt sie dem Farbschema; eine Bilddatei bliebe nachts in
einem Blau stehen, das auf dunklem Grund unter 3 : 1 fällt. Die Wortmarke ist
gewöhnlicher Text aus `de.ts`; Kleinschreibung und Laufweite kommen aus
`.brand-wordmark`. Quelle der Geometrie ist `faktura-logo-g/LIESMICH.txt`.

**Auf dem Beleg erscheint sie nie.** Dort steht das Logo des ausstellenden
Unternehmens (FA-STAMM-05). Ein Beleg ist ein Dokument seines Ausstellers; eine
fremde Marke darauf wäre eine Behauptung über ihn. Der Architekturtest hält fest,
dass kein Bauteil im Weg vom Beleg zur Datei die Marke importiert.

`icon.svg` und `apple-icon.png` liegen in `src/app/` und werden von Next aus den
Dateikonventionen ausgeliefert. Sie stehen deshalb in der Ausnahmeliste des
Proxy-`matcher`: Sonst griffe „was nicht in `routes.ts` steht, gilt als
geschützt", und das Tabsymbol würde ausgerechnet auf der Anmeldeseite auf die
Anmeldung umgeleitet.

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

**Es entsteht beim Festschreiben, nicht beim ersten Abruf** (seit M12,
FA-PDF-13). Bis dahin lag zwischen der Vergabe der Nummer und dem ersten Abruf
ein Fenster, in dem eine Vorlagenänderung den Beleg noch veränderte. Bei den
Daten gab es dieses Fenster nie — Snapshot und vier Trigger frieren sie in der
Sekunde des Festschreibens ein.

Ein Fehlschlag beim Setzen **wirft das Festschreiben nicht um**: Die Nummer ist
vergeben, der Beleg gilt, das PDF entsteht dann beim Abruf. Ein Beleg, der an
einem Renderer scheitert, wäre der schlechtere Fehler.

Daraus folgt eine Nebenwirkung, die nichts mit Belegen zu tun hat: **Wer
festschreibt, startet einen Browser.** Ein Skript, das ihn offen lässt, endet
nie — ein offener Chromium hält den Node-Prozess am Leben. `seed-user.ts` und
`scripts/seed.ts` rufen deshalb `closeRenderer()`, und ein `setupFiles`-Eintrag
tut es nach jeder Integrationstestdatei. Aufgefallen ist es als Hänger der
gesamten Suite, der wie ein langsamer Test aussah; gefunden über ein
Prozess-Sample (`SyncProcessRunner::Spawn`, blockiert).

`RenderedPdf.origin` unterscheidet `stored`, `draft` und `substitute`. Der
dritte Fall ist der Grund für das Feld: Fehlt die abgelegte Datei, wurde bis M12
**still** neu gesetzt und ausgeliefert. Was dabei herauskam, sah aus wie das
Original und war es nicht.

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

## Der Beleg (seit M11)

**Bei §19 UStG steht keine Umsatzsteuer auf dem Beleg** — keine Spalte, keine
Steuerzeile, kein Betrag. Was ausgewiesen ist, schuldet man nach §14c, auch wenn
es falsch ist; eine Spalte „USt. 0 %" behauptet eine Steuerpflicht, die nicht
besteht. Die Regel steht in `documentShowsTax()` im Dokumentmodell, **nicht** in
der Vorlage: Eine Vorlage kann jedes Unternehmen ändern, und diese Entscheidung
darf nicht davon abhängen. Ausgenommen ist nur §19 — bei Reverse Charge und
Ausfuhr ist die Null selbst die Auskunft.

Netto und Brutto bleiben trotzdem beide stehen. Dazwischen erklärt der
§19-Hinweis, warum sie gleich sind.

**Der Blattfuß sitzt in der Fußgruppe einer Seitentabelle**, nicht in einem
festen Element. Zwei Anläufe davor sind gescheitert, und beide Fehler sieht man
erst am zweiseitigen PDF: `position: fixed` erscheint auf jeder Seite, hält aber
**keinen Platz frei** — die Positionszeilen liefen mitten durch den Fuß; ein
negatives `bottom` schnitt ihn an der Blattkante ab. `display: table-footer-group`
tut beides, worauf es ankommt, und dieselbe Technik hält schon den Tabellenkopf
der Positionen fest.

Dazu eine **Mindesthöhe** von 250 mm: Eine Fußgruppe sitzt am Ende ihrer
Tabelle, und bei einer kurzen Rechnung wäre das mitten auf dem Blatt. Auf der
**letzten** Seite eines mehrseitigen Belegs bleibt der Fuß am Inhalt kleben —
die Mindesthöhe gilt der Tabelle, nicht jedem Abschnitt. Der Ausweg wäre der
Randkasten des PDF, und dann gehörte der Fuß nicht mehr der Vorlage.

**Das Logo reist als `data:`-URI** im Dokument, wie die Schrift: Der Renderer hat
keinen Netzwerkzugriff. Die Kennung liegt im Snapshot, ein festgeschriebener
Beleg zeigt also das Logo vom Tag der Ausstellung. Gelesen wird über die
Repository-Schicht statt über `getAsset()` — jene verlangt `companyProfile.read`,
und ein Logo auf dem Beleg ist für jeden sichtbar, der den Beleg sieht.

**Die Vorlage gehört dem Unternehmen.** Änderungen an der ausgelieferten
Standardvorlage erreichen bestehende Installationen **nicht**: `Template` trägt
eine Kopie, und Faktura schreibt sie nicht um. Wer die Verbesserungen will,
setzt die Ränder nach oder legt die Standardvorlage neu an.

## Briefpapier (seit M12)

Ein Unternehmen hinterlegt eine **einseitige A4-PDF**, die unter jede Seite des
Belegs gelegt wird (FA-TPL-11). Sie trägt **nur Gestaltung**: Anschrift,
Bankverbindung und Pflichtangaben setzt die Vorlage. Läge die Steuernummer auf
dem Bogen, stünde sie in einer Datei, die kein Test lesen kann — FA-PFL-02 und
FA-PFL-10 wären dann Behauptungen statt Zusagen.

Der Weg dorthin war ein Gegenvorschlag des Auftraggebers und der bessere: Das
Aussehen in CSS nachzubauen hieße, Winkel und Grautöne aus einem PDF zu raten.
So gestaltet er im Werkzeug seiner Wahl, Faktura bleibt ein DIN-5008-Satzprogramm,
und randabfallend ist geschenkt — der Bogen *ist* das ganze Blatt.

**Geprüft wird auf zwei Schichten**, weil eine nicht reicht. Die Domain
(`domain/assets/pdf-upload.ts`) sieht nur Bytes: Signatur `%PDF-`, 5 MB, und eine
Ablehnung für `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/OpenAction`. Die
Anwendung (`application/company/letterhead.ts`) liest danach mit pdf-lib, was
ohne PDF-Leser nicht zu sehen ist: **genau eine Seite** und **A4 ±2 mm**. Der
Spielraum ist Arithmetik, keine Bequemlichkeit — A4 misst 595,276 × 841,890
Punkte, und Gestaltungsprogramme runden das unterschiedlich.

Die Seitenzahl ist die wichtigere der beiden Prüfungen: Ein zweiseitiger Bogen
wäre eine stille Falle, denn der Beleg bekäme immer nur die erste Seite.

**Der Nachbearbeiter entsteht je Beleg**, nicht einmal beim Start:
`letterheadBackground(bytes)` ist ein Abschluss über die geladenen Bytes. Der
Vertrag `PdfPostProcessor.process(pdf)` kennt keinen Zusammenhang, das
Briefpapier hängt aber am Unternehmen — und bei einem festgeschriebenen Beleg am
Tag seiner Ausstellung. Die Kette wird deshalb pro Lauf zusammengesetzt.

**Die Reihenfolge ist zweimal entscheidend, und beide Male sieht man den Fehler
erst am fertigen PDF:**

- In der Kette steht der Bogen **vor** dem Seitenstempel. Andersherum läge die
  Seitenangabe unter einer deckenden Fläche.
- Innerhalb der Seite steht er **vor** dem Satz. `drawPage` hängt hinten an die
  Zeichenliste an, also *über* den Beleg; ein Bogen mit Farbfläche verdeckte
  damit die ganze Rechnung. Die angehängte Operation wandert deshalb an den
  Anfang des Inhaltsstroms.

Geprüft wird das ohne Rasterer: In einem PDF liegt oben, was zuletzt im Strom
steht — also vergleichen die Tests Positionen statt Pixel.

Der Preis steht im Kommentar: Mit Briefpapier läuft jedes PDF durch pdf-lib, und
die Zusage des Seitenstempels — ein einseitiges PDF kommt bytegleich zurück —
gilt für diesen Beleg nicht mehr. Tragbar, weil der Hash **nach** der Kette
gebildet wird.

Eine **leere** PDF-Seite trägt keinen Inhaltsstrom, und pdf-lib weigert sich,
sie einzubetten. Das ist eine gültige Datei; der Beleg entsteht trotzdem, ohne
Bogen und ohne Fehler — dieselbe Regel wie beim Logo.

Die Vorschau in den Firmendaten ist das PDF selbst, über eine eigene Route mit
dem Profil `pdf`. Unter `assetPath()` mit `sandbox` startet der eingebaute
Betrachter des Browsers nicht (M5.6).

## Vollständigkeit schon im Entwurf (seit M12)

Die Prüfung gab es seit M3 — sie lief nur **zu spät**: erst beim
Festschreiben, als Liste oben im Formular. Wer unten auf den Knopf drückte,
bekam eine Absage für Dinge, die seit einer halben Stunde offen waren.

`completeness-hints.ts` legt jetzt den laufenden Formularstand **derselben**
Domänenfunktion vor, die auch der Server befragt (`validateForIssue`). Ein paar
Felder im Editor auf „leer" abzufragen wäre einfacher gewesen und hätte eine
zweite Vorstellung davon geschaffen, wann ein Beleg vollständig ist — die
zweite ist die, die nach einer Gesetzesänderung nicht nachgezogen wird.

Gelesen wird über `FormData`, nicht aus React-Zustand: Empfängerfelder und
Datumsfelder sind ungesteuert, und sie dafür alle umzubauen hieße, halb
Formular in Zustand zu verwandeln — für eine Anzeige.

**Die Markierung ist eine CSS-Regel auf `aria-invalid`**, keine Klasse an
jedem Feld. Die optische Markierung ist dieselbe Aussage wie die für
Screenreader, und zwei Quellen für dieselbe Aussage laufen auseinander. So
markiert sich jedes Feld, das seinen Zustand ehrlich meldet — auch die
künftigen.

**Ein zu kurzer freier Anschriftenblock ist ein eigener Fall**
(`FREE_BLOCK_TOO_SHORT`, seit M12). Vorher meldete er `NO_BUYER_ADDRESS` —
„Dem Empfänger fehlt die Anschrift" über einem ausgefüllten Kasten, ein
Widerspruch, den der Benutzer nicht auflösen konnte, weil die Regel (Name und
Anschrift auf getrennten Zeilen) nirgends stand. Jetzt sagt der Satz, was er
meint, und der Feldhinweis nennt die Regel.

**Eine Kopie bringt ihre Daten mit.** `duplicateInvoice` lässt Rechnungs- und
Fälligkeitsdatum bewusst leer — die Kopie ist ein neuer Beleg mit neuem Datum.
Nur stand der Editor danach mit zwei leeren Pflichtfeldern da, und das
Festschreiben scheiterte an etwas, das die Anwendung selbst weiß. Er belegt sie
jetzt vor, wie beim Anlegen. Vorbelegt heißt nicht gespeichert.

Der Hinweis steht **über den Knöpfen**, nicht oben im Formular: Er gehört zu
der Handlung, die dort beginnt. Und er ist ein Hinweis, kein Fehler — ein
Entwurf darf unvollständig sein, das ist sein Zweck. Jede Zeile führt zu ihrem
Feld; was kein Feld dieses Formulars betrifft (die fehlende Steuernummer liegt
in den Firmendaten), bleibt Text.

**Der Dialog steht mittig, und zwar ausdrücklich.** Ein `<dialog>` tut das von
Haus aus — die Stilvorgabe des Browsers setzt `margin: auto`. Genau das nimmt
ihm der Preflight von Tailwind, der die Ränder aller Elemente auf null setzt.
Nachgebaut mit `fixed` und `translate` wäre es dieselbe Wirkung mit mehr
Teilen, und die Fokusfalle des Browsers hinge daran.

## Was der Status verspricht (seit M12)

**„Offen" heißt: Da steht Geld aus.** Für eine Stornorechnung stimmt das nicht
— sie stellt keine Forderung, sie nimmt eine zurück. Sie trägt deshalb
„Ausgestellt" und **wird nie überfällig**; ein „12 Tage überfällig" an einer
Gutschrift wäre eine Mahnung an sich selbst.

Entschieden wird das in zwei reinen Funktionen (`statusLabel`,
`showsOverdue`), nicht mitten im Markup: Dort steckt eine Zusage, nicht eine
Formatierung, und Zusagen gehören an eine prüfbare Stelle.

**Dieselbe Blindheit gab es bei den Zeilenaktionen**, und sie reichte weiter:
Sie sahen den Status, nicht den Belegtyp. Eine **Stornorechnung** ließ sich
stornieren und als bezahlt markieren — der Server wies beides ab
(`NOT_AN_INVOICE`, `CREDIT_NOTE`), sichtbar geschah nichts. Die Regeln stehen
jetzt als `canBeCancelled()` und `acceptsPayments()` in der Domäne, wo beide
Seiten dieselben lesen. Eine Kopie in der Oberfläche wäre die zweite Wahrheit,
die beim nächsten Sonderfall zurückbleibt.

**Der Durchgang durch alle Aktionen** (M12) fand denselben Fehler noch dreimal
und einen zweiten dazu:

- Am **stornierten** Beleg stand ein Zahlungsformular. `addPayment` weist
  Entwurf, Gutschrift **und** stornierten Beleg ab; die Bedingung nannte nur
  die ersten beiden.
- **Vorlage löschen**, **Kunde archivieren** und **Katalogposition
  archivieren** wurden ohne `can()` angeboten. Der Server verlangt
  `template.delete`, `customer.archive`, `catalogItem.archive` — wer sie nicht
  hatte, sah den Knopf und landete auf einer Fehlerseite. Das ist die andere
  Richtung desselben Musters und verletzt FA-UI-14.

Die Regel dahinter, für künftige Aktionen: **Jede Aktion wird unter derselben
Bedingung angeboten, unter der der Server sie annimmt** — Zustand *und* Recht.
Steht die Bedingung an mehr als einer Stelle, gehört sie in die Domäne.

**Eine Sammelaktion, die die Auswahl nicht trifft, wird nicht angeboten.**
Vorher standen „Als bezahlt markieren" und „Entwürfe löschen" immer beide da.
Wer drei festgeschriebene Belege wählte und löschen drückte, sah nichts
geschehen — der Server filtert auf Entwürfe, und übrig blieb nichts. Das ist
die Sorte Fehlschlag, die man sich selbst zuschreibt.

Dafür trägt jedes Kästchen seine Art (`data-kind`: `draft`, `payable`,
`credit-note`); die Leiste zählt danach. **Ohne JavaScript bleiben beide Knöpfe
bedienbar** — dann ist nicht bekannt, was gewählt ist, und ein weggelassener
Knopf nähme eine Handlung, die es gibt. Dieselbe Regel wie bei der Anzahl seit
M5.8: Die Verbesserung darf etwas hinzufügen, aber nichts tragen.

## Der tote Knopf im Dialog (seit M12)

**Ein modaler Dialog macht alles hinter sich `inert`.** Ist im Formular ein
Pflichtfeld leer, will der Browser es beim Absenden anspringen, kann es nicht —
und bricht das Absenden **wortlos** ab. Keine Meldung, keine Bewegung, ein
toter Knopf; der einzige Hinweis ist ein Satz in der Konsole:
`An invalid form control … is not focusable`.

Gemeldet wurde das als „der Klick auf Festschreiben geht nicht", und genau so
sah es aus. `ConfirmDialog` prüft deshalb **vor** dem Öffnen, solange das
Formular noch bedienbar ist: Bei einem ungültigen Feld erscheint die Rückfrage
gar nicht — es gäbe nichts zu bestätigen —, sondern der Browser springt das
Feld an und sagt, was fehlt.

Dazu die Gegenrichtung: Lehnt der **Server** ab, steht die Meldung oben im
Formular und der Knopf unten. Der Editor holt den Blick jetzt dorthin
(`scrollIntoView` + `focus`), sonst sieht auch das aus wie „der Knopf tut
nichts". Es ist dieselbe Lücke wie bei den Bestätigungen in B4, nur andersherum.

**Zwei Fallen dabei, beide in Tests:**

- `[role="alert"]` trifft auch den **Routenansager von Next**, der den
  Seitentitel vorliest. Ein Test, der darauf zielt, prüft einen fremden Knoten
  und ist grün, ohne etwas zu beweisen. Unsere Meldungen tragen deshalb
  `data-alert`.
- **Festschreiben speichert zuerst den Formularstand** — sonst schriebe man
  etwas anderes fest als das Sichtbare. Ein Test, der einen unvollständigen
  Stand absendet, hinterlässt damit einen unvollständigen Entwurf. Die
  Browsertests legen sich deshalb ihre Entwürfe selbst an (Duplizieren), statt
  sich den einen aus dem Ausgangsbestand zu teilen.

## Die Vorschau gehört der Anwendung (seit M12)

**Der eingebaute Betrachter des Browsers ist raus.** Er war eine eigene
Anwendung mitten in der Oberfläche: eigenes Grau, eigene Werkzeugleiste, eigene
Schrift, und er kennt weder die Tokens noch das dunkle Schema. `#toolbar=0`
befolgte Chromium, andere Browser nicht — es ist eine Bitte, keine Zusage.

`src/ui/components/pdf-viewer.tsx` setzt das PDF jetzt selbst auf eine
Leinwand, mit eigener Leiste (Blättern, Zoom) aus `de.ts` und Tokens.
`DocumentPreview` liegt darum und erneuert die Ansicht nach dem Speichern.

**Der Preis steht im Kopf der Datei:** `pdfjs-dist` ist mit Abstand die größte
Abhängigkeit im Browser — Kern und Worker zusammen rund 1,6 MB entpackt. Für
den Vorlageneditor wurde Monaco aus genau diesem Grund abgelehnt; der
Unterschied ist die Häufigkeit. Eine Belegvorschau sieht man bei **jedem**
Beleg.

Drei Dinge, die dabei zu beachten waren:

- **`worker-src 'self' blob:`** steht ausdrücklich in der Richtlinie. Ohne die
  Angabe fällt der Browser über `child-src` auf `script-src` zurück, und
  `strict-dynamic` lässt eine Adresse dort nicht gelten — der Worker startete
  wortlos nicht.
- **`useWasm: false`.** Sonst lädt pdf.js für die Bilddekodierung eine eigene
  Datei nach, und die Richtlinie bräuchte `'wasm-unsafe-eval'`.
- **`data-document`** nennt die gezeigte Datei. Im DOM steht sonst nichts
  darüber — anders als beim `<iframe>`, dessen `src` sichtbar war; die
  Browsertests lesen es.

**Die Leiste kann vier Dinge**, und drei davon haben eine Begründung, die man
im Code nicht sieht: Der Zoom kennt zwei **Einpassungen** (Breite, Höhe) und
Stufen darüber — Einpassungen als feste Zahl zu speichern wäre beim ersten
Größenwechsel falsch, deshalb sind sie eine Betriebsart und keine Zahl.
`Strg`+Mausrad meldet seinen Zuhörer **von Hand** an: React meldet
Radereignisse passiv an, und passiv darf man `preventDefault()` nicht — sonst
zöge der Browser seine eigene Seitenlupe auf, während das Blatt sich ebenfalls
ändert. Und geblättert wird mit **links/rechts**; hoch und runter bleiben beim
Rollen, weil das auf einem hohen Blatt die häufigere Absicht ist.

**Greifen und schieben, Vollbild.** Das Blatt lässt sich mit der Maus ziehen —
was der Zeiger zurücklegt, legt der Rollstand in die Gegenrichtung zurück.
`setPointerCapture` hält den Zug fest, auch wenn der Zeiger den Rahmen
verlässt; **nur die Maus**, denn auf einem Berührungsbildschirm rollt der
Browser von sich aus, und zwar besser. Das Vollbild läuft über die
Schnittstelle des Browsers statt über ein `position: fixed` mit hohem
`z-index`: Nur so verschwindet auch, was der Browser um die Seite legt, und
`Escape` tut ohne Zutun das Erwartete. Der Zustand kommt aus
`fullscreenchange`, nicht aus dem eigenen Klick.

**Die Vorschau erneuert sich nach dem Speichern.** Ein `<iframe>` mit derselben
Adresse lädt nicht neu, gleich wie oft React rendert; man sah seine Änderungen
erst nach einem Neuladen der ganzen Seite. Die Version wandert deshalb in die
Adresse **und** in den `key`. Gemeldet wird über ein Fensterereignis: Der Editor
ist eine Client-Komponente, die Vorschau steht in einer anderen Spalte
derselben Server-Komponente — ein gemeinsamer Zustand zwänge die halbe Seite in
den Client-Baum, damit ein Rahmen von einer Zahl erfährt.

Dieselbe Ansicht zeigt das Briefpapier in den Firmendaten. Ein Bogen ist ein
Blatt A4 und soll aussehen wie eines.

## Steuerliche Behandlung im Editor (seit M12)

Bei **§19 ist sie festgestellt, keine Frage.** Sie kommt aus den Firmendaten,
und `determineTaxScheme()` lässt sie alles andere schlagen — wer keine
Umsatzsteuer ausweist, weist auch bei einem ausländischen Kunden keine aus. Sie
als gleichwertigen Eintrag neben „Regelbesteuerung" anzubieten machte den
teuersten Fehlgriff der Anwendung zu einem Klick: Was ausgewiesen ist, schuldet
man nach §14c, auch wenn es falsch ist.

Abweichen bleibt möglich — **FA-CALC-08 verlangt das** —, kostet aber einen
bewussten Schritt hinter einem `<details>` und trägt den Grund neben sich. Das
Auswahlfeld steht dabei im Baum, auch zugeklappt: Ein `<details>` verbirgt
seinen Inhalt, nimmt ihn aber nicht aus dem Formular.

Die beiden anderen Verfahren bleiben am Beleg und nicht in den Firmendaten,
weil sie Eigenschaften des einzelnen Geschäfts sind: Reverse Charge hängt am
EU-Kunden mit USt-IdNr., die Ausfuhr am Drittland.

**Der Vorschlag hatte einen Weg an den Firmendaten vorbei.** Ohne angelegten
Kunden stand in `editor-data.ts` ein `'STANDARD'`, gesetzt an
`determineTaxScheme()` vorbei — der erste Beleg eines Kleinunternehmers kam mit
19 % vorbelegt. Statt eines zweiten Vorschlagswegs bekommt die Funktion jetzt
das eigene Land als Empfängerland: Inland ist die richtige Annahme, solange
niemand etwas anderes sagt.

## Rückmeldung beim Speichern (seit M12)

**Der Mangel war nicht die fehlende Meldung, sondern ihr Ort.** Sie stand als
`Alert tone="success"` über dem ersten Feld, und der Knopf „Speichern" steht am
Ende eines langen Formulars; die Seite springt nach dem Absenden nicht nach oben.
Man drückte, und im Blickfeld änderte sich nichts.

Neun Formulare zeigen sie jetzt als `SaveToast` unten links. Fehler bleiben am
betroffenen Feld (FA-UI-10) — ein Toast bestätigt, er entschuldigt nicht.

**Der Zeitstempel im `'saved'`-Zustand ist kein Beiwerk.** `useActionState`
behält den vorigen Zustand, während die nächste Aktion läuft; zweimal
hintereinander speichern hieß zweimal derselbe `'saved'`. Der Toast blieb nach
dem ersten Mal für immer weg, weil sein Zeitgeber abgelaufen war und die
Komponente nicht neu entstand. Der Zeitstempel ist der `key`.

Die fünf stillen Aktionen der Sicherheitsseite haben keinen Rückkanal und enden
deshalb mit `?erledigt=…` — dasselbe Muster wie die Listen seit M5.8. Vorher
endeten sie mit einem `revalidatePath`: Die Zeile verschwand, und ob das die
Handlung war, musste man erraten.

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

## Betrieb (seit M7)

**Protokolliert wird strukturiert**, über `src/infrastructure/logging/logger.ts`:
eine Zeile je Ereignis als JSON auf stdout. `console.*` ist in `src/` verboten
und wird vom Architekturtest gefangen — nicht aus Formalismus, sondern weil ein
schnell hingeschriebenes `console.error('…', user)` beides umgeht, was das Log
leisten soll: die maschinenlesbare Form und die Entfernung von Geheimnissen.
Die Entfernung sitzt im Schreibweg (`redact()`), nicht in der Disziplin der
Aufrufer. Sicherheitsrelevante Ereignisse tragen `category: 'security'`.

**Der Healthcheck prüft zwei Bestandteile** (NFA-BETR-08): Datenbank und
Renderer, nebenläufig. Der Renderer wird durch einen echten Browserstart
geprüft, nicht durch das Vorhandensein einer Datei — ein Chromium, das wegen zu
enger Capabilities nicht hochkommt, liegt trotzdem an seinem Pfad.

**Der Datenexport** (`/api/export`) liefert Kunden, Belege, Vorlagen,
Nummernkreise und das Protokoll als JSON — **ohne** Zugangsdaten. Ein Export
wird weitergereicht; Passwörter, Sitzungen und TOTP-Geheimnisse gehören dort
nicht hinein. Wer den ganzen Bestand braucht, nimmt die Sicherung.

**Die Sicherung ist ein `.tar.gz`** aus Datenbankabzug und Dateispeicher. Beide
gehören zusammen: Ein festgeschriebener Beleg verweist auf seine PDF-Datei samt
Prüfsumme, und eine Sicherung ohne sie ist keine. Der tar-Schreiber ist
handgeschrieben (`infrastructure/backup/tar.ts`) — eine Sicherung muss man Jahre
später mit üblichen Werkzeugen lesen können, und ein Paket dafür wäre eine
weitere Stelle, an der sie scheitern kann.

Ausgelöst wird sie per Knopf (`/admin/operations` → `/admin/api/backup`) oder als
Betriebsauftrag (`npm run backup`). **Nur mit Adminsitzung** (NFA-SEC-23): Sie
enthält den Bestand aller Unternehmen. Bis M8 lag sie unter `/api/backup` und war
jedem angemeldeten Konto zugänglich — bei einem Unternehmen eine Betreiberfunktion
am falschen Ort, ab dem zweiten ein Datenleck. **Die Anwendung plant nichts von selbst:**
Ein eingebauter Zeitgeber liefe im Container mit, ohne dass jemand ihn sieht.
Die Wiederherstellung läuft von Hand — sie überschreibt den gesamten Bestand,
und dafür soll niemand versehentlich einen Knopf finden.

## Rollen (seit M8)

Jedes Unternehmen legt **eigene** Rollen an; fest ist nur der Katalog der
Berechtigungen. Und der ist **abgeleitet**, nicht danebengestellt: Ein Schlüssel
ist ein Eintrag aus der Tabelle `PERMITTED` in `src/domain/policy/can.ts`, in der
Form `gegenstand.handlung`, typseitig aus derselben Tabelle erzeugt. Wer eine
Berechtigung hinzufügt, ergänzt eine Zeile — Datenbank, Rollenformular und
Oberfläche kennen sie dann.

**Ein unbekannter Schlüssel gewährt nichts.** Nur deshalb braucht
`RolePermission` keine Fremdschlüsselprüfung auf den Katalog: Ein Tippfehler
erweitert keine Rechte. Das unterscheidet ihn grundlegend von `organizationId`,
wo ein falscher Wert eine Grenze verschiebt und deshalb Trigger rechtfertigt.

Berechtigungen werden bei **jeder** Anfrage frisch gelesen (`forSession` in
`auth-repository.ts`), nichts liegt im Cookie. Ein entzogenes Recht wirkt beim
nächsten Klick. In derselben Abfrage stehen die beiden Abweisungsgründe
`User.disabledAt` und `Organization.suspendedAt` — würde die Sperre nachträglich
geprüft, gäbe es ein Fenster dazwischen.

**Die Aussperrsicherung** (FA-ROLE-04): Je Unternehmen hält immer mindestens ein
nicht gesperrtes Konto `organization.administer`. Drei Trigger garantieren das,
und zwei Einschränkungen daran wurden durch Fehlschläge gelernt:

- `AFTER UPDATE OF "roleId", "disabledAt", …` statt `AFTER UPDATE`. Der erste
  Entwurf feuerte bei jeder Kontoänderung — auch beim Zurücksetzen des
  Fehlversuchszählers, wodurch die Anmeldung abbrach.
- Der Trigger greift nur, wenn die Änderung den verbotenen Zustand
  **herstellt**. Ohne die Prüfung, ob die betroffene Zeile selbst eine aktive
  Rechteverwaltung war, ließe sich in einem Unternehmen ohne Rechteverwaltung
  überhaupt kein Konto mehr sperren.

Kein Trigger auf INSERT (das erste Konto einer neuen Organisation entstünde
sonst nie) und keiner auf `Role` DELETE (`ON DELETE RESTRICT` schützt benutzte
Rollen; eine Rolle, die niemand trägt, nimmt niemandem ein Recht).

## Mitglieder (seit M8)

Ein Konto entsteht **ausschließlich per Einladung** (FA-MEMB-01). Die Anwendung
versendet dabei keine E-Mail und darf keine (NFA-COMP-05): Der Link erscheint
genau einmal in der Oberfläche — wie die Wiederherstellungscodes — und wird
außerhalb weitergereicht. Gespeichert liegt nur sein SHA-256-Hash, der Token
verlässt die Anwendungsschicht als Rückgabewert und existiert danach nirgends.

Dasselbe gilt für die Passwortzurücksetzung. Und was dort **nicht** geschieht,
ist der Punkt: Die Rechteverwaltung stellt einen Nachweis aus, sie vergibt kein
Passwort. Ein Verfahren, in dem sie eines vergibt, hätte immer zwei Wissende, und
der erste Wechsel danach wäre freiwillig.

Fristen: Einladung **sieben Tage**, Zurücksetzung **24 Stunden**. Die Einladung
ist die längere, weil sie ausgesprochen wird, bevor jemand da ist; die
Zurücksetzung läuft, während jemand wartet.

**Unbekannt, abgelaufen, zurückgezogen und schon eingelöst antworten gleich**
(FA-MEMB-05). Die Unterscheidung wäre eine Auskunft darüber, wer eingeladen
wurde. Ohne gültigen Token zeigt die Einlöseseite deshalb einen Satz und **kein
Formular** — weder Adresse noch Unternehmensname.

`src/application/members/redeem.ts` ist die dritte und letzte Stelle, die
`organizationContextOf()` aufruft. Der Grund ist derselbe wie bei der Anmeldung:
Wer einen Token vorlegt, ist noch niemand, und die Organisation ist das
*Ergebnis* der Abfrage. Die beiden Vorgänge liegen in einer eigenen Datei, damit
die Ausnahme nicht neben Funktionen steht, die einen Kontext verlangen, und deren
Vorbild wird.

**Kein automatisches Anmelden.** Nach dem Setzen des Passworts geht es zur
Anmeldung. Ein Link, der eine Sitzung eröffnet, wäre ein Passwortersatz mit
sieben Tagen Gültigkeit — und läge in einem Postfach.

Der Einladungslink zeigt den `legalName` aus den Firmendaten, nicht
`Organization.name`. Zwei verschiedene Namen für dasselbe Unternehmen — einer in
der Einladung, ein anderer nach dem Anmelden — sind ein Zweifel an der falschen
Stelle.

Zwei Regeln aus der Datenbank, beide durch die Eigenheiten von SQLite bestimmt:

- `Invitation_one_open_per_email` ist ein **partieller** eindeutiger Index und
  kennt die Frist **nicht** — ein Index-`WHERE` darf kein `CURRENT_TIMESTAMP`
  nennen. Eine abgelaufene Einladung gilt dort weiter als offen. `inviteMember`
  zieht deshalb erst zurück und stellt dann aus, was ohnehin die gewünschte
  Bedeutung ist: Wer erneut einlädt, entwertet den alten Link.
- Ein Rollenumbau **gewährt erst und entzieht dann**. Trigger feuern zeilenweise,
  aufgeschobene Bedingungen gibt es nicht: Wandert `organization.administer` von
  einer Rolle auf eine andere und wird zuerst entzogen, bricht die
  Aussperrsicherung mitten in einer Transaktion ab, die am Ende in Ordnung
  gewesen wäre.

**Ausscheiden heißt sperren, nicht löschen.** Der Beleg behält seinen Urheber.
Wer sperrt, beendet zugleich alle Sitzungen — die Auflösung würde sie ohnehin
abweisen, aber erst beim nächsten Aufruf. Das eigene Konto sperrt niemand: nicht
weil es unmöglich wäre, sondern weil es keinen Vorgang gibt, den das abbildet.

Ein Konto, das ein Recht nicht hat, sieht in der Seitenleiste **keinen Weg
dorthin**. `requirePermission` antwortet mit 404, und ein Menüpunkt, der ins
Nichts führt, ist schlechter als keiner — jeder Eintrag trägt deshalb den
Schlüssel, den seine Seite verlangt.

Die Zeilenaktionen der beiden Verwaltungsseiten stehen in einer **sichtbaren**
Spalte, nicht in der Aktionsspalte von `DataTable`: Deren Aktionen liegen unter
`opacity-0` bis Hover oder Fokus (FA-UI-19). Für die Rechnungsliste ist das
richtig, weil dort jede Zeilenaktion auch auf der Belegseite erreichbar ist. Hier
gibt es keine zweite Stelle.

## Durchsetzung (seit M8)

`can()` entscheidet, was die Oberfläche **zeigt**. `Authorized<K>` in
`src/application/auth/authorize.ts` entscheidet, was der Server **tut** — und
das ist der Schutz: Ein verstecktes Formularfeld lässt sich von Hand nachbauen,
ein fehlender Knopf hält niemanden auf.

Es ist dasselbe Muster wie beim Mandantenkontext, ein zweites Mal angewandt:

```ts
// vorher                                     // nachher
issueInvoice(context: OrganizationContext)    issueInvoice(context: Authorized<'invoice.issue'>)
```

`session.organization` allein passt danach in **keinen** Anwendungsfall mehr.
Die Repository-Schicht bleibt unverändert, weil `Authorized<K>` eine
Schnittmenge mit `OrganizationContext` ist; die Verschärfung wirkt genau eine
Schicht höher, da, wo die Entscheidung fällt.

**Die Marke trägt eine Menge von Flaggen, nicht den Schlüssel als Wert.** Nur so
stimmt die Zuweisbarkeit: `Authorized<'a' | 'b'>` heißt „beide geprüft" und
passt überall hin, wo `Authorized<'a'>` verlangt wird. Trüge sie den Schlüssel
selbst, wären beide gegenseitig unzuweisbar, und jede Stelle mit zwei Rechten
bräuchte einen Ausweg. Wo dagegen **eines von zwei** Rechten genügt, steht eine
Vereinigung von Nachweisen (`allocateInvoiceNumber`: festschreiben **oder**
stornieren).

Vier Aufrufer, vier Funktionen — jede für eine Art von Ablehnung:

| Aufrufer | Funktion | Bei fehlendem Recht |
|---|---|---|
| Server Action | `authorize(session, …)` | wirft `ForbiddenError`, protokolliert |
| Routenhandler | `authorizeRequest(session, …)` | `null` → 403, protokolliert |
| Seite | `requirePermission(…)` | `notFound()` — 404, nicht 403 |
| Abschnitt einer Seite | `authorizeOptional(session, …)` | `null`, **schweigt** |

Eine Seite antwortet mit 404: Ein 403 bestätigt, dass es sie gibt.
`authorizeOptional` schweigt, weil ein weggelassener Abschnitt kein abgewiesener
Zugriff ist — sonst stünde bei jedem Seitenaufruf eines eingeschränkten Kontos
eine Warnung im Log.

Aufgefallen sind bei der Umstellung drei Kopplungen, die vorher niemand sah:
Der Kundenfilter im Kopf der Rechnungsliste hätte ein reines Lesekonto von der
**ganzen Liste** ausgeschlossen; die Firmendatenseite hing am Grundrecht
`companyProfile.read` und hätte jedem Konto Bankverbindung und Steuernummer
aufgeschlagen vorgelegt; und `saveCompanyProfile` braucht Lesen **und** Ändern,
weil das Protokoll die geänderten Felder nennt.

Drei Wege führen an dem Modell vorbei, keiner ist ein Typfehler, für jeden
steht eine Erlaubnisliste in `tests/architecture/authorization.test.ts`:
`OrganizationContext` in einem Anwendungsfall, `organizationContextOf()` von
Hand aufgerufen, `fullyAuthorized()` im Anwendungscode. Alle vier Wächter sind
gegen einen absichtlichen Verstoß geprüft.

`fullyAuthorized()` stellt einen Nachweis über alle Rechte aus, **ohne** zu
prüfen — für Skripte und für Tests der Fachlogik, die keine Sitzung haben.
Bewusst eine benannte Funktion statt eines `as`-Casts an der Aufrufstelle: Ein
Cast wäre überall unsichtbar, diese Funktion ist greppbar.

## Zwei Identitäten (seit M8)

Es gibt **zwei** getrennte Kontenarten mit getrennten Tabellen, Sitzungen und
Cookies:

| | Mandantenkonto | Betreiberkonto |
|---|---|---|
| Tabelle | `User`, `Session` | `AdminUser`, `AdminSession` |
| Cookie | `faktura_session`, Pfad `/` | `faktura_admin_session`, Pfad `/admin` |
| Kontext | `OrganizationContext` | `PlatformContext` |
| Zweiter Faktor | wahlweise | **verpflichtend** |

**Warum getrennt und nicht ein Merkmal an `User`.** Die Zusage „die Verwaltung
sieht keine Geschäftsdaten" ist so eine Eigenschaft des Typsystems statt einer
Absicht: Eine Adminsitzung führt keinen `OrganizationContext`, und jede Funktion
in `infrastructure/repositories/**` verlangt einen als ersten Pflichtparameter —
`listInvoices(adminSession…)` ist ein Übersetzungsfehler. Ein `User` bräuchte
außerdem eine `organizationId` und stünde damit in der Mitgliederliste und im
Datenexport eines Mandanten, und beide teilten sich ein Cookie.

Es gibt **keine** Funktion, die aus einem `PlatformContext` einen
`OrganizationContext` macht. Diese Nichtexistenz ist die Zusage „keine Übernahme
fremder Sitzungen" (FA-ADM-04) und wird von
`tests/architecture/platform-repository.test.ts` festgehalten — zusammen mit der
Erlaubnisliste der Prisma-Delegates: Auf Geschäftstabellen darf
`platform-repository.ts` **nur zählen**.

`src/routes.ts` kennt dafür eine dritte Zugriffsart `platformAdmin`. Der
Zugriffsschutztest prüft solche Routen mit **drei** Anfragen: ohne Cookie, mit
gültigem **Mandanten**cookie, mit Admincookie. Die mittlere ist die, die ein
späterer Umbau still kaputtmacht.

Das erste Betreiberkonto entsteht über `npm run admin:create` — nicht in einer
Migration, denn ein Passwort in einer Migration steht im Repository. Das Kommando
legt allerdings **kein Konto an**, sondern gibt einen Einrichtungslink aus (24
Stunden, einmal einlösbar). Passwort und zweiter Faktor entstehen im Browser; der
`AdminUser` entsteht beim Einlösen, vollständig, in einer Transaktion.

**Warum nicht „Konto anlegen, Einrichtung beim ersten Login erzwingen".** Das
wäre der bequemere Weg gewesen und hätte die Zusage aus FA-ADM-08 aufgegeben:
Zwischen Anlage und erster Anmeldung stünde ein Konto, das nur ein Passwort
kennt, und wer sich zuerst anmeldet, richtet **seinen** Authenticator ein. So
bleibt es dabei, dass es zu keinem Zeitpunkt ein Betreiberkonto ohne zweiten
Faktor gibt — nur muss das Geheimnis jetzt nicht mehr durch ein Terminal.

Das TOTP-Geheimnis steht am `AdminInvitation`, nicht in einem versteckten
Formularfeld. Läge es dort, erzeugte jedes Neuladen ein neues, und wer den ersten
QR-Code gescannt hat, bestätigte gegen das zweite.

Wiederherstellungscodes gibt es für die Verwaltung nicht. Geht der Authenticator
verloren, hilft `npm run admin:reset`: Das Konto wird sofort gesperrt, alle
Sitzungen enden, und ein neuer Einrichtungslink entsteht — beim Einlösen bekommt
**dasselbe** Konto neue Zugangsdaten. Löschen und neu anlegen wäre einfacher
gewesen und hätte das Protokoll beschädigt: Es nennt den Betreiber über seine
Kennung, und die eines gelöschten Kontos zeigt ins Leere. Es ist dieselbe Regel
wie bei den Mitgliedern — sperren statt löschen.

Der Nachweis trägt dafür ein Feld `kind` (`CREATE` oder `RESET`). Beim Einlösen
muss die Lage zur Absicht passen: Ein `CREATE`-Nachweis überschreibt kein Konto,
das inzwischen auf anderem Weg entstanden ist, und ein `RESET`-Nachweis legt
keines an. Ein unbekannter Wert fällt durch beide Zweige — die sichere Richtung,
deshalb braucht es dafür keinen Trigger.

## Rechtliche Seiten (seit M13)

**Das Impressum gehört dem Betreiber, nicht dem Mandanten** — und das ist die
Umkehrung der Regel für Logo und Briefpapier. Dort gilt „gehört dem Mandanten",
weil der Beleg ein Dokument seines Ausstellers ist. Hier bietet das Telemedium
an, wer die **Installation** betreibt; bei drei Unternehmen gäbe es sonst keine
Antwort auf die Frage, wessen Impressum unter `/impressum` steht. Es gibt
deshalb genau eines je Anlage, gepflegt unter `/admin/legal`, abgelegt in
`PlatformSettings` — einer Tabelle mit **einer** Zeile, erzwungen durch den
festen Primärschlüssel `platform` statt durch eine CHECK-Bedingung, die SQLite
bei jedem Tabellenneubau verlöre.

**`getLegalNotices()` nimmt keinen Kontext, und das ist Absicht.** Die
öffentlichen Seiten haben keine Sitzung — ein Impressum hinter einer Anmeldung
wäre keins. Es ist dieselbe Art dokumentierter Ausnahme wie `pingDatabase()`
für den Healthcheck. Geschrieben wird dagegen nur mit `PlatformContext`, und
der Vorgang steht im Protokoll der Verwaltung; **der Inhalt nicht** — es genügt,
dass jemand ihn geändert hat und wann.

**Die Fristen der Datenschutzhinweise sind Verweise, keine Zahlen.**
`domain/legal/privacy-notice.ts` setzt die Auskunft aus `SESSION_LIFETIME_MS`,
`TRUSTED_DEVICE_TTL_MS` und den übrigen Konstanten zusammen; ein Test hält
beides gegeneinander. Eine Erklärung, die neben der Wirklichkeit herläuft, ist
schlimmer als keine — sie ist eine Zusage, die niemand hält. Dieselbe Bauart
wie `TEMPLATE_VARIABLES`.

**Kein Markup aus der Datenbank.** `LegalText` setzt Absätze aus Leerzeilen und
führt nichts aus. Es ist die einzige Stelle der Anwendung, an der fremder Inhalt
öffentlich erscheint; ein `dangerouslySetInnerHTML` wäre hier eine gespeicherte
XSS-Lücke, über die ein Betreiberkonto Skript in jeden Besucherbrowser brächte.

**Ein Link erscheint nur, wohin er führt.** Ohne hinterlegtes Impressum: 404 und
kein Link. Die Datenschutzhinweise stehen dagegen immer — ihr erster Teil
beschreibt die Software und ist auch ohne Zutun des Betreibers wahr. Für den
Zugriffsschutztest trägt die Route dafür `optionalContent: true`: 200 **oder**
404, aber niemals eine Umleitung zur Anmeldung.

Zwei Wächter haben beim Bauen sofort angeschlagen, beide zu Recht: Der
Adminwächter verlangte, das neue Delegate `platformSettings` einzuordnen, und
die Schichtenregel wies `LegalFooter` aus `src/ui/` zurück — ein Bauteil, das
die Anwendungsschicht liest, ist keine Darstellung, sondern eine
Seitenkomposition und gehört nach `src/app/`.

## Verwaltung, zweiter Teil (seit M10)

Der Betreiber verwaltet **seinesgleichen** aus der Oberfläche (`/admin/accounts`),
sieht **was er getan hat** (`/admin/audit`), kann ein Mandantenkonto
**unkenntlich machen**, Name und interne Notiz eines Unternehmens ändern und
Zustand wie Sicherung erreichen (`/admin/operations`). Ein
Navigationsstreifen verbindet die Seiten — bewusst nicht der `AppShell` der
Mandanten, der Firmendaten lädt.

**Die Aussperrsicherung der Verwaltung ist kein Trigger**, und das ist der
Unterschied zur Mandantenseite. Der erste Anlauf war einer und hat vier
bestehende Tests umgeworfen: „Immer mindestens ein aktives Betreiberkonto" ist
kein Invariant dieses Systems. `resetAdmin` sperrt absichtlich und stellt im
selben Zug einen Einrichtungslink aus — in einer Anlage mit einem Betreiber führt
genau der Weg, der bei verlorenem Authenticator hilft, durch einen Zustand ohne
aktives Konto. Und `npm run admin:create` lässt sich mit einer **neuen** Adresse
immer aufrufen; wer Serverzugriff hat, kommt herein.

Die Sicherung sitzt deshalb im **Sperrvorgang**, wo die Absicht unterscheidbar
ist: „Sperren" bietet keinen Rückweg an und darf das letzte aktive Konto nicht
treffen, „Zurücksetzen" stellt ihn aus und darf es. Bei den Mandanten ist es
umgekehrt richtig — dort kann niemand auf den Server, dort ist es ein Invariant
und gehört in die Datenbank.

**Das Protokoll der Verwaltung ist eine eigene Tabelle** (`PlatformAuditEntry`),
kein Filter auf `AuditLog`. Zwei Gründe: Vorgänge an Betreiberkonten haben keine
Organisation und hätten dort keinen Platz — eine Seite mit diesem Titel hätte die
Hälfte verschwiegen. Und die Verwaltung müsste das Protokoll der Mandanten lesen
dürfen, wo Rechnungsnummern und Beträge im Klartext stehen; die Zusage aus
FA-ADM-02 hinge dann an einem `where`. Der Preis ist eine doppelte Aufzeichnung
für Eingriffe mit Unternehmensbezug — einmal für jede Leserschaft. Beide
Schreibvorgänge stehen in **einer** Funktion; sechs Aufrufer, und der siebte hätte
den zweiten vergessen.

**Anonymisieren statt löschen.** `Invoice.createdById` ist ein echter
Fremdschlüssel, und er ist es genau deshalb: Der Beleg behält seinen Urheber, das
Protokoll seinen Akteur, nur führt die Kennung zu niemandem mehr. Entfernt werden
Adresse, Name, Zugangsdaten und **jede** Anmeldespur — Sitzungen, vertraute
Geräte, Passkeys, Wiederherstellungscodes, offene Zurücksetzungen —, alles in
einer Transaktion.

Die Platzhalteradresse trägt die Kennung und endet auf `.invalid` (RFC 2606):
Ohne die Kennung darin kollidierte die zweite Anonymisierung mit der ersten im
eindeutigen Index. Die Aussperrsicherung aus FA-ROLE-04 greift dabei **ohne
Zutun**, weil `roleId` und `disabledAt` mitgesetzt werden — genau die Spalten,
auf die ihr Trigger hört.

Die Anzeige unterscheidet danach **drei** Fälle statt zwei: ein Name, ein
entferntes Konto, gar kein Urheber. Der mittlere darf nicht wie der letzte
aussehen — ein Bestandsbeleg *hat* keinen Urheber, ein anonymisierter hat einen.

**Die vierte Lücke des Adminwächters** war grundsätzlicher als die ersten drei:
Alle lasen **eine** Datei. `createPlatformAuditEntry` nahm einen
`PlatformContext` und stand in `audit-repository.ts` — dort hätte sich eine
Lesefunktion auf `auditLog` anlegen lassen, ungeprüft. Sie ist umgezogen, und der
Wächter verlangt jetzt, dass es außerhalb von `platform-repository.ts` keine
solche Datei gibt.

**Ein Fallstrick der Integrationstests**, zweimal aufgetreten und beide Male wie
ein Fachlogikfehler aussehend: `resetDatabase()` tauscht die Datenbankdatei und
trennt dafür den Prisma-Client der **Anwendung**; den eines Testmoduls kennt es
nicht. Bleibt der offen, hängt er an der abgehängten alten Datei — Lesezugriffe
liefern veraltete oder gar keine Zeilen, Schreibzugriffe scheitern an
Fremdschlüsseln auf Zeilen, die es dort nie gab. Jede Testdatei mit eigenem
Client trennt ihn deshalb **vor** dem Reset.

## Passkeys (seit M9)

Ein Faktor, der **nicht wandert**: Der private Schlüssel verlässt das Gerät nie,
und die Signatur bindet sich an die Herkunft der aufrufenden Seite. Eine
nachgebaute Anmeldeseite bekommt nichts — das ist der eigentliche Gewinn
gegenüber TOTP, einem geteilten Geheimnis.

`userVerification: 'required'` ist die Bedingung, unter der ein Passkey **allein**
anmelden darf: Die Gerätesperre ist der zweite Faktor. Ohne sie wäre er nur ein
Besitzfaktor, und passwortloses Anmelden eine Einfaktorauthentifizierung.

**Beide Identitäten teilen sich Tabelle und Zeremonie**, weil die Zeremonie
dieselbe ist; getrennt bleiben sie dort, wo es zählt — in Sitzung, Cookie und
Route. Ein `WebAuthnCredential` gehört zu genau einem Konto, erzwungen durch
denselben CHECK wie bei `PendingLogin`. Die Routen sind bewusst zwei: Eine, die
je nach mitgesendetem Cookie das eine oder das andere täte, wäre die erste
Stelle, an der die Trennung verschwimmt.

**Die Herkunft wird an genau einer Stelle abgeleitet**
(`infrastructure/auth/webauthn.ts`). Ein falsches `rpID` ist ein stiller
Totalausfall: Passkeys lassen sich anlegen, aber nie benutzen, und der Fehler
zeigt sich als wortlose Ablehnung im Browser. Ein Domainwechsel entwertet **alle**
Passkeys — das lässt sich nicht abfangen, die Bindung ist der Zweck.

**Eine IP-Adresse ist als `rpID` unzulässig**, auch die des eigenen Rechners.
`127.0.0.1` ist ein sicherer Kontext, aber kein Domainname; der Browser bricht
die Zeremonie wortlos ab. Aufgefallen ist das erst im Browsertest — die
Anwendungsschicht kann diesen Fehler nicht sehen, weil er im Browser passiert,
bevor eine Antwort entsteht. Zwei Folgen: `isPasskeyCapableOrigin()` weist
IP-Adressen ab, damit der Knopf dort nicht erscheint, und der Integrationsserver
läuft seither unter `localhost` statt `127.0.0.1`.

Der `userHandle` trägt die Kennung des Kontos mit Präfix (`user:` / `admin:`),
nicht die E-Mail-Adresse: Er liegt unverschlüsselt im Authenticator und reist bei
jeder Anmeldung mit. Eine Kennung sagt nichts über den Menschen dahinter, eine
Adresse schon. Das Präfix trennt die beiden Identitäten — ohne es könnte ein
Passkey ins falsche Konto führen.

**Die Aufgabe wird vor der Prüfung verbraucht**, nicht danach: Eine zweite
Antwort darauf ist ein Wiedereinspielversuch und soll nichts mehr vorfinden,
gleich ob die erste gelang.

**Der Zähler ist die Klonerkennung.** Ein Rückschritt heißt: Den Schlüssel gibt
es zweimal. Die Folge ist eine Sperre, nicht nur ein Protokolleintrag — ein Wert,
den man nur aufschreibt, ist eine Warnung, die niemand liest. Ausgenommen sind
Authenticator, die gar nicht zählen und immer 0 melden.

**Die Reihenfolge dabei ist der Punkt.** `verifyAuthenticationResponse` bekommt
`counter: 0` übergeben, obwohl der gespeicherte Wert vorliegt — die Prüfung macht
`passkey-login.ts` selbst, gleich darunter, auf dem **verifizierten** `newCounter`
und damit **nach** der Signatur. Überließe man sie der Bibliothek, käme der Klon
als Ausnahme an und ließe sich nicht von einer beliebigen ungültigen Antwort
unterscheiden — der Passkey würde nicht gesperrt. Läse man den Zähler dagegen
vorher aus den Rohdaten, ließe sich mit einer **erfundenen** Antwort ein fremder
Passkey sperren, ohne ihn zu besitzen.

**Ohne JavaScript geht es nicht**, und das ist die einzige Stelle der Anwendung,
für die das gilt. Verkraftbar, weil ein Passkey eine Ergänzung ist: Passwort und
zweiter Faktor bleiben, und die Anmeldung selbst funktioniert weiterhin ohne. Wo
die Adresse kein sicherer Kontext ist, erscheint der Knopf gar nicht erst,
sondern der Grund.

Der CSRF-Token reist bei der Zeremonie in einer **Kopfzeile**
(`assertJsonRequestIntegrity`), weil kein Formular hinausgeht. Eine fremde Seite
kann ein Formular abschicken, aber keine eigene Kopfzeile setzen, ohne den
Vorabflug zu bestehen — und den lässt die Herkunftsprüfung nicht durch.

**Dafür gibt es zwei Kopfzeilennamen, und der Grund ist eine Lücke, die genau
einmal bestand.** `CSRF_HEADER_NAME` läuft vom Proxy zu den Serverkomponenten,
damit ein Formular beim allerersten Aufruf ein gültiges Feld rendern kann — der
Proxy `set`zt sie bei jeder Anfrage und überschreibt dabei, was ein Aufrufer
mitschickt. Die erste Fassung der JSON-Prüfung las genau diese Kopfzeile und
verglich damit das Cookie mit einem Wert, den der Proxy aus demselben Cookie
gebildet hatte. Sie ging immer durch. Der Aufrufer sendet deshalb unter einem
eigenen Namen (`CSRF_REQUEST_HEADER_NAME`): zwei Richtungen, zwei Namen.

Sichtbar wurde das erst über HTTP. Die Anwendungstests rufen die Schicht darunter
auf, und dort gibt es keinen Proxy — der Fehler war für sie unerreichbar.

Geprüft wird auf **zwei Ebenen**: `tests/support/authenticator.ts` baut einen
Authenticator aus `node:crypto` nach (ES256, COSE-Key und Signatur von Hand) und
stellt damit die Fälle her, die ein echtes Gerät nie erzeugt — falsche Herkunft,
fremde Domain, abgelaufene Aufgabe, zweite Antwort. Der Browsertest daneben
beweist, dass die Zeremonie im echten Chromium durchläuft.

## Vertraute Geräte (seit M9)

Nach erfolgreichem zweitem Faktor lässt sich ein Gerät als vertraut hinterlegen;
dort entfällt der Code für **30 Tage**. Das Passwort wird weiterhin verlangt.

**Das schwächt die Zweifaktorauthentifizierung bewusst**, und es ist nur
vertretbar, solange vier Dinge gelten:

1. Der Nachweis ist an **ein Konto** gebunden, nicht nur an einen Token —
   geprüft wird mit `userId` **und** Hash. Ohne die Bindung wäre ein entwendetes
   Cookie ein Universalschlüssel: Es überspränge den zweiten Faktor für jedes
   Konto, dessen Passwort der Angreifer kennt.
2. Er ist sichtbar und einzeln widerrufbar (`/settings/security`). Ein Nachweis,
   den man nicht sieht, lässt sich nicht widerrufen.
3. Er endet mit **jedem** Ereignis, das den Verdacht auf Verlust begründet:
   Passwortzurücksetzung (auch die durch den Betreiber), Abschalten des zweiten
   Faktors, Sperren des Kontos, „alle anderen Sitzungen beenden". Fehlte einer
   dieser Wege, bliebe die jeweilige Handlung an genau der Stelle wirkungslos,
   an der sie gebraucht wird.
4. Er gilt **nicht** für Betreiberkonten (FA-ADM-08).

Der Token entsteht erst **nach** dem zweiten Faktor. Vorher wäre er ein
Nachweis, den jemand ohne den zweiten Faktor erhielte — das Gegenteil dessen,
wofür er steht.

Gelesen wird das Cookie in der Server Action, nicht in der Anwendungsschicht:
`login()` nimmt den Token als Parameter. Die Schicht kennt keine Cookies, und
das soll so bleiben.

Auch das aufrufende Gerät verliert seinen Nachweis bei „alle anderen Sitzungen
beenden". Es kann sich nicht ausnehmen, weil eine Sitzung nicht weiß, welcher
Gerätenachweis zu ihr gehört — und im Zweifel ist das die sichere Richtung.

## Wege aus einer Sackgasse (seit M9)

Zwei Zugänge waren unwiederbringlich, und beide hatten dieselbe Form: **Der
einzige, der sie wiederherstellen könnte, ist genau der Verlorene.**

- Die Einladung eines Unternehmens erscheint genau einmal. Ging sie verloren,
  kam niemand hinein — die Mitgliederverwaltung erreicht nur, wer schon drin ist.
- Verliert das einzige Konto mit `organization.administer` sein Passwort, kann es
  niemand zurücksetzen: Die Zurücksetzung verlangt genau dieses Recht. Der
  Trigger garantiert, dass ein solches Konto **existiert**, nicht dass jemand
  hineinkommt.

Der Betreiber kann jetzt beides: eine Einladung erneut ausstellen und einen
Zurücksetzungsnachweis für ein Mandantenkonto. **Was er dabei nicht bekommt:**
eine Sitzung, ein Passwort oder Einsicht. Er stellt einen Nachweis aus, den ein
Mensch einlöst.

Dass er ihn selbst einlösen und ein Konto übernehmen könnte, ist der bewusst in
Kauf genommene Preis (Plan M9, H6). Sichtbar gemacht wird er auf zwei Wegen: Der
Vorgang steht im Protokoll **des Unternehmens** mit `actorKind: 'ADMIN'`, und
alle Sitzungen des Kontos enden dabei.

Nebenbei behoben: `createOrganizationWithOwner` zog offene Einladungen nicht
zurück. Ein zweiter Anlauf mit derselben Inhaberadresse lief damit in den
globalen partiellen Index `Invitation_one_open_per_email` — der Betreiber sah
einen Datenbankfehler statt einer Meldung.

**Der Wächter des Adminbereichs hatte dabei seine dritte Lücke.** Er prüfte zwei
Listen: Geschäftsdelegates (nur zählen) und Verwaltungsdelegates (frei). Was in
**keiner** von beiden stand, prüfte niemand — `invitation` und `passwordReset`
kamen so herein, ohne dass jemand die Frage beantworten musste. Jetzt muss jedes
benutzte Delegate in einer der Listen stehen.

Der erste Anlauf dieser dritten Prüfung war selbst kaputt: Er suchte
`.<name>.<methode>(` und filterte dann heraus, was kein Delegate sein konnte —
und warf dabei genau die unbekannten weg, die er finden sollte. Er bestand,
während `recoveryCode` ungeprüft durchging. Erfasst wird jetzt der **Empfänger**
(`clientFor(...)` oder `client`), nicht nur der Name.

## Urheber am Beleg (seit M8)

`Invoice.createdById` verweist auf `User` — ein echter Fremdschlüssel, kein
Textfeld wie `AuditLog.actorId`. Der Unterschied ist begründet: Ein Konto wird
**nie gelöscht**, sondern gesperrt, gerade damit der Beleg seinen Urheber
behält. Damit kann der Verweis nicht ins Leere zeigen.

Der Fremdschlüssel hat sofort etwas aufgedeckt: Die Integrationstests übergaben
seit M4 erfundene Akteure (`test`, `pruef-akteur`, `einrichtung`). Das ging gut,
weil `AuditLog.actorId` keinen Fremdschlüssel trägt — sie behaupteten also einen
Akteur, den niemand hätte finden können. `resetDatabase()` legt jetzt ein
Prüfkonto mit fester Kennung an (`TEST_ACTOR_ID`), und die Tests handeln in
dessen Namen. Das Konto trägt **keine Rolle**, damit es in keiner Rechteprüfung
mitzählt — insbesondere nicht in der Aussperrsicherung.

**Die Kopie gehört dem, der sie anlegt.** Beim Duplizieren wandert alles mit —
Empfänger, Positionen, Vorlage. Der Urheber gerade nicht: Er ist keine
Eigenschaft des Belegs, sondern eine des Vorgangs, der ihn erzeugt hat. Dasselbe
gilt für die Gutschrift beim Stornieren.

Bestandsbelege tragen `NULL` und behalten es. Sie nachträglich aus dem Protokoll
zuzuschreiben hieße raten, und eine geratene Urheberschaft an einem
unveränderlichen Beleg ist schlimmer als eine leere.

Die Spalte „Erstellt von" erscheint erst, wenn das Unternehmen **mehr als ein
Konto** führt: In einem Einpersonenbetrieb stünde in jeder Zeile derselbe Name.
Die Zahl kommt aus `countMembers`, und die hängt an `invoice.read` statt an
`organization.administer` — der Urheber eines Belegs ist innerhalb eines
Unternehmens keine geschützte Auskunft, er steht in derselben Zeile wie der
Beleg. Eine Zahl, keine Liste: Namen und Adressen der Kollegen bleiben hinter
der Rechteverwaltung.

**Der Akteur reist im Ausführungskontext, nicht im Ereignis.** Ein
`InvoiceIssued` beschreibt, was geschehen ist, nicht unter welchen Umständen.
`InvoiceEventContext` trägt deshalb Mandant, Akteur und Herkunft; der
Typparameter von `InvoiceEventHandler` stand dafür immer schon offen. Damit
fallen die beiden `void actorId;` in `issue-invoice.ts` und `cancel-invoice.ts`,
die seit M4 dort standen, weil es keinen Weg gab, den Akteur weiterzureichen.

Dabei kamen zwei weitere Lücken heraus, beide gegen NFA-COMP-01: Zahlungen
trugen keinen Akteur im Protokoll, und **Korrigieren und Zurücknehmen einer
Zahlung schrieben überhaupt nichts** — es gab dafür kein Domain-Ereignis und
damit keinen Handler. Die Aktion `PAYMENT_REMOVED` stand seit M4 im Katalog und
wurde nie benutzt; das war der Hinweis, den niemand gelesen hat.

### Die Migration, die keine sein durfte

Für eine neue Spalte mit Fremdschlüssel erzeugt Prisma unter SQLite eine
`RedefineTables`-Migration: neue Tabelle, Daten kopieren, `DROP TABLE "Invoice"`,
umbenennen. Sie hätte **elf** Trigger mitgenommen — die vier auf `Invoice` und
sieben weitere auf `InvoiceLine`, `Payment` und `InvoiceArtifact`, die `Invoice`
nur lesen.

Ersetzt durch ein reines `ALTER TABLE "Invoice" ADD COLUMN`. SQLite erlaubt das
mit `REFERENCES`, solange die Spalte nullable ist und keinen Vorgabewert hat.
Danach wird **ein** Trigger neu angelegt: `Invoice_immutable_after_issue` muss
die neue Spalte kennen, sonst wäre die Urheberangabe an einem festgeschriebenen
Beleg still veränderlich — das Gegenteil dessen, wofür sie da ist.

## Verwaltung (seit M8)

Der Betreiber legt Unternehmen an, legt sie still und sperrt Konten. Mehr nicht
— und das „mehr nicht" ist keine Einstellung, sondern der Aufbau.

**Anlegen ist eine Transaktion**: Organisation, Rolle „Inhaber" mit allen
Schlüsseln, Einladung. Bräche sie in der Mitte ab, gäbe es eine Organisation
ohne Rolle — ein Unternehmen, in das niemand hineinkommt, auch der Betreiber
nicht. Die Einladung trägt **kein** `invitedById`: Eingeladen hat der Betreiber,
und der ist kein `User`. Wer es war, steht im Protokoll.

**Der Betreiber erfährt zu keinem Zeitpunkt ein Mandantenpasswort.** Was er
weitergibt, ist ein Einladungslink; gesetzt wird das Passwort von dem, der es
danach kennt. Das ist der stärkste Beleg für „keine Geschäftsdaten", den das
System liefern kann.

**Der Wächter aus B1 hatte eine Lücke, und B5 hat sie aufgedeckt.** Er suchte
nach `client.invoice.<methode>(` — der Form, in der man ein Delegate direkt
anspricht. Es gibt aber eine zweite:

```ts
organization.findMany({ include: { invoices: true } })                     // liest Belege
organization.findMany({ include: { _count: { select: { invoices: true } } } })  // zählt sie
```

Beide gehen über `organization`, beide nennen `invoices`, und die erste liefert
vollständige Belegzeilen. Geprüft wird deshalb zusätzlich über die
**Beziehungsnamen**: Sie dürfen nur innerhalb eines `_count`-Blocks vorkommen.
Beide Formen sind gegen einen absichtlichen Verstoß geprüft.

Das Protokoll der Verwaltung läuft über eine **zweite** Funktion
(`recordPlatformAuditEntry`), nicht über einen optionalen Parameter an der
ersten. Die Organisationskennung kommt dort als gewöhnliche Zeichenkette, der
`PlatformContext` ist der Nachweis. Ein optionaler Parameter hätte
`createAuditEntry` zu einer Funktion gemacht, die manchmal einen Kontext
braucht.

**Stilllegen verliert nichts.** Keine Löschfunktion für ein Unternehmen: Belege
sind aufbewahrungspflichtig, und ein Knopf dafür wäre einer, den niemand
versehentlich finden soll.

`defaultOrganizationContext()` ist entfallen. Sie riet die Organisation, wenn es
genau eine gab; mit mehreren Mandanten wäre das Raten eine stille Zuweisung in
ein fremdes Unternehmen. `npm run user:create` verlangt jetzt `--organization`
und nimmt wahlweise `--role`; ohne Argument nennt es die vorhandenen Kennungen.

Der Zugriffsschutztest prüft Adminrouten seit B5 mit **vier** Anfragen: ohne
Cookie, mit Mandantencookie, mit Admincookie (die erst zeigt, dass sich die
Route überhaupt öffnet), und einer Prüfung des ausgelieferten HTML auf
Belegnummer und Kundenname.

## Anmeldung (seit M6.2)

Sie läuft in **zwei** Schritten: `/login` nimmt E-Mail und Passwort,
`/login/code` den zweiten Faktor — und die zweite Seite erscheint nur, wenn das
Konto einen führt.

Zwischen beiden steht ein Zustand, den es vorher nicht gab: „Passwort stimmte,
Code fehlt noch." Er liegt in einer **eigenen Tabelle** (`PendingLogin`), nicht
als Sitzung mit Merkmal. Der Grund ist die Fehlerklasse, die sonst entstünde:
Läge er als `Session` mit einem Feld „zweiter Faktor fehlt", hinge die gesamte
Zweifaktorauthentifizierung daran, dass **jede** Sitzungsabfrage dieses Feld
mitprüft — eine vergessene Stelle genügte. Als eigener Typ an eigenem Ort kann
ihn keine Sitzungsabfrage finden.

Er läuft nach fünf Minuten ab, liegt nur als SHA-256-Hash, reist als Cookie mit
`path=/login` (also bei keiner anderen Anfrage mit), und ein neuer verwirft
ältere desselben Kontos. Die Sperre nach zehn Fehlversuchen zählt im zweiten
Schritt weiter; ein richtiges Passwort allein setzt den Zähler **nicht** zurück
— sonst wäre der Code beliebig oft ratbar.

**Was die Aufteilung kostet:** Die einstufige Fassung konnte falsches Passwort
und falschen Code ununterscheidbar beantworten. Wer den zweiten Schritt sieht,
weiß jetzt, dass das Passwort stimmte. Das ist jedem zweistufigen Verfahren
eigen. Der **erste** Schritt bleibt ununterscheidbar: unbekanntes Konto und
falsches Passwort ergeben dieselbe Antwort und denselben Rechenaufwand.

`/login/code` ist in `src/routes.ts` öffentlich, trägt aber
`requiresPendingLogin: true`. Der Zugriffsschutztest prüft für solche Routen
nicht auf `200`, sondern auf die Umleitung an den Anfang — eine `200` ohne
Nachweis wäre dort der Fehler.

## Auswertung (seit M6)

Alle Kennzahlen der Übersicht stammen aus **einer** Funktion
(`src/application/dashboard/dashboard-metrics.ts`, FA-DASH-09) — Kacheln,
Diagramm, beide Fristenlisten, die zuletzt bearbeiteten Belege und die
Top-Kunden. Die Seite selbst rechnet nichts; sie formatiert und ordnet an.

Gerechnet wird **in der Anwendung, nicht in SQL**: `listInvoicesForMetrics()`
liest eine schmale Projektion aller Belege (ohne Snapshots und Fließtexte),
die reine Rechnung steht in `src/domain/dashboard/metrics.ts`. Je Kennzahl
eine `SUM`-Abfrage hätte die Frage „was zählt als Umsatz" in jedem `WHERE`
erneut beantwortet — dieselbe Regel ein zweites Mal, in einer anderen Sprache.
Der Preis ist eine Größenabhängigkeit; sie ist gemessen, nicht behauptet
(`tests/integration/dashboard-performance.test.ts`, 22 ms bei 1.000 Belegen).

Drei Regeln werden dabei **benutzt, nicht wiederholt**: Umsatzrelevanz aus
`invoice/revenue.ts`, Überfälligkeit und offener Betrag aus
`invoice/status.ts`. FA-DASH-04 ist deshalb keine eigene Prüfung, sondern eine
Folge — Entwürfe und Stornos fallen schon durch `countsTowardRevenue()` heraus.

Der Bezugstag ist ein **Parameter**, kein `new Date()` im Rumpf: Überfälligkeit,
laufender Monat und die Zwölfmonatsreihe hängen am selben Tag. Läse jede
Kennzahl ihre eigene Uhr, könnte eine um Mitternacht geladene Übersicht
denselben Beleg als überfällig und als heute fällig ausweisen.

## Zustellung (seit M14)

**Die Mail ist ein zusätzlicher Weg, kein Ersatz.** Einladung, Zurücksetzung und
Einrichtung eines Betreiberkontos erscheinen weiterhin genau einmal in der
Oberfläche; ist ein Mailserver eingerichtet, gehen sie **zusätzlich** hinaus.
Damit bleibt die Zusage aus M8 unangetastet: Wer die Nachricht nicht bekommt,
ist nicht ausgesperrt — und ein Fehlschlag beim Versand ist kein Fehlschlag der
Handlung. Der Test dazu prüft beides in **einem** Durchlauf
(`tests/integration/invitation-delivery.test.ts`): Sobald der Link woanders
steht, liegt es nahe, ihn aus der Oberfläche zu nehmen.

**Die Verwaltung stellt ebenso zu — das war der erste Nachtrag.** B2 hat drei
Wege verkabelt und drei übersehen, alle in der Betreibersicht: Unternehmen
anlegen, Einladung erneut ausstellen, Zurücksetzung für ein Mandantenkonto.
Nichts daran war ein Typfehler; jede Funktion war für sich richtig, der Fehler
lag zwischen ihnen. `tests/architecture/delivery.test.ts` hält die Regel jetzt
fest: Ein Modul der Anwendungsschicht, das `generateRedemptionToken()` aufruft,
ruft auch eine `deliver*`-Funktion auf.

Bei der Zurücksetzung durch den Betreiber ist die Zustellung mehr als
Bequemlichkeit. Er könnte den Nachweis selbst einlösen — der bewusst in Kauf
genommene Preis aus M9. Geht die Nachricht an den Kontoinhaber, erfährt der
davon, ohne ins Protokoll zu sehen: Der Eingriff wird dadurch nicht unmöglich,
aber sichtbar.

**Ein Testlauf verschickt nichts, und das musste erzwungen werden.** Vitest
liest die `.env` des Entwicklers mit; sobald dort Zugangsdaten standen, gingen
Einladungen an `ohne-mail@example.org` **tatsächlich** hinaus — an eine
reservierte Domäne, also als Rückläufer, die den Absenderruf beschädigen.
Aufgefallen ist es nur, weil zwei Tests `not-configured` erwarteten.

Ein `setupFiles`-Eintrag, der die Variablen löscht, reichte nicht: Nach knapp
dreißig Tests standen sie wieder da. Die Integrationskonfiguration setzt sie
deshalb auf **leer**, und eine leere Variable heißt in `env.ts` „nicht
eingerichtet" statt „ungültig". Das ist auch für den Betrieb richtig — `SMTP_URL=`
ist die übliche Art, etwas abzuschalten, und brachte die Anwendung bis dahin zum
Absturz statt zum Schweigen.

**NFA-COMP-05 wurde verengt, nicht gestrichen.** Es gibt genau eine ausgehende
Verbindung, sie führt zu einem Server, den der Betreiber selbst benennt
(`SMTP_URL`), und ohne diese Konfiguration verhält sich die Anwendung exakt wie
vor M14. „Nicht eingerichtet" ist deshalb ein **Rückgabewert**
(`{ ok: false, reason: 'not-configured' }`), keine Ausnahme: Ein Aufrufer, der
nichts konfiguriert, muss nichts wissen und nichts abfangen.

Die Oberfläche unterscheidet die drei Ausgänge (`Delivery`), weil sie sich
unterscheiden: `sent`, `not-configured` — der Link steht da, reichen Sie ihn
weiter — und `failed`, es gibt einen Mailserver und er hat abgelehnt. Wer einen
Link von Hand weitergeben muss, soll wissen, ob er es muss.

**Nur Text, kein HTML.** Eine HTML-Mail lädt Bilder nach, und genau das tut diese
Anwendung nirgends (NFA-COMP-06); ein Link bleibt im Text sichtbar, was er ist.
Der Wortlaut steht in `src/domain/notifications/mail-texts.ts` und **nicht** in
`de.ts` — die Anwendungsschicht kennt keine Oberfläche, und eine Mail ist die
Ausgabe eines Anwendungsfalls, nicht die Beschriftung eines Knopfes. Das Vorbild
ist `domain/legal/privacy-notice.ts` aus M13.

Jede Nachricht sagt, **was bei Nichtstun geschieht**. Wer eine unerwartete Mail
bekommt, soll nicht raten müssen — und eine Nachricht, die zum Klicken drängt,
ist von der Fälschung nicht zu unterscheiden, vor der dieselben Empfänger
gewarnt werden.

**Zehn Sekunden für Verbindung, Begrüßung und Übergabe.** Ein hängender
Mailserver darf keine Server Action festhalten: Wer ein Mitglied einlädt, hat es
eingeladen; die Zustellung ist die Zugabe.

**„Passwort vergessen" ist Selbstbedienung** (FA-MEMB-09). Bis M14 konnte den
Nachweis nur ein Konto mit `organization.administer` ausstellen — wer sein
Passwort vergaß, musste jemanden anrufen. Die Antwort ist in allen Fällen
dieselbe: unbekannte Adresse, gesperrtes Konto, stillgelegtes Unternehmen,
Erfolg. Alles andere wäre eine Auskunft darüber, wer hier ein Konto hat.

Der Vorgang steht in `src/application/members/redeem.ts` und ist damit die
**vierte** Stelle ohne Mandantenkontext, aus demselben Grund wie die drei
anderen: Wer eine Adresse eingibt, ist noch niemand, und die Organisation ist
das *Ergebnis* der Abfrage.

**Die Bremse rechnet über `expiresAt`, nicht über `createdAt`** — fünf Minuten
Abstand, ohne neue Tabelle. Der erste Anlauf verglich den Zeitpunkt des
Aufrufers mit dem, den die **Datenbank** beim Einfügen setzt. In der Anwendung
fällt das nie auf, weil beide Uhren dieselbe sind; im Test mit festem Zeitpunkt
lagen Monate dazwischen, und die Bremse griff für immer. `expiresAt` setzen wir
selbst aus demselben `now` — damit ist die Regel rein, ohne Datenbank prüfbar
und liegt in `domain/auth/password-reset-policy.ts`.

**Kein automatisches Anmelden über einen Maillink.** Die Regel aus M8 bleibt: Ein
Link, der eine Sitzung eröffnet, wäre ein Passwortersatz in einem Postfach.

## Die eigene Sicherheit eines Betreiberkontos (seit M14.1)

`/admin/security` ist das Gegenstück zu `/settings/security`, **aber nicht
dessen Kopie**. Drei Abschnitte der Mandantenseite fehlen, und alle drei aus
demselben Grund: Für Betreiberkonten ist der zweite Faktor verpflichtend
(FA-ADM-08). Es gibt deshalb kein Abschalten, keine Wiederherstellungscodes und
keine vertrauten Geräte. Der Abschnitt „Zweiter Faktor" steht trotzdem da — er
sagt, warum es ihn nicht gibt und was bei Verlust hilft. Eine Leerstelle
beantwortet die Frage nicht.

**Warum es bis dahin gar keinen Passwortwechsel gab.** Ein Betreiberkonto
entsteht über einen Einrichtungslink, und derselbe Weg diente der
Wiederherstellung. Wer sein Passwort wechseln wollte, ließ sich zurücksetzen —
und bekam dabei jedes Mal auch einen neuen zweiten Faktor. Das ist kein Vorgang,
das ist ein Umweg. Nebenbei: Auch **Mandanten** können ihr Passwort bis heute
nicht ändern, nur über „Passwort vergessen" neu setzen.

**Das bisherige Passwort wird verlangt**, obwohl die Sitzung schon steht. Sie
ist der einzige Nachweis, den ein Angreifer an dieser Stelle mitbringt; ohne die
Prüfung genügte ein übernommener Bildschirm für die Übernahme des Kontos.

**Alle anderen Sitzungen enden, die aufrufende nicht.** Wer sein Passwort
wechselt, tut das oft, weil er einen fremden Zugriff vermutet — bliebe der
bestehen, hätte der Wechsel nichts bewirkt. Die eigene mitzubeenden wäre die
reinere Regel und bestrafte jeden Wechsel mit einer Neuanmeldung. Bei der
Zurücksetzung durch einen **anderen** Betreiber enden dagegen alle: Dort weiß
niemand, welche die richtige ist.

**Gefiltert wird in der Abfrage, nicht in der Kennung.**
`deleteMany({ where: { id, adminUserId } })` statt `delete({ where: { id } })` —
sonst beendete eine untergeschobene fremde Kennung die Sitzung eines anderen
Betreibers. Der Rückgabewert `count` sagt zugleich, ob es die eigene war.
Derselbe Angriff steht als Test.

**Es gibt weiterhin kein „Passwort vergessen" für die Verwaltung** (FA-ADM-20),
und das ist der Unterschied zu M14: Beim Mandanten setzt ein
Zurücksetzungsnachweis **nur** das Passwort, der zweite Faktor bleibt stehen.
Beim Betreiber muss er **beides** neu setzen, weil es keine
Wiederherstellungscodes gibt. Ein Link im Postfach wäre damit ein vollständiger
Ersatz für Passwort und Authenticator — die verpflichtende
Zweifaktorauthentifizierung wäre ein Satz im Katalog und sonst nichts.

`ADMIN_PASSWORD_CHANGED` ist eine eigene Protokollaktion neben `ADMIN_RESET`:
Das eine ist eine Handlung **des** Kontos, das andere ein Eingriff **an** ihm.
Wer das Protokoll liest, muss den Unterschied sehen.

Der Betriebszustand fehlt auf dieser Seite, obwohl er auf der Mandantenseite
steht: Er hat unter `/admin/operations` längst einen Platz, und zweimal
dieselbe Auskunft sind zwei Stellen, die auseinanderlaufen.

## Mahnwesen (seit M15)

**Es stand unter `[V2]`, und das wurde entschieden, nicht übergangen.** Spec §13
führt Mahnwesen unter „Explizit nicht in Scope (V1), aber vorbereitet" — in
derselben Tabelle wie Mehrbenutzer (gebaut in M8) und E-Mail-Versand (gebaut in
M14). Der Auftraggeber hat es in den Umfang genommen; die Papiere halten das
fest, statt die Regel stillschweigend zu dehnen.

**Eine Mahnung ist kein umsatzsteuerlicher Beleg.** Sie fordert eine bestehende
Forderung ein und begründet keine neue: kein Steuerausweis, kein Umsatz, keine
Zahlung darauf. Bezahlt wird die **Rechnung**; die Mahnung nennt nur, was von
ihr offen ist.

**Deshalb eine eigene Tabelle und nicht `documentType: 'REMINDER'`.** Die Spec
schlägt das Erweitern der Aufzählung vor — das gilt für Angebot und
Auftragsbestätigung, die Positionen und Steuer tragen. Eine Mahnung tut beides
nicht. Läge sie in `Invoice`, bekäme **jede** dortige Regel einen neuen Fall:
Umsatz, Zahlungen, Storno, Status, Dashboard, Export, Sammelaktionen. Genau
diese Blindheit nach Belegart hat M12 an vier Stellen aufgedeckt. Eine eigene
Tabelle ändert nichts Bestehendes.

**Der Nummernkreis ist getrennt** (`REMINDER_SEQUENCE_PREFIX`). Der Kreis der
Rechnungen muss lückenlos sein (FA-NUM-05); zählte eine Mahnung darin mit,
entstünde eine Lücke, die niemand erklären kann. Ein Test schreibt deshalb nach
einer Mahnung den nächsten Beleg fest und prüft dessen Nummer.

**Drei Stufen, gezählt ab der höchsten bisherigen — nicht ab ihrer Anzahl.**
Zwei Mahnungen derselben Stufe, etwa nach einem verlorenen Brief, dürfen die
nächste nicht überspringen lassen.

**Gebühr ja, Verzugszinsen nein.** Die Gebühr steht je Stufe in Cent an den
Firmendaten. Zinsen nach §288 BGB bräuchten den Basiszinssatz der Bundesbank —
eine Zahl, die sich halbjährlich ändert und im System veralten würde, während
die Anwendung damit rechnet. Dieselbe Überlegung wie bei den Fristen der
Datenschutzhinweise, nur andersherum: Was wir nicht aus eigener Kenntnis
ableiten können, behaupten wir nicht.

**Die Beträge sind eingefroren.** Was auf der Mahnung steht, galt am Tag ihrer
Ausstellung; `Reminder_no_update` weist jede Änderung ab. Zahlt der Kunde danach
eine Teilsumme, ändert das den verschickten Brief nicht — ein Dokument, das sich
nachträglich ändert, ist keines. Gelöscht wird ebenfalls nicht: Die Stufe der
nächsten Mahnung hängt an ihr.

**Das PDF geht dieselbe Kette wie ein Beleg** — dieselbe Schrift, dasselbe
Briefpapier, derselbe Seitenstempel, dieselbe Ablage mit SHA-256. Absender und
Empfänger kommen aus `buildInvoiceDocument()` und nicht aus einer zweiten
Abbildung der Firmendaten: Damit gilt für die Mahnung, was für den Beleg gilt —
Snapshot statt Gegenwart, freier Anschriftenblock, Logo. Eine eigene Umsetzung
wäre die zweite Wahrheit, die beim ersten Sonderfall abweicht.

**Die Vorlage gehört ausnahmsweise nicht dem Unternehmen.** Sie liegt als Modul
neben der Standardvorlage und teilt deren CSS; bearbeitbar ist sie nicht. Eine
Mahnung ist ein kurzer Brief mit festem Inhalt, und was daran
unternehmensspezifisch ist — Logo, Anschrift, Bankverbindung, Briefpapier —
kommt ohnehin aus den Firmendaten. Sollte sich das ändern, bekommt `Template`
eine Spalte `kind`; heute wäre sie eine Einstellung ohne Frage dahinter.

**`ReminderTemplateEngine` ist ein eigener Vertrag**, keine Verallgemeinerung
von `TemplateEngine`. Dessen Signatur nennt `InvoiceDocument` ausdrücklich —
darin liegt die Aussage, welche Variablen eine Belegvorlage vorfindet. Auf ein
beliebiges Objekt geöffnet, sagte sie nichts mehr.

**Mahnen ist ein eigenes Recht** (`invoice.remind`). Die Migration trägt es
**nur** bei Rollen mit `organization.administer` nach — der Rolle „Inhaber", die
als „alle Berechtigungen" definiert ist. Eingeschränkte Rollen bekommen nichts:
Wer eine Rolle beschnitten hat, hat das bewusst getan, und eine still ergänzte
Fähigkeit wäre eine Rechteerweiterung, die niemand angeordnet hat.

## Das Handbuch (seit M16)

**Kein Doku-Framework, und der Grund ist nicht Geschmack.** Docusaurus, Nextra
oder VitePress hätten vier Zusagen gebrochen: ein eigenes Theme neben dem
Tokensatz (FA-UI-01), WebAssembly für die Volltextsuche und damit
`'wasm-unsafe-eval'` in der Richtlinie — genau das, was für pdf.js vermieden
wurde —, einen zweiten Build außerhalb von `src/routes.ts` (NFA-SEC-01) und
nach pdfjs-dist eine zweite große Abhängigkeit im Browser. Die Anforderungen
— mit der Software ausgeliefert, durchsuchbar, von der Anmeldeseite erreichbar
— gehen ohne das.

**Der Inhalt ist MDX, die Gestaltung nicht.** Zwölf Dateien in
`src/content/hilfe/`; in keiner steht eine Klasse oder ein Farbwert. Gesetzt
wird ausschließlich in `src/mdx-components.tsx`, mit Tokens — deshalb folgt das
Handbuch dem dunklen Schema, ohne davon zu wissen, und die Wächter aus
`design-tokens.test.ts` brauchen keine Ausnahme.

**`pageExtensions` bleibt unangetastet.** Die Anleitung schlägt vor, `mdx` in
die Seitenerweiterungen aufzunehmen; dann würde jede MDX-Datei selbst zur Route.
Hier werden sie **importiert**. So bleibt `src/routes.ts` das alleinige
Routenverzeichnis, gegen das der Zugriffsschutztest das Dateisystem abgleicht.

**Jede Zahl ist ein Verweis.** Passwortlänge, Sperrdauer, Sitzungsdauer,
Einladungsfrist, Mahnstufen — alles kommt aus den Konstanten und wird in der
MDX-Datei eingesetzt. Ein Test prüft **beide** Richtungen: dass die Konstante
importiert wird und dass ihr ausformulierter Wert nirgends als Text steht. Die
zweite Richtung ist die wirksame — ein `{formatRetention(…)}` an einer Stelle
hilft nichts, wenn anderswo „7 Tage" ausgeschrieben stehen bleibt. Bauart wie
`privacy-notice.ts` aus M13.

**Die Suche läuft auf dem Server.** MDX wird zu Komponenten übersetzt; der Text
liegt danach nicht mehr als Zeichenkette vor. `scripts/build-docs-index.ts`
erzeugt deshalb aus den Quellen einen Index, der **eingecheckt** wird — der
Containerbau soll nichts herstellen müssen. Dass er zu den Quellen passt, hält
`tests/architecture/docs-index.test.ts` fest, indem er ihn neu erzeugt und
vergleicht. Ohne diesen Wächter wäre die Suche nach der zweiten Änderung stumm
veraltet: Sie fände noch, was gestern dastand.

Gesucht wird über ein `GET`-Formular; die Seite liest `?suche=` und setzt die
Treffer. Kein Suchindex im Browser, kein zusätzliches Bündel, keine Änderung an
der Richtlinie — und es funktioniert ohne JavaScript.

**Ein eingesetzter Wert wird im Index zur Auslassungsmarke.** „Ein Passwort ist
mindestens … Zeichen lang" liest sich als Auslassung; ohne die Marke stünde dort
„mindestens Zeichen lang", und das läse sich in einem Suchtreffer wie ein Fehler
im Programm. Die Werte beim Erzeugen auszuwerten hieße, den Index gegen die
laufende Anwendung zu bauen — dafür ist der Gewinn zu klein.

**Der Text steht nicht in `de.ts`**, sondern in den MDX-Dateien. Das ist die
dritte benannte Ausnahme dieser Art, nach `mail-texts.ts` (M14) und
`privacy-notice.ts` (M13), und aus demselben Grund: Ein Handbuch ist ein
Dokument, keine Beschriftung. In `de.ts` stehen die Knöpfe und Zeilen darum
herum.

**`src/mdx-components.tsx` liegt in `src/`, nicht im Wurzelverzeichnis.** Next
findet sie an beiden Orten. Im Wurzelverzeichnis fiel sie aus
`files: ['src/**/*.{ts,tsx}', …]` der ESLint-Konfiguration heraus, und
`npm run lint` brach mit einem Ladefehler ab statt mit einer Meldung — ein
Abbruch, den ein Grep nach „error" nicht sieht.

### Die Neuerungen (M16.2)

**Von Hand geschrieben, nicht aus dem Verlauf abgeleitet.** Die
Commit-Nachrichten dieses Projekts sind ausführlich und gut — aber sie richten
sich an Entwickler („Der Autorisierungswächter verlangte das neue Skript in
beiden Erlaubnislisten“) und beantworten nicht, was sich für jemanden ändert,
der Rechnungen schreibt. Ein erzeugtes Änderungsprotokoll wäre vollständig und
unlesbar.

**Am Ende der Gliederung, nicht am Anfang.** Wer das Handbuch zum ersten Mal
öffnet, will wissen, wie man sich anmeldet. Für alle anderen steht auf der
Übersicht ein Verweis darauf — „Was ist neu?“ ist die Frage, mit der jemand nach
einer Aktualisierung herkommt, und sie soll nicht erst unten in einer Liste von
dreizehn Themen beantwortet werden.

**Die Reihenfolge steht im Architekturtest**, nicht in einem Unit-Test: Die
schnelle Suite kennt den MDX-Lader nicht, ein `import` von `@/content/hilfe`
scheitert dort beim Übersetzen der ersten Überschrift. Gelesen wird deshalb der
Quelltext des Verzeichnisses — für eine Reihenfolge genügt Text.

### Gliederung, Diagramme, Bildschirmfotos (M16.1)

**Kein `layout.tsx` für die Seitenleiste.** Ein Layout bekommt den aufgerufenen
Pfad nicht; um den aktiven Eintrag zu markieren, bräuchte die Gliederung
`usePathname()` und damit eine Client-Komponente. Stattdessen reicht jede Seite
ihre Kennung an `HelpShell` — zwei Aufrufstellen, dafür kein JavaScript für
etwas, das der Server längst weiß.

Ausgezeichnet wird über **`aria-current="page"`**, und gesetzt wird über genau
dieses Attribut (`aria-[current=page]:…`) statt über eine zusätzlich vergebene
Klasse: Die optische Auszeichnung ist dieselbe Aussage wie die für
Screenreader, und zwei Quellen für dieselbe Aussage laufen auseinander.

**Die Diagramme sind Inline-SVG mit `currentColor`** — dieselbe Bauart wie die
Marke seit M9, aus demselben Grund: Eine Bilddatei bliebe nachts in ihrem
Grauton stehen. Sie zeigen **Zusammenhänge, keine Bildschirme**; ein umbenannter
Knopf macht eine Zustandsfolge nicht falsch.

Sie liegen in `src/content/hilfe/diagrams.tsx`, nicht in `src/ui/`: Ihre
Beschriftungen sind deutscher Fließtext wie in den MDX-Dateien nebenan.
`design-tokens.test.ts` prüft **`src/content` seither mit** — ein Verzeichnis
mit Bauteilen, das kein Wächter ansieht, wäre die Stelle, an der die erste
Literalfarbe steht.

**Bildschirmfotos werden aufgenommen, nicht abgelegt** (`npm run docs:shots`).
Ein von Hand geschossener Screenshot ist ein Bild, das niemand nachstellen kann;
nach der zweiten Änderung erneuert ihn niemand mehr. Das Skript fährt die
**gebaute** Anwendung auf einer eigenen, wegwerfbaren Datenbank mit den
Beispieldaten aus `scripts/seed.ts` hoch, meldet sich an und nimmt auf.

Drei Entscheidungen darin, alle mit Anlass:

- **`NODE_ENV=development` für den Seed-Lauf**, `production` für den Server.
  `scripts/seed.ts` weigert sich gegen eine Produktionsdatenbank, und das zu
  Recht — der erste Anlauf lief genau dort hinein.
- **Ein neutraler Betrieb.** Der Seed legt „Musterbetrieb Tim Hirsch" an; in
  einer mitgelieferten Dokumentation hat der Name des Entwicklers nichts zu
  suchen. Überschrieben wird nach dem Seed, vor der Aufnahme.
- **`<img>` statt `next/image`.** Der Optimierer verlangt in der Produktion
  `sharp` — eine nativ übersetzte Abhängigkeit im Container für fünf verzögert
  geladene Bilder. Die Regel ist an genau einer Stelle mit Begründung
  abgeschaltet.

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
| M6 | Dashboard: `getDashboardMetrics()`, Kacheln, Chart, Listen | umgesetzt |
| M6.1 | Ausführung: Satzmaß, Seitenköpfe, einheitliche Listen | umgesetzt |
| M6.2 | Anmeldung in zwei Schritten, zweiter Faktor nur wo nötig | umgesetzt |
| M7 | Betrieb: Backup, Restore, Healthcheck, Logging, E2E | umgesetzt |
| M8 | Mandanten, Rollen, Mitglieder, zentrale Verwaltung | umgesetzt |
| M9 | Passkeys, vertraute Geräte, Wege aus einer Sackgasse | umgesetzt |
| M10 | Handlungsfähigkeit der Verwaltung: Betreiberkonten, Protokoll, Anonymisieren | umgesetzt |
| M11 | Der Beleg: keine Steuer bei §19, Blattfuß, Logo, Entwurf bearbeiten | umgesetzt |
| M12 | Briefpapier je Unternehmen, PDF beim Festschreiben, klare Rückmeldung | umgesetzt |
| M13 | Impressum und Datenschutzhinweise, gepflegt vom Betreiber | umgesetzt |
| M14 | Zustellung: E-Mail als zusätzlicher Weg, „Passwort vergessen" | umgesetzt |
| M14.1 | Eigene Sicherheit eines Betreiberkontos: Passwort, Geräte, Passkeys | umgesetzt |
| M15 | Mahnwesen: drei Stufen, Gebühr je Stufe, eigenes PDF | umgesetzt |
| M16 | Handbuch: MDX-Inhalt, serverseitige Suche, öffentlich | umgesetzt |
| M16.1 | Handbuch: Gliederung, Diagramme, erzeugte Bildschirmfotos | umgesetzt |
| M16.2 | Handbuch: Abschnitt „Neuerungen“ | umgesetzt |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
