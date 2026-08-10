# CLAUDE.md — Leitplanken für dieses Projekt

Verbindliche Grundlagen: `rechnungs-app-spec.md` (Architektur, Datenmodell) und
`rechnungs-app-anforderungen.md` (prüfbarer Anforderungskatalog). Beide sind nicht
verhandelbar. Widersprüche werden gemeldet, nicht still gelöst.

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
6. **Sicherheit ist kein Nachtrag:** M1 kommt vor allen Features. Ab dann wird jede
   neue Route und jede Server Action sofort abgesichert (`requireSession()` als erste
   Anweisung), nicht nachträglich.
7. **Kein Roh-SQL im Anwendungscode** (NFA-ARCH-10): kein `$queryRaw*`,
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
Vitest 4.1.10, Zod 4.4.3.

## Schichten

```
src/app/            Next.js App Router — Routen, Layouts (UI)
src/ui/             React-Komponenten, Formatter (UI)
src/i18n/           zentrale deutsche Texte
src/application/    Use Cases / Server Actions
src/domain/         reine TypeScript-Logik — keine Fremdimporte
src/infrastructure/ Prisma, Dateisystem, Renderer, Auth
```

Erlaubte Richtungen: `app → application, ui, i18n, domain` · `ui → domain, i18n` ·
`i18n → domain` · `application → domain, infrastructure` · `infrastructure → domain` ·
`domain → domain`.

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

Dateien, die sowohl von der Edge-Laufzeit, von Serverkomponenten als auch von
Client-Komponenten gelesen werden (z. B. `infrastructure/security/csrf.ts`), bleiben
importfrei — jede Abhängigkeit von `node:crypto` landet sonst im Browser-Bündel.

## Meilensteine (Spec §14)

| MS | Inhalt | Status |
|---|---|---|
| M0 | Fundament: Next.js, TS, Tailwind, Prisma, Docker, Lint, Vitest, Schichten | abgenommen |
| M1 | Auth & Sicherheit — vor allen Features | abgenommen |
| M2 | Stammdaten: Firma, Kunden, Katalog | zur Abnahme |
| M3 | Domain-Kern: Berechnung, Steuer, Nummernkreis, Status — **Tests zuerst** | offen |
| M4 | Rechnungen: Editor, Festschreiben, Zahlungen, Storno, Audit | offen |
| M5 | Vorlagen & PDF: InvoiceDocument, Liquid, Playwright, Artefakte | offen |
| M6 | Dashboard: `getDashboardMetrics()`, Kacheln, Chart, Listen | offen |
| M7 | Betrieb: Backup, Restore, Healthcheck, Logging, E2E | offen |
