# Entwicklung

Diese Datei richtet sich an Entwickler: Wie man die Anwendung lokal zum Laufen
bringt, welche Prüfungen es gibt und wie eine Fassung veröffentlicht wird.

Sie ist eine von vier Beschreibungen, und die Trennung folgt der Leserschaft:

| Datei | Für wen | Beantwortet |
|---|---|---|
| [`README.md`](README.md) | Betreiber | Installation, Betrieb, Sicherung, Wiederherstellung |
| **`DEVELOPER.md`** | Entwickler | Arbeitsumgebung, Prüfungen, Veröffentlichen |
| [`CLAUDE.md`](CLAUDE.md) | Entwickler | **Warum** etwas so gebaut ist — die Begründungen |
| `/hilfe` (im Programm) | Anwender | Rechnungen schreiben, festschreiben, mahnen |

Verbindlich sind daneben [`rechnungs-app-spec.md`](rechnungs-app-spec.md)
(Architektur, Datenmodell), [`rechnungs-app-anforderungen.md`](rechnungs-app-anforderungen.md)
(prüfbarer Anforderungskatalog) und [`faktura-frontend-design.md`](faktura-frontend-design.md)
(Gestaltung). [`FORTSCHRITT.md`](FORTSCHRITT.md) führt den Stand je Anforderung.

## Voraussetzungen

- **Node.js 24.13.0** (siehe `.nvmrc`)
- **Docker** mit Compose v2
- **PostgreSQL 17** — seit M17 gibt es keine Dateidatenbank mehr; auch die
  Tests brauchen einen laufenden Server

## Dienste für die Entwicklung starten

Die Anwendung selbst läuft lokal, ihre Dienste im Container. Der Port **55432**
ist Absicht: So kollidiert er nicht mit einem PostgreSQL, das auf dem Rechner
ohnehin auf 5432 lauscht.

```bash
docker run -d --name faktura-postgres -p 55432:5432 \
  -e POSTGRES_DB=faktura \
  -e POSTGRES_USER=faktura \
  -e POSTGRES_PASSWORD=entwicklung \
  postgres:17.6-alpine
```

Dieselbe Adresse steht als Vorgabe in `vitest.integration.config.ts` und in
`.env.example`; wer sie ändert, setzt `TEST_POSTGRES_URL` und
`TEST_DATA_DATABASE_URL`.

**Optional, nur für die Prüfung des Objektspeichers** (M17). Ohne ihn läuft die
Integrationssuite, prüft aber nur die Dateisystem-Hälfte des `FileStore` und
sagt das:

```bash
docker run -d --name faktura-minio -p 59000:9000 \
  -e MINIO_ROOT_USER=faktura \
  -e MINIO_ROOT_PASSWORD=entwicklung \
  minio/minio server /data

docker run --rm --network host --entrypoint sh minio/mc -c \
  "mc alias set dev http://localhost:59000 faktura entwicklung && \
   mc mb --ignore-existing dev/faktura-test"
```

Der Eimer muss **vor** dem Lauf da sein: Ein Adapter, der schreiben darf, darf
deshalb noch lange nichts einrichten.

## Loslegen

```bash
npm ci
cp .env.example .env      # DATABASE_URL auf localhost:55432 stellen
npm run db:deploy         # Migrationen anwenden
npm run dev               # http://localhost:3000
```

**`APP_URL` muss zu der Adresse passen, unter der Sie die Anwendung aufrufen** —
bei `npm run dev` also `http://localhost:3000`. Sie dient der Herkunftsprüfung
des CSRF-Schutzes; weicht sie ab, wird jede schreibende Aktion abgelehnt, auch
die Anmeldung. Die Anwendung schreibt beim ersten Seitenaufruf einen Hinweis ins
Log, wenn beides auseinanderläuft.

Eine frisch migrierte Datenbank enthält das Unternehmen `org_default`, aber
**kein Konto**. Wie das erste entsteht, steht im README unter
[Erste Anmeldung](README.md#erste-anmeldung); für die Entwicklung ist der kurze
Weg:

```bash
npm run user:create -- --email entwicklung@example.org \
  --organization org_default --role role_owner_org_default
```

## Testdaten

Kunden, ein Leistungskatalog und Rechnungen über drei Jahre in allen
Statuswerten — Entwurf, offen, teilbezahlt, bezahlt, storniert:

```bash
npm run seed
```

**Nie gegen eine Produktionsdatenbank**; das Kommando bricht bei
`NODE_ENV=production` ab.

## Prüfungen

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint, auch die Schichtenregeln
npm run test         # Vitest, schnelle Suite — ohne Datenbank
npm run test:watch
npm run test:coverage
npm run verify       # alles zusammen, inklusive npm audit
```

`npm run verify` ist das, was auch die CI ausführt. Ein Verstoß gegen die
Schichtentrennung, ein `any` in der Domain-Schicht oder ein Roh-SQL-Aufruf lässt
den Lauf scheitern.

### Die Integrationssuite

Sie setzt einen **Produktionsbuild** und die Dienste von oben voraus:

```bash
npm run build
npm run test:integration
```

Sie startet die gebaute Anwendung auf **Port 3987** gegen eine eigene Datenbank
(`faktura_test_data`), die sie vor jedem Test leert. Der Server läuft dabei
unter `localhost` und nicht unter `127.0.0.1` — eine IP-Adresse ist als
WebAuthn-Herkunft unzulässig, und der Browser bricht die Passkey-Zeremonie sonst
wortlos ab.

Geprüft wird darin, was unterhalb von HTTP nicht sichtbar ist: jede Route ohne
Sitzung, Cookie-Attribute, Sicherheits-Header, CSRF-Schutz, die Sperre nach zehn
Fehlversuchen, die Datenbanktrigger, beide Dateispeicher gegen denselben
Vertrag, der Renderdienst und die Sicherung samt Wiederherstellung.

**Ein Testlauf verschickt keine E-Mail.** Die Konfiguration setzt `SMTP_URL` und
`MAIL_FROM` ausdrücklich auf leer — Vitest liest die `.env` mit, und mit echten
Zugangsdaten gingen Einladungen an reservierte Domänen tatsächlich hinaus.

### Was den Build sonst noch anhält

Vier Wächter schlagen an, ohne dass jemand sie im Diff bemerken müsste. Jeder
ist gegen einen absichtlichen Verstoß geprüft — ein Wächter, der nie feuert, ist
keiner:

| Test | Hält fest |
|---|---|
| `tests/architecture/layering.test.ts` | Die Domain-Schicht importiert nichts aus Framework, UI oder Persistenz |
| `tests/architecture/routes.test.ts` | Jede Route steht in `src/routes.ts`; was fehlt, gilt als geschützt |
| `tests/architecture/authorization.test.ts` | Kein Anwendungsfall kommt ohne `Authorized<K>` aus |
| `tests/architecture/design-tokens.test.ts` | Keine Farb- oder Größenliterale außerhalb von `globals.css` |

Dazu Wächter, die Zahlen gegen ihre Quelle halten: die Fristen der
Datenschutzhinweise, die Werte im Handbuch, der Suchindex, die Versionsnummer
und die PostgreSQL-Fassung in Image und CI.

## Projektstruktur

```
src/app/            Next.js App Router — Routen, Seiten, Server Actions
src/ui/             React-Komponenten und Formatierung
src/i18n/           sämtliche deutschen Texte
src/application/    Use Cases
src/domain/         reine Fachlogik, ohne Fremdimporte
src/content/hilfe/  das Handbuch als MDX
src/infrastructure/ Prisma, Konfiguration, Kryptografie, Sicherheit
src/proxy.ts        Sicherheits-Header, CSRF-Token, grober Zugriffsschutz
src/routes.ts       zentrales Routenverzeichnis
scripts/            Betriebskommandos, Renderdienst, Dokumentationsbau
resources/          mitgelieferte Daten (Liste kompromittierter Passwörter)
tests/architecture/ Tests, die die Architekturregeln nachweisen
tests/unit/         Unit-Tests
tests/integration/  Tests gegen die gebaute Anwendung
prisma/             Schema und Migrationen
deployment/         Kubernetes-Manifeste (siehe README)
```

Erlaubte Importrichtungen: `app → application, ui, i18n, domain` ·
`ui → domain, i18n` · `application → domain, infrastructure` ·
`infrastructure → domain`. Das ist keine Konvention, sondern eine Lint-Regel.

## Datenbank und Migrationen

```bash
npm run db:generate   # Prisma-Client aus dem Schema erzeugen
npm run db:migrate    # neue Migration während der Entwicklung
npm run db:deploy     # vorhandene Migrationen anwenden
```

Die Migrationsgeschichte beginnt mit M17 neu: eine Baseline aus dem Schema, die
Zusagen (Trigger, CHECK-Bedingungen, partielle Indizes) in einer zweiten, der
Ausgangsbestand in einer dritten Migration. Die alte SQLite-Folge liegt unter
`prisma/migrations-sqlite/` zur Nachlese und wird nicht mehr angewandt.

**Die 32 Trigger sind nicht Beiwerk, sondern die zweite Ebene der
Unveränderbarkeit.** `tests/integration/database-triggers.test.ts` führt ihre
vollständige Namensliste; wer eine Migration schreibt, die Tabellen umbaut,
prüft dort, ob alle noch da sind.

## Das Handbuch pflegen

Der Inhalt steht als MDX in `src/content/hilfe/`. Nach jeder Änderung:

```bash
npm run docs:index
```

Ohne diesen Lauf schlägt `npm run verify` fehl — ein Test vergleicht den
eingecheckten Index mit den Quellen. Er ist eingecheckt, damit der Containerbau
nichts herstellen muss.

Die Bildschirmfotos entstehen ebenfalls auf Befehl. Sie brauchen einen
Produktionsbuild, fahren die Anwendung auf einer eigenen, wegwerfbaren Datenbank
mit den Beispieldaten hoch und nehmen sie auf:

```bash
npm run build
npm run docs:shots
```

Zahlen im Text sind **Verweise** auf die Konstanten der Anwendung, keine
abgeschriebenen Werte; ein Test hält beide Richtungen fest.

## Rechnen mit Geld

| Größe | Ablage | Beispiel |
|---|---|---|
| Beträge | Ganzzahlige Cent | `1999` = 19,99 € |
| Mengen | Ganzzahl, skaliert mit 10⁴ | `15000` = 1,5 |
| Steuersätze, Rabatte | Basispunkte | `1900` = 19 %, `810` = 8,1 % |
| Kalendertage | `YYYY-MM-DD` | `2026-03-01` |

Es gibt in der Berechnungskette keine Fließkommazahl — auch nicht als
Zwischenwert. Multiplikationen laufen über `bigint`, weil das Produkt aus Menge,
Cent-Betrag und Rabattfaktor den sicher darstellbaren Bereich von `number` schon
bei alltäglichen Größen überschreitet.

Zwei Rundungsregeln entscheiden über Centdifferenzen: Je Position wird
**einmal** gerundet, und die Steuer wird **je Steuergruppe** gerundet, nicht je
Position. Drei Positionen zu 3,33 € ergeben so 1,90 € Steuer statt 1,89 €.
Gerundet wird symmetrisch zur Null, damit eine Gutschrift die Rechnung exakt
neutralisiert.

Kalendertage sind **Zeichenketten**, keine Zeitpunkte: Als `DateTime`
gespeichert kippten Monatsumsatz und Überfälligkeit an der Tagesgrenze.

## Veröffentlichen

Die CI baut das Anwendungsimage und veröffentlicht es in GitHub Packages
(`ghcr.io/<eigentümer>/faktura`), für `linux/amd64` **und** `linux/arm64`.

| Anlass | Marken |
|---|---|
| Push auf `main` | `:main`, `:sha-<kurz>` |
| Git-Tag `v1.2.0` | `:1.2.0`, `:1.2`, `:latest` |
| jeder andere Zweig | **kein** Push — es wird nur gebaut |

**Eine Versionsmarke wird abgewiesen, wenn sie nicht zur Anwendung passt.** Ein
Tag `v1.2.0` verlangt, dass `package.json` und `APP_VERSION` dasselbe sagen —
sonst trüge das Image `:1.2.0` und meldete unter *Verwaltung › Zustand* etwas
anderes.

```bash
# 1. Version an beiden Stellen setzen
#    package.json und src/domain/version.ts
# 2. Neuerungen im Handbuch ergänzen (src/content/hilfe/neuerungen.mdx)
npm run docs:index && npm run verify
# 3. Marke setzen
git tag v1.2.0 && git push origin v1.2.0
```

Der Test `tests/architecture/version.test.ts` bindet beide Stellen an den
jüngsten Eintrag des Handbuchs — eine Version ohne Änderungsprotokoll gibt es
nicht.

## Zur Content Security Policy

`script-src` kommt ohne `unsafe-inline` aus; Skripte laufen ausschließlich mit
dem pro Anfrage erzeugten Nonce. Für `style-src` ist `unsafe-inline` gesetzt —
React setzt Positionierung über `style`-Attribute am Element, auf die ein Nonce
nicht anwendbar ist. Der Sicherheitsgewinn einer strikten `style-src` wäre
gering, der Funktionsverlust vollständig.

`worker-src 'self' blob:` steht ausdrücklich darin: Ohne die Angabe fällt der
Browser auf `script-src` zurück, und der PDF-Betrachter startete wortlos nicht.
