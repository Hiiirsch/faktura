# Faktura

Selbst gehostete Rechnungsstellung für ein Einzelunternehmen. Single-Tenant,
ohne Cloud-Anbindung, ohne ausgehende Netzwerkverbindungen im Betrieb.

Verbindliche Grundlagen:

- [`rechnungs-app-spec.md`](rechnungs-app-spec.md) — Architektur, Datenmodell, technische Entscheidungen
- [`rechnungs-app-anforderungen.md`](rechnungs-app-anforderungen.md) — prüfbarer Anforderungskatalog
- [`CLAUDE.md`](CLAUDE.md) — technische Leitplanken
- [`FORTSCHRITT.md`](FORTSCHRITT.md) — Stand je Anforderung

**Aktueller Stand: M0 (Fundament).** Es gibt noch keine fachlichen Funktionen.
Die Anwendung startet, migriert ihre Datenbank und zeigt eine Statusseite.
Authentifizierung folgt mit M1 — bis dahin darf die Anwendung nicht öffentlich
erreichbar betrieben werden.

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
npm run test         # Vitest
npm run test:coverage
npm run verify       # alles zusammen, inklusive npm audit
```

`npm run verify` ist das, was auch die CI ausführt. Ein Verstoß gegen die
Schichtentrennung, ein `any` in der Domain-Schicht oder ein Roh-SQL-Aufruf
lässt den Lauf scheitern.

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
src/app/            Next.js App Router — Routen und Layouts
src/ui/             React-Komponenten und Formatierung
src/i18n/           sämtliche deutschen Texte
src/application/    Use Cases
src/domain/         reine Fachlogik, ohne Fremdimporte
src/infrastructure/ Prisma, Konfiguration
src/routes.ts       zentrales Routenverzeichnis
tests/architecture/ Tests, die die Architekturregeln nachweisen
tests/unit/         Unit-Tests
prisma/             Schema und Migrationen
```

Die Domain-Schicht importiert nichts aus Framework-, UI- oder
Persistenzmodulen. Das ist keine Konvention, sondern eine Lint-Regel, deren
Wirksamkeit `tests/architecture/layering.test.ts` nachweist.
