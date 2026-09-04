# Faktura

Selbst gehostete Rechnungsstellung für ein Einzelunternehmen. Single-Tenant,
ohne Cloud-Anbindung, ohne ausgehende Netzwerkverbindungen im Betrieb.

Verbindliche Grundlagen:

- [`rechnungs-app-spec.md`](rechnungs-app-spec.md) — Architektur, Datenmodell, technische Entscheidungen
- [`rechnungs-app-anforderungen.md`](rechnungs-app-anforderungen.md) — prüfbarer Anforderungskatalog
- [`CLAUDE.md`](CLAUDE.md) — technische Leitplanken
- [`FORTSCHRITT.md`](FORTSCHRITT.md) — Stand je Anforderung

**Aktueller Stand: M4 (Rechnungen).** Rechnungen lassen sich anlegen,
bearbeiten, festschreiben, bezahlen und stornieren. Ab dem Festschreiben ist der
Beleg unveränderlich — durchgesetzt von Datenbank-Triggern, nicht nur vom
Anwendungscode. Erfasst werden außerdem Firmendaten samt Logo, Briefpapier und
Bankverbindung, Kunden mit automatischer Nummernvergabe und ein
Leistungskatalog. PDF-Ausgabe, Vorlagen und Auswertung folgen.

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

**`APP_URL` muss der Adresse entsprechen, unter der Sie die Anwendung im
Browser aufrufen.** Sie dient der Herkunftsprüfung des CSRF-Schutzes; weicht
sie ab, wird jede schreibende Aktion abgelehnt — auch die Anmeldung. Über
Docker Compose mit Caddy ist das `http://localhost`, bei `npm run dev`
dagegen `http://localhost:3000`. Die Anwendung schreibt beim ersten
Seitenaufruf einen Hinweis ins Log, wenn beides auseinanderläuft.

## Konfiguration

Die gesamte Konfiguration erfolgt über Umgebungsvariablen; `.env.example`
beschreibt jede einzelne. Optional sind allein `SMTP_URL` und `MAIL_FROM`
(siehe [E-Mail-Versand](#e-mail-versand)); ohne sie läuft die Anwendung
vollständig ohne ausgehende Verbindung. Geheimnisse liegen nie im Repository und nie im
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

### Woraus die Anwendung besteht

Zwei Container, und im ersten laufen vier Bestandteile — davon nur zwei als
eigener Prozess:

| Bestandteil | Was er ist | Wann er startet |
|---|---|---|
| Anwendungsserver | Next.js aus dem Standalone-Bündel (`server.js`) | mit dem Container |
| Prisma-Migrator | kein Dauerprozess: wendet die Migrationen an | im Entrypoint, **vor** dem Server |
| SQLite | kein Prozess, sondern eine Datei im Anwendungsprozess | mit dem Server |
| Chromium | Kindprozess für die PDF-Ausgabe | **bei Bedarf**, beim ersten Festschreiben oder Abruf |

Ein Mailserver gehört nicht dazu: Er ist extern und optional (siehe
[E-Mail-Versand](#e-mail-versand)). Ohne ihn läuft alles unverändert.

Die Startreihenfolge steht vollständig in `scripts/entrypoint.sh`:

```sh
prisma migrate deploy   # Schema aktuell halten
exec node server.js     # Anwendungsserver
```

Das `exec` ist kein Beiwerk: Der Node-Prozess wird dadurch PID 1 und bekommt
die Signale von Docker unmittelbar — ohne das bliebe beim Stoppen eine Shell
dazwischen, die sie verschluckt.

`caddy` wartet auf `app: service_healthy`. Der Healthcheck prüft **zwei**
Bestandteile nebenläufig: die Datenbankverbindung und einen echten
Chromium-Start. Ein Renderer, der wegen zu enger Capabilities nicht hochkommt,
fällt damit beim Start auf und nicht erst beim ersten Beleg.

**Nichts plant sich selbst.** Weder Sicherungen noch Mahnungen laufen von
allein — ein eingebauter Zeitgeber liefe im Container mit, ohne dass jemand ihn
sieht. Die Zeitsteuerung liegt beim Server (cron), die Wiederherstellung
ausschließlich von Hand.

### Daten

| Pfad       | Inhalt                                        |
|------------|-----------------------------------------------|
| `data/`    | SQLite-Datenbank                              |
| `storage/` | Uploads und erzeugte PDFs (ab M5)             |

Beide Verzeichnisse sind Bind-Mounts und gehören in die Sicherung.

### Unternehmen und Konten anlegen

Es gibt **keine Selbstregistrierung**. Der Weg führt über die Verwaltung:

1. Einrichtungslink für das Betreiberkonto ausstellen (einmalig je
   Installation):

   ```bash
   docker compose exec app node dist/create-admin.mjs --email betreiber@example.org
   ```

   Das Kommando fragt **nichts** ab und legt **kein** Konto an. Es gibt einen
   Link aus, der 24 Stunden gilt und genau einmal funktioniert. Ein erneuter
   Aufruf entwertet den vorigen Link.

2. Den Link im Browser öffnen: Name, Passwort und zweiter Faktor werden dort
   gesetzt — der QR-Code kommt aus dem eigenen Prozess, ohne Anfrage nach außen.
   **Erst mit dem Absenden entsteht das Konto**, vollständig, in einer
   Transaktion. Damit gibt es zu keinem Zeitpunkt ein Betreiberkonto ohne
   zweiten Faktor.

   Für Betreiberkonten gibt es **keine Wiederherstellungscodes**. Geht der
   Authenticator verloren, hilft `admin:reset` (siehe unten).

3. Unter `/admin` anmelden und ein Unternehmen anlegen. Dabei entstehen in
   **einem** Vorgang: das Unternehmen, die Rolle „Inhaber" mit allen
   Berechtigungen und eine Einladung. Der Einladungslink erscheint **genau
   einmal** und wird von Hand weitergegeben — die Anwendung versendet keine
   E-Mail.

4. Der Inhaber öffnet den Link und **setzt sein Passwort selbst**. Der Betreiber
   erfährt es zu keinem Zeitpunkt. Weitere Mitglieder lädt das Unternehmen
   danach unter **Einstellungen → Mitglieder** ein.

Ein Passwort muss mindestens zwölf Zeichen haben und darf nicht in der
mitgelieferten Liste der 100.000 häufigsten geleakten Passwörter stehen; die
Prüfung läuft vollständig lokal, ohne Netzwerkabfrage.

#### Betreiberkonto zurücksetzen

Ist der Authenticator eines Betreiberkontos verloren:

```bash
docker compose exec app node dist/reset-admin.mjs --email betreiber@example.org
```

Das Konto wird **sofort gesperrt**, alle seine Sitzungen enden, und es entsteht
ein neuer Einrichtungslink. Beim Einlösen bekommt **dasselbe** Konto ein neues
Passwort und einen neuen zweiten Faktor.

Es wird bewusst nicht gelöscht und neu angelegt: Das Protokoll nennt den
Betreiber über seine Kennung, und die eines gelöschten Kontos zeigt ins Leere.

Der Preis ist benannt: Zwischen Aufruf und Einlösen kommt niemand in die
Verwaltung. Wer das vermeiden will, legt vorher ein zweites Betreiberkonto an.

#### Der Notfallweg

Kommt niemand mehr in ein Unternehmen — kein aktives Konto mit
Rechteverwaltung, keine gültige Einladung —, legt dieses Kommando ein Konto
unmittelbar an:

```bash
npm run user:create -- --email buchhaltung@example.org \
  --organization <kennung> --role <kennung>
```

`--organization` ist Pflicht: Bei mehreren Mandanten wäre ein geratenes
Unternehmen eine stille Zuweisung in ein fremdes. Ohne Argument nennt das
Kommando die vorhandenen Kennungen. Ohne `--role` trägt das Konto nur die
Grundrechte und sieht eine Anwendung ohne Inhalt.

Das Passwort wird verdeckt abgefragt — als Argument stünde es in der
Shell-Historie und in der Prozessliste.

### Zweifaktorauthentifizierung

Nach der ersten Anmeldung unter **Sicherheit** aktivierbar. Beim Einrichten
erscheinen zehn Wiederherstellungscodes — sie werden **nur einmal** angezeigt
und ersetzen später das Einmalkennwort, falls das Telefon nicht verfügbar ist.
In der Datenbank liegt nur ihr Hash.

Die Anmeldung läuft in **zwei Schritten**: `/login` nimmt E-Mail und Passwort,
`/login/code` den Bestätigungscode — und die zweite Seite erscheint nur, wenn
das Konto einen zweiten Faktor führt. Das Feld nimmt wahlweise ein
sechsstelliges Einmalkennwort oder einen Wiederherstellungscode entgegen.

Zwischen beiden Schritten liegt ein Nachweis mit fünf Minuten Frist. Er ist
keine Sitzung: Er erlaubt genau eine Handlung — den Code nachreichen — und
öffnet keine geschützte Seite.

Nach zehn Fehlversuchen sperrt sich der Zugang für 15 Minuten. Die Sperre zählt
im zweiten Schritt weiter; ein richtiges Passwort allein setzt sie nicht
zurück. Alle Anmeldeereignisse landen im Audit-Log **und** im Log des
Containers.

### Passkeys

Ein Passkey meldet **ohne Passwort und ohne Code** an. Unter **Sicherheit**
anlegen, abmelden, auf der Anmeldeseite „Mit Passkey anmelden" — mehr ist es
nicht. Betreiberkonten können dasselbe auf ihrer Übersicht.

Warum das trotzdem zwei Faktoren sind: Der private Schlüssel verlässt das Gerät
nie (Besitz), und die Gerätesperre — PIN, Fingerabdruck, Gesicht — gibt ihn erst
frei (Wissen oder Merkmal). Die Anwendung verlangt beides und lehnt einen
Passkey ohne Nutzerverifikation ab.

Der eigentliche Gewinn gegenüber einem Einmalkennwort ist ein anderer: Die
Signatur ist an die Domain der aufrufenden Seite gebunden. Eine nachgebaute
Anmeldeseite bekommt nichts — auch dann nicht, wenn jemand alles eingibt, wonach
sie fragt.

**Zwei Bedingungen an die Adresse.** Passkeys brauchen einen sicheren Kontext,
also HTTPS oder `localhost`, und einen **Domainnamen**: Unter einer IP-Adresse
wie `127.0.0.1` funktionieren sie nicht — der Browser bricht die Zeremonie ohne
Meldung ab. Wo eine der beiden Bedingungen fehlt, erscheint statt des Knopfes
der Grund.

**Ein Domainwechsel entwertet alle Passkeys.** Die Domain steckt im Schlüssel;
das ist der Zweck der Bindung und lässt sich nicht abfangen. Nach einem Umzug
melden sich alle einmal mit Passwort an und legen ihren Passkey neu an — der
Passwortweg bleibt deshalb bestehen.

Meldet ein Authenticator einen Signaturzähler, der nicht weitergezählt hat, gibt
es den Schlüssel zweimal. Die Anwendung sperrt ihn dann und protokolliert es;
angemeldet wird niemand.

### Gerät merken

Nach dem Bestätigungscode lässt sich das Gerät als vertraut hinterlegen — dort
entfällt der Code für 30 Tage. Das Passwort wird weiterhin verlangt.

Das schwächt die Zweifaktorauthentifizierung, und deshalb endet der Nachweis bei
jedem Ereignis, das den Verdacht auf Verlust begründet: Passwortzurücksetzung
(auch die durch den Betreiber), Abschalten des zweiten Faktors, Sperren des
Kontos und „alle anderen Sitzungen beenden". Unter **Sicherheit** stehen alle
vertrauten Geräte mit letzter Nutzung und Ablauf, einzeln widerrufbar.

Betreiberkonten haben das nicht: Sie geben jedes Mal den zweiten Faktor ein.

### Zustand prüfen

```bash
curl http://localhost/api/health     # {"status":"ok"}
docker compose ps                    # Container und Healthcheck
docker compose logs -f app
```

Der Healthcheck prüft **zwei** Bestandteile: die Datenbank und den
PDF-Renderer. Der Renderer wird durch einen echten Browserstart geprüft, nicht
durch das Vorhandensein einer Datei — ein Chromium, das wegen zu enger
Capabilities nicht hochkommt, liegt trotzdem an seinem Pfad. Denselben Zustand
zeigt die Oberfläche unter **Sicherheit**.

Er ist bewusst ohne Anmeldung erreichbar — Docker und Caddy können sich nicht
authentifizieren. Er antwortet ausschließlich mit betriebsbereit ja/nein, ohne
Versionsangaben, Pfade oder Fehlertexte.

### Logs

Ein Ereignis je Zeile, als JSON auf stdout:

```bash
docker compose logs -f app | jq -c 'select(.category == "security")'
docker compose logs app | jq -c 'select(.level == "error")'
```

Passwörter, Token, Hashes und Bankverbindungen erscheinen nie im Log — die
Entfernung sitzt im Schreibweg, nicht in der Disziplin der Aufrufer.

## Sicherung

Eine Sicherung enthält **beides**: die Datenbank und den Dateispeicher mit den
erzeugten PDFs, Logos und Uploads. Eine Datenbank ohne die Dateien ist keine
wiederherstellbare Sicherung — ein festgeschriebener Beleg verweist auf seine
Datei samt Prüfsumme.

Die Datenbank wird über `VACUUM INTO` abgezogen, nicht kopiert: Eine Kopie
mitten in einer Transaktion ergibt eine Datei, die aussieht wie eine Datenbank
und beim Öffnen scheitert.

**Von Hand, aus der Verwaltung:** `/admin/operations` → *Sicherung herunterladen*. Seit M8
liegt sie dort und **nicht** in der Oberfläche eines Unternehmens: Eine
Sicherung umfasst die Datenbankdatei als Ganzes, also alle Unternehmen.

**Als Auftrag, für die Zeitsteuerung des Servers:**

```bash
docker compose exec app npm run backup
```

Legt `faktura-<zeitpunkt>.tar.gz` in `BACKUP_DIR` ab (Vorgabe `./backups`) und
entfernt Sicherungen, die älter sind als `BACKUP_KEEP_DAYS` (Vorgabe 30).

Täglich um 3 Uhr, über die Zeitsteuerung des **Servers** — die Anwendung plant
nichts von selbst:

```cron
0 3 * * * cd /srv/faktura && docker compose exec -T app npm run backup >> /var/log/faktura-backup.log 2>&1
```

Die Sicherung gehört anschließend an einen **anderen Ort**. Eine Sicherung auf
derselben Festplatte überlebt genau die Fälle nicht, für die es sie gibt.

## Wiederherstellung

Bewusst von Hand: Sie überschreibt den gesamten Bestand und ist nicht
rücknehmbar.

```bash
# 1. Dienst anhalten
docker compose down

# 2. Archiv auspacken
mkdir -p /tmp/restore && tar -xzf faktura-2026-08-16T10-00-00Z.tar.gz -C /tmp/restore

# 3. Datenbank zurückspielen
cp /tmp/restore/faktura.db ./data/faktura.db

# 4. Dateien zurückspielen
rm -rf ./storage && cp -r /tmp/restore/storage ./storage

# 5. Dienst starten — Migrationen laufen dabei automatisch
docker compose up -d

# 6. Prüfen
curl http://localhost/api/health
```

Danach anmelden, eine festgeschriebene Rechnung öffnen und ihr PDF laden. Erst
wenn das geht, ist die Sicherung bewiesen — **ein ungetestetes Backup ist
keins.**

Eine Sicherung aus einer älteren Fassung wird beim Start migriert. Der
umgekehrte Weg — eine neuere Sicherung in eine ältere Fassung — ist nicht
vorgesehen.

## Datenexport

Einstellungen → **Datenexport** liefert alle Kunden,
Belege, Vorlagen, Nummernkreise und das Protokoll als JSON. Zugangsdaten sind
**nicht** enthalten: Ein Export wird weitergereicht, und Passwörter oder
Sitzungen gehören dort nicht hinein. Wer den ganzen Bestand braucht, nimmt die
Sicherung.

## Aktualisierung

```bash
# 1. Sicherung anlegen — vor jedem Update
docker compose exec app npm run backup

# 2. Neue Fassung holen und starten
git pull
docker compose up -d --build

# 3. Prüfen
curl http://localhost/api/health
docker compose logs -f app
```

Migrationen werden beim Start des neuen Containers angewandt. Schlägt eine
Migration fehl, startet der Container nicht — die alte Sicherung ist dann der
Weg zurück.

## Testdaten

Für Entwicklung und Abnahme, **nie gegen eine Produktionsdatenbank** (das
Kommando bricht bei `NODE_ENV=production` ab):

```bash
npm run seed
```

Erzeugt Kunden, einen Leistungskatalog und Rechnungen über drei Jahre in allen
Statuswerten — Entwurf, offen, teilbezahlt, bezahlt, storniert.

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
| Berechtigungen | `Authorized<K>` — jeder Anwendungsfall verlangt einen typgeprüften Nachweis; ein Aufruf ohne Prüfung ist ein Übersetzungsfehler |
| Mandantentrennung | `OrganizationContext` als erster Pflichtparameter jeder Datenzugriffsfunktion, dazu Datenbanktrigger je Verweiskante |
| Verwaltung | eigene Konten, eigene Sitzung, eigenes Cookie; eine Adminsitzung führt **keinen** Mandantenkontext und kommt damit an keine Geschäftsdaten |

## Mehrere Unternehmen

Eine Installation trägt beliebig viele Unternehmen. Was sie trennt, ist nicht
eine Prüfung, sondern der Typ: Jede Funktion, die auf Daten zugreift, verlangt
einen `OrganizationContext` als ersten Pflichtparameter. Eine Abfrage ohne
Mandantenfilter lässt sich nicht schreiben — sie ist ein Übersetzungsfehler.

Darunter liegt eine zweite Ebene: Datenbanktrigger halten jede Verweiskante
innerhalb eines Unternehmens. Sie greifen auch dann, wenn jemand am
Anwendungscode vorbei schreibt.

**Nummernkreise gelten je Unternehmen.** Zwei Unternehmen, die am selben Tag
ihren ersten Beleg festschreiben, bekommen beide `RE-2026-0001`.

### Rollen

Jedes Unternehmen legt **eigene** Rollen an; fest ist nur der Katalog der 28
Berechtigungen. Ein Konto trägt genau eine Rolle. Berechtigungen werden bei
jeder Anfrage frisch gelesen — ein entzogenes Recht wirkt beim nächsten Klick,
nicht beim nächsten Anmelden.

Drei Rechte trägt jedes Konto ohne Rolle: den Namen des eigenen Arbeitgebers
lesen und die eigene Sicherheit einsehen und ändern. Beides sind keine
Rechtefragen.

**Die Aussperrsicherung:** Je Unternehmen hält immer mindestens ein nicht
gesperrtes Konto die Rechteverwaltung. Das garantiert die Datenbank, nicht die
Anwendung — sonst ließe sich ein Unternehmen durch eine unglückliche
Rollenänderung aussperren, und niemand außer dem Betreiber käme wieder hinein.

### Mitglieder

Mitglieder kommen ausschließlich über eine **Einladung** hinein. Der Link gilt
sieben Tage, funktioniert einmal und erscheint genau einmal in der Oberfläche —
die Anwendung versendet keine E-Mail und darf keine.

Das Passwort setzt der Eingeladene selbst. Kein anderes Konto erfährt es, auch
nicht die Rechteverwaltung: Sie kann eine Zurücksetzung auslösen, aber kein
Passwort vergeben. Der Zurücksetzungslink gilt 24 Stunden, funktioniert einmal
und beendet dabei **alle** Sitzungen des Kontos.

Wer ausscheidet, wird **gesperrt, nicht gelöscht**: Der Beleg behält seinen
Urheber. Der Preis ist benannt — die Adresse bleibt dauerhaft belegt.

### Was die Verwaltung nicht sieht

Der Betreiber legt Unternehmen an, legt sie still und sperrt im Notfall einzelne
Konten. Was er **nicht** sieht, ist irgendeine Rechnung, irgendein Kunde,
irgendein Betrag. Je Unternehmen zeigt die Verwaltung vier Zahlen: Konten,
Belege, Kunden, letzte Anmeldung.

Das ist keine Einstellung, sondern eine Eigenschaft des Aufbaus. Eine
Adminsitzung führt keinen Mandantenkontext, und jede Abfrage von Geschäftsdaten
verlangt einen. Es gibt auch keine Funktion, die aus dem einen das andere macht;
diese Nichtexistenz wird von einem Test festgehalten.

Beim Anlegen eines Unternehmens entstehen in **einem** Vorgang das Unternehmen,
die Rolle „Inhaber" mit allen Berechtigungen und eine Einladung. Der Betreiber
kennt damit zu keinem Zeitpunkt ein Passwort innerhalb eines Unternehmens — der
stärkste Beleg für die Trennung, den das System liefern kann.

### Was der Betreiber sonst noch kann

**Weitere Betreiber.** Unter **Betreiber** lässt sich ein zweites Konto einladen,
sperren, entsperren und mit neuen Zugangsdaten versehen. Der Link erscheint genau
einmal; Passwort und zweiter Faktor entstehen beim Einlösen. Ein Betreiberkonto
ohne zweiten Faktor gibt es zu keinem Zeitpunkt.

Das **letzte aktive** Konto lässt sich nicht sperren — dann käme niemand mehr in
die Verwaltung. Zurücksetzen geht trotzdem: Dabei entsteht im selben Zug ein
Einrichtungslink, also ein Rückweg. Geht auch der verloren, hilft
`npm run admin:create` mit einer neuen Adresse; wer Zugriff auf den Server hat,
kommt immer herein.

**Protokoll.** Unter **Protokoll** steht, was Betreiber getan haben — Unternehmen
angelegt, stillgelegt, Nachweise ausgestellt, Konten gesperrt. Geschäftsvorfälle
der Unternehmen stehen dort nicht: Sie werden im Protokoll des jeweiligen
Unternehmens geführt, und die Verwaltung liest es nicht. Einträge lassen sich
nicht ändern und nicht löschen.

**Konten unkenntlich machen.** Ein Mandantenkonto lässt sich nicht löschen — aber
seine Person entfernen. Adresse, Name, Zugangsdaten und alle Anmeldespuren
verschwinden, die Zeile bleibt. Der Grund ist die Aufbewahrungspflicht: Ein Beleg
nennt seinen Urheber, und ein Verweis ins Leere wäre schlimmer als ein Verweis
ohne Person. In der Oberfläche steht danach „Gelöschtes Konto". Der Vorgang ist
**nicht umkehrbar**.

Trifft es das letzte Konto mit Rechteverwaltung, weist die Datenbank ihn ab: Ein
Unternehmen ohne Rechteverwaltung zurückzulassen wäre der größere Schaden.

**Betrieb.** Unter **Betrieb** stehen der Zustand der Anlage — Datenbank und
PDF-Renderer, jeweils durch eine echte Prüfung — und der Knopf für die Sicherung.
Sie umfasst den Bestand **aller** Unternehmen und ist deshalb nur hier
erreichbar. Zeitplan und Wiederherstellung bleiben Betriebsaufträge: Ein
eingebauter Zeitgeber liefe im Container mit, ohne dass jemand ihn sieht, und die
Wiederherstellung überschreibt alles.

### Wenn niemand mehr hineinkommt

Zwei Zugänge waren bis dahin unwiederbringlich, und beide hatten dieselbe Form:
Der einzige, der sie wiederherstellen könnte, ist genau der Verlorene. Geht der
Einladungslink eines neuen Unternehmens verloren, kommt niemand hinein. Und
verliert das einzige Konto mit Rechteverwaltung sein Passwort, kann es niemand
zurücksetzen — dafür braucht es genau dieses Recht.

Der Betreiber kann beides ausstellen: eine neue Einladung und einen
Zurücksetzungsnachweis für ein einzelnes Konto. Was er dabei **nicht** bekommt,
ist eine Sitzung, ein Passwort oder Einsicht. Er stellt einen Nachweis aus, den
ein Mensch im Browser einlöst.

Dass er ihn im Grenzfall selbst einlösen könnte, ist der bewusst in Kauf
genommene Preis dafür, dass es überhaupt einen Weg zurück gibt. Sichtbar gemacht
wird er auf zwei Wegen: Der Vorgang steht im Protokoll **des Unternehmens** mit
der Akteursart `ADMIN`, und alle Sitzungen des betroffenen Kontos enden dabei.

## Der Beleg

**Als Kleinunternehmer nach §19 UStG steht keine Umsatzsteuer auf der Rechnung.**
Keine Spalte, keine Steuerzeile, kein Betrag — nur der Hinweis zwischen Netto-
und Bruttobetrag, der erklärt, warum beide gleich sind. Das Kennzeichen dafür
steht unter **Firmendaten**; es wandert beim Festschreiben in den Beleg, sodass
eine spätere Umstellung alte Rechnungen nicht verändert.

**Das Logo** aus den Firmendaten erscheint im Briefkopf. Es wird in die
PDF-Datei eingebettet, nicht verlinkt: Der Renderer hat keinen Netzwerkzugriff.
Ein festgeschriebener Beleg behält das Logo, das beim Festschreiben galt.

**Der Blattfuß** trägt Anschrift, Kontakt, Steuernummer und Bankverbindung und
steht am Fuß jeder Seite — der Seitenumbruch hält den Platz dafür frei.

**Die Vorlage gehört dem Unternehmen.** Wird die mitgelieferte Standardvorlage
verbessert, ändert das **bestehende** Installationen nicht: Jedes Unternehmen
trägt seine eigene Kopie, und Faktura schreibt sie nicht um. Wer die Änderungen
übernehmen will, legt die Standardvorlage unter **Vorlagen** neu an.

**Eigenes Briefpapier.** Unter **Firmendaten › Briefpapier** lässt sich eine
einseitige A4-PDF hinterlegen, die unter jede Seite des Belegs gelegt wird.
Gestaltet wird sie im Werkzeug der Wahl — Faktura setzt nur den Inhalt darauf.
Der Bogen trägt deshalb ausschließlich Gestaltung: Anschrift, Bankverbindung und
Pflichtangaben kommen weiter aus den Firmendaten, damit sie prüfbar bleiben.

Abgewiesen werden ein mehrseitiges PDF — seine zweite Seite erschiene auf keinem
Beleg — und eines, das nicht A4 ist. Ein Bogen mit ausführbaren Bestandteilen
ebenfalls.

**Was einmal ausgestellt ist, bleibt.** Das PDF entsteht in dem Moment, in dem
die Rechnungsnummer vergeben wird, und liegt danach als Datei mit Prüfsumme.
Wer später Vorlage, Logo oder Briefpapier ändert, ändert damit **keinen**
ausgestellten Beleg — auch keinen, den niemand angesehen hat.

## Impressum und Datenschutz

Wer die Anwendung **auch für andere Unternehmen** betreibt, bietet ein
Telemedium an: Dann sind ein Impressum (§5 DDG) und Datenschutzhinweise
(Art. 13 DSGVO) fällig. Für eine Anlage, die nur der eigene Betrieb benutzt,
gilt das nicht.

Beides steht unter **Verwaltung › Rechtliches** und gehört dem **Betreiber der
Installation**, nicht den Unternehmen darin — angeboten wird die Anwendung von
dem, der sie betreibt. Deshalb gibt es genau ein Impressum je Anlage.

`/impressum` und `/datenschutz` sind ohne Anmeldung erreichbar. Solange kein
Impressum hinterlegt ist, gibt es die Seite nicht und nichts verlinkt darauf.

**Die Datenschutzhinweise beschreiben die Anwendung selbst** und stehen immer:
was gespeichert wird, wozu und wie lange. Die Fristen darin sind keine
abgeschriebenen Zahlen, sondern kommen aus denselben Konstanten, nach denen die
Anwendung handelt — wer eine Frist ändert und die Auskunft vergisst, bricht
einen Test.

Faktura prüft die Angaben des Betreibers nicht und leistet keine
Rechtsberatung.

## Anwenderdokumentation

Das Handbuch liegt unter **`/hilfe`** und wird mit der Anwendung ausgeliefert —
es ist ohne Anmeldung erreichbar und von der Anmeldeseite aus verlinkt. Es
richtet sich an die Menschen, die mit Faktura arbeiten: Anmeldung, Firmendaten,
Rechnungen, Festschreiben, Zahlungen, Mahnungen, Vorlagen, Mitglieder,
Sicherheit des eigenen Kontos.

**Dieses README bleibt die Betriebsanleitung** — Installation, Konfiguration,
Sicherung, Wiederherstellung, Update. Beides gehört getrennt, weil es sich an
verschiedene Leser richtet.

Der Inhalt steht als MDX in `src/content/hilfe/`. Wer ihn ändert, erzeugt
danach den Suchindex neu:

```bash
npm run docs:index
```

Ohne diesen Lauf schlägt `npm run verify` fehl — ein Test vergleicht den
eingecheckten Index mit den Quellen.

Die **Bildschirmfotos** entstehen ebenso auf Befehl. Sie brauchen einen
Produktionsbuild, fahren die Anwendung auf einer eigenen, wegwerfbaren Datenbank
hoch und nehmen sie auf:

```bash
npm run build
npm run docs:shots
``` Fristen und Grenzen im Text sind Verweise
auf die Konstanten der Anwendung und keine abgeschriebenen Zahlen; ein zweiter
Test hält auch das fest.

## E-Mail-Versand

**Optional.** Ohne `SMTP_URL` und `MAIL_FROM` verschickt Faktura nichts und
kommt vollständig ohne ausgehende Internetverbindung aus — Einladungen und
Zurücksetzungsnachweise erscheinen dann wie bisher genau einmal in der
Oberfläche und werden von Hand weitergereicht.

```env
SMTP_URL=smtps://benutzer:kennwort@mail.example.org:465
MAIL_FROM=Faktura <rechnungen@example.org>
```

Mit beiden Werten kommt die Zustellung **hinzu**. Sie ersetzt den Link in der
Oberfläche nicht: Wer die Nachricht nicht bekommt, soll nicht ausgesperrt sein.
Die Oberfläche sagt nach jeder Einladung, was daraus geworden ist — zugestellt,
kein Versand eingerichtet, oder der Mailserver hat abgelehnt.

Ein nicht erreichbarer Mailserver bricht keine Handlung ab: Wer ein Mitglied
einlädt, hat es eingeladen. Nach zehn Sekunden gibt der Versuch auf, damit ein
schweigender Server niemanden warten lässt.

Verschickt wird ausschließlich **Text**, nie HTML — kein nachgeladenes Bild,
keine Lesebestätigung, und ein Link bleibt sichtbar, was er ist.

### Damit die Nachrichten ankommen

Faktura verschickt über den Server, den Sie benennen; ob eine Nachricht im
Posteingang oder im Spam landet, entscheidet dessen Ruf und die DNS-Einträge
Ihrer Absenderdomäne. Das ist Betriebssache und gehört nicht in die Anwendung:

- **SPF** — ein `TXT`-Eintrag auf der Absenderdomäne, der den sendenden Server
  benennt: `v=spf1 mx a:mail.example.org -all`.
- **DKIM** — der Mailserver signiert ausgehende Nachrichten, der öffentliche
  Schlüssel steht im DNS. Ohne Signatur werten viele Empfänger ab.
- **DMARC** — sagt Empfängern, was bei einem Fehlschlag geschehen soll, und
  liefert Berichte: `v=DMARC1; p=quarantine; rua=mailto:dmarc@example.org`.

`MAIL_FROM` muss zu der Domäne passen, für die diese Einträge gelten. Eine
Absenderadresse bei einem Freemail-Anbieter, versendet über den eigenen Server,
scheitert an SPF und DMARC — und zwar stillschweigend beim Empfänger.

Zum Prüfen genügt eine Einladung an eine Adresse außerhalb des Hauses und ein
Blick in den Kopf der angekommenen Nachricht (`Authentication-Results`).

## Unveränderbarkeit

Ab dem Festschreiben sind Rechnung und Positionen fest. Durchgesetzt auf zwei
Ebenen, wie es die Spezifikation verlangt:

1. Guards in den Use Cases — sie liefern verständliche Meldungen.
2. Datenbank-Trigger — sie greifen auch dann, wenn jemand am Anwendungscode
   vorbei schreibt, und lassen sich nicht durch ein Zurücksetzen auf „Entwurf"
   umgehen.

Änderbar bleiben nur Status, Zahlungsstand und Stornovermerk. Ein
festgeschriebener Beleg lässt sich nicht löschen — eine fehlerhafte Rechnung
wird storniert. Das Audit-Log ist weder änder- noch löschbar.

Eine Stornierung erzeugt eine **eigenständige Stornorechnung** mit eigener
Nummer aus demselben fortlaufenden Kreis und Bezug auf das Original; das
Original wechselt auf „Storniert" und bleibt vollständig erhalten. Die
Stornorechnung führt positive Beträge — die Richtung steckt im Belegtyp, so wie
EN 16931 es vorsieht — und zählt nie in den Umsatz, weil das Original bereits
ausscheidet.

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

## Deployment

Voraussetzungen: Docker, KIND und kubectl.

### KIND-Cluster erstellen

```bash
kind create cluster --name faktura
```

### Kubernetes-Ressourcen deployen

```bash
kubectl apply -f deployment/k8s/namespace.yaml
kubectl apply -f deployment/k8s/app-config.yaml
kubectl apply -f deployment/k8s/pvc.yaml
kubectl apply -f deployment/k8s/app-deployment.yaml
kubectl apply -f deployment/k8s/app-service.yaml
```

### Prüfen, ob der Pod läuft

```bash
kubectl get pods -n faktura
```

Der Pod muss `Running` und `1/1` sein.

### Anwendung lokal verfügbar machen

```bash
kubectl port-forward -n faktura service/faktura-app 3000:3000
```

### Im Browser öffnen

```text
http://localhost:3000
```

> Das Terminal mit dem Port-Forward muss während der Nutzung geöffnet bleiben.