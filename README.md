# Faktura

Selbst gehostete Rechnungsstellung für ein Einzelunternehmen. Single-Tenant,
ohne Cloud-Anbindung, ohne ausgehende Netzwerkverbindungen im Betrieb.

Verbindliche Grundlagen:

- [`rechnungs-app-spec.md`](rechnungs-app-spec.md) — Architektur, Datenmodell, technische Entscheidungen
- [`rechnungs-app-anforderungen.md`](rechnungs-app-anforderungen.md) — prüfbarer Anforderungskatalog
- [`CLAUDE.md`](CLAUDE.md) — technische Leitplanken
- [`FORTSCHRITT.md`](FORTSCHRITT.md) — Stand je Anforderung

**Aktueller Stand: M3 (Domain-Kern).** Berechnung, Steueraufstellung,
Nummernkreis und Statusmodell stehen und sind vollständig getestet. Erfasst
werden Firmendaten samt Logo und Bankverbindung, Kunden mit automatischer
Nummernvergabe und ein Leistungskatalog. Der Rechnungseditor, Vorlagen und die
Auswertung folgen mit den nächsten Ausbaustufen.

Die Anwendung ist vollständig zugriffsgeschützt: Anmeldung mit Passwort und
optionaler Zweifaktorauthentifizierung, Sitzungsverwaltung, Sicherheits-Header,
CSRF-Schutz und Sperre nach Fehlversuchen.

Die Formulare der Stammdaten setzen JavaScript voraus — sie erhalten dafür bei
einem Validierungsfehler die Eingaben. Die Anmeldung funktioniert auch ohne.

## Voraussetzungen

- Node.js 24.13.0 (siehe `.nvmrc`)
- Docker mit Compose v2

## Installation

```bash
git clone <repository> faktura
cd faktura
npm ci
cp .env.example .env
```

`.env` anpassen — insbesondere `APP_URL` und `CADDY_SITE_ADDRESS`. Für die
lokale Entwicklung muss `DATABASE_URL` auf `file:../data/faktura.db` stehen
(relativ zum Verzeichnis `prisma/`), im Container auf den absoluten Pfad
`file:/app/data/faktura.db`.

## Konfiguration

Die gesamte Konfiguration erfolgt über Umgebungsvariablen; `.env.example`
beschreibt jede einzelne. Geheimnisse liegen nie im Repository und nie im
Container-Image. Fehlt eine Variable oder ist sie unplausibel, bricht die
Anwendung beim Start mit einer benannten Meldung ab, statt im Betrieb
aufzufallen.

## Entwicklung

```bash
npm run db:deploy   # Migrationen anwenden
npm run dev         # Entwicklungsserver auf http://localhost:3000
```

Prüfungen:

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint, auch die Schichtenregeln
npm run test         # Vitest, schnelle Suite
npm run test:coverage
npm run verify       # alles zusammen, inklusive npm audit
```

`npm run verify` ist das, was auch die CI ausführt. Ein Verstoß gegen die
Schichtentrennung, ein `any` in der Domain-Schicht oder ein Roh-SQL-Aufruf
lässt den Lauf scheitern.

Zusätzlich gibt es eine Integrationssuite, die den Zugriffsschutz gegen einen
echt laufenden Server prüft (NFA-SEC-01). Sie setzt einen Produktionsbuild
voraus:

```bash
npm run build
npm run test:integration
```

Sie startet die gebaute Anwendung auf Port 3987 gegen eine eigene
Datenbankdatei, läuft jede Route ohne Sitzung durch, prüft Cookie-Attribute,
Sicherheits-Header, CSRF-Schutz und die Sperre nach zehn Fehlversuchen.

## Betrieb

```bash
docker compose up -d --build
```

Startet zwei Dienste:

| Dienst  | Aufgabe                                                        |
|---------|----------------------------------------------------------------|
| `app`   | Anwendung inklusive Datenbankmigration beim Start               |
| `caddy` | Reverse Proxy, terminiert TLS, einziger nach außen offener Dienst |

Der Anwendungsdienst veröffentlicht bewusst keinen Port auf dem Host. Er ist
ausschließlich über den Proxy erreichbar; TLS besorgt Caddy selbsttätig, sobald
`CADDY_SITE_ADDRESS` einen echten Domainnamen enthält.

Migrationen laufen bei jedem Start (`prisma migrate deploy`). Schlagen sie
fehl, startet der Server nicht — ein Betrieb gegen ein unbekanntes Schema wäre
gefährlicher als ein ausbleibender Start.

### Daten

| Pfad       | Inhalt                                        |
|------------|-----------------------------------------------|
| `data/`    | SQLite-Datenbank                              |
| `storage/` | Uploads und erzeugte PDFs (ab M5)             |

Beide Verzeichnisse sind Bind-Mounts und gehören in die Sicherung.

### Erstes Benutzerkonto anlegen

Es gibt **keine Selbstregistrierung**. Das erste Konto entsteht ausschließlich
auf dem Server:

```bash
docker compose exec app node dist/create-user.mjs --email buchhaltung@example.org
```

Das Passwort wird verdeckt abgefragt — als Argument stünde es in der
Shell-Historie und in der Prozessliste. Es muss mindestens zwölf Zeichen haben
und darf nicht in der mitgelieferten Liste der 100.000 häufigsten geleakten
Passwörter stehen; die Prüfung läuft vollständig lokal, ohne Netzwerkabfrage.

Im lokalen Entwicklungsbetrieb stattdessen:

```bash
npm run user:create -- --email buchhaltung@example.org
```

### Zweifaktorauthentifizierung

Nach der ersten Anmeldung unter **Sicherheit** aktivierbar. Beim Einrichten
erscheinen zehn Wiederherstellungscodes — sie werden **nur einmal** angezeigt
und ersetzen später das Einmalkennwort, falls das Telefon nicht verfügbar ist.
In der Datenbank liegt nur ihr Hash.

Das Anmeldeformular nimmt im Feld „Bestätigungscode" wahlweise ein
sechsstelliges Einmalkennwort oder einen Wiederherstellungscode entgegen.

Nach zehn Fehlversuchen sperrt sich der Zugang für 15 Minuten. Alle
Anmeldeereignisse landen im Audit-Log.

### Zustand prüfen

```bash
curl http://localhost/api/health     # {"status":"ok"}
docker compose ps                    # Container und Healthcheck
docker compose logs -f app
```

Der Healthcheck ist bewusst ohne Anmeldung erreichbar — Docker und Caddy können
sich nicht authentifizieren. Er antwortet ausschließlich mit betriebsbereit
ja/nein, ohne Versionsangaben, Pfade oder Fehlertexte.

## Sicherung und Wiederherstellung

Noch nicht umgesetzt — Backup-Job, Wiederherstellungsprozedur und der Nachweis
einer erfolgreichen Wiederherstellung sind Gegenstand von M7 (NFA-BETR-03 bis
-07). Bis dahin gilt: Ein ungetestetes Backup ist keins.

Bis M7 vorläufig von Hand, bei gestoppter Anwendung:

```bash
docker compose down
tar czf faktura-$(date +%F).tar.gz data storage
docker compose up -d
```

## Aktualisierung

```bash
git pull
docker compose up -d --build
```

Migrationen werden beim Start des neuen Containers angewandt. Vor einem Update
eine Sicherung anlegen.

## Projektstruktur

```
src/app/            Next.js App Router — Routen, Seiten, Server Actions
src/ui/             React-Komponenten und Formatierung
src/i18n/           sämtliche deutschen Texte
src/application/    Use Cases
src/domain/         reine Fachlogik, ohne Fremdimporte
src/infrastructure/ Prisma, Konfiguration, Kryptografie, Sicherheit
src/proxy.ts        Sicherheits-Header, CSRF-Token, grober Zugriffsschutz
src/routes.ts       zentrales Routenverzeichnis
scripts/            Betriebskommandos (Erstbenutzer, Container-Start)
resources/          mitgelieferte Daten (Liste kompromittierter Passwörter)
tests/architecture/ Tests, die die Architekturregeln nachweisen
tests/unit/         Unit-Tests
tests/integration/  Tests gegen die gebaute Anwendung
prisma/             Schema und Migrationen
```

Die Domain-Schicht importiert nichts aus Framework-, UI- oder
Persistenzmodulen. Das ist keine Konvention, sondern eine Lint-Regel, deren
Wirksamkeit `tests/architecture/layering.test.ts` nachweist.

Jede Route ist in `src/routes.ts` eingetragen. Ein Pfad, der dort fehlt, gilt
als geschützt — Vergessen führt zur Weiterleitung auf die Anmeldung, nicht zu
einer offenen Route. `tests/architecture/routes.test.ts` gleicht das
Verzeichnis gegen das Dateisystem ab.

## Sicherheitsarchitektur

| Baustein | Umsetzung |
|---|---|
| Passwörter | Argon2id, 64 MB Speicher, 3 Iterationen |
| Sitzungen | 256-Bit-Token, in der Datenbank nur der SHA-256-Hash, 7 Tage gültig |
| Cookies | `HttpOnly`, `SameSite=Lax`, `Secure` bei HTTPS, neues Token je Anmeldung |
| Zweiter Faktor | TOTP (RFC 6238) plus einmalig nutzbare Wiederherstellungscodes |
| Sperre | 15 Minuten nach 10 Fehlversuchen, protokolliert |
| CSRF | Herkunftsprüfung **und** Double-Submit-Token in jeder schreibenden Aktion |
| Header | CSP mit Nonce, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` |
| Zugriffsschutz | `requireSession()` als erste Anweisung jeder Seite und Aktion, zusätzlich `src/proxy.ts` |

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

Zwei Rundungsregeln entscheiden über Centdifferenzen: Je Position wird **einmal**
gerundet, und die Steuer wird **je Steuergruppe** gerundet, nicht je Position.
Drei Positionen zu 3,33 € ergeben so 1,90 € Steuer statt 1,89 €. Gerundet wird
symmetrisch zur Null, damit eine Gutschrift die Rechnung exakt neutralisiert.

Zur Content Security Policy: `script-src` kommt ohne `unsafe-inline` aus,
Skripte laufen ausschließlich mit dem pro Anfrage erzeugten Nonce. Für
`style-src` ist `unsafe-inline` gesetzt — React und die ab M2 vorgesehenen
Komponenten setzen Positionierung über `style`-Attribute am Element, auf die
ein Nonce nicht anwendbar ist. Der Sicherheitsgewinn einer strikten `style-src`
wäre gering, der Funktionsverlust vollständig.
