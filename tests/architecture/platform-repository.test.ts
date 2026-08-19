/**
 * Die Verwaltung sieht keine Geschäftsdaten (M8, FA-ADM-02, FA-ADM-03).
 *
 * Der Auftraggeber hat entschieden: Die zentrale Verwaltung legt Unternehmen
 * und Konten an, sperrt und entsperrt — und sieht keine Rechnung, keinen
 * Kunden, keinen Betrag.
 *
 * Diese Zusage trägt im Regelfall das Typsystem: Eine Adminsitzung führt einen
 * `PlatformContext` und keinen `OrganizationContext`, und jede Funktion in
 * `infrastructure/repositories/**`, die Geschäftsdaten anfasst, verlangt einen
 * `OrganizationContext` als ersten Pflichtparameter. Ein `listInvoices(…)` aus
 * dem Adminbereich ist damit ein Übersetzungsfehler.
 *
 * **Eine Lücke bleibt**, und für sie ist dieser Test da:
 * `platform-repository.ts` steht selbst in der Repository-Schicht und darf den
 * Prisma-Client sehen. Wer dort ein `invoice.findMany()` schreibt, umgeht die
 * Sicherung — kein Typ hält ihn auf. Deshalb wird genau diese Datei am
 * Quelltext geprüft.
 *
 * **Und genau das war die vierte Lücke** (M10/B2): „genau diese Datei". Eine
 * Funktion mit `PlatformContext` ließ sich daneben anlegen —
 * `createPlatformAuditEntry` stand bis M10 in `audit-repository.ts` und war
 * damit ungeprüft. Der Wächter sucht jetzt zuerst nach solchen Nachbarn und
 * verlangt, dass es keine gibt.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

const PLATFORM_REPOSITORY = 'src/infrastructure/repositories/platform-repository.ts';

function sourceOf(file: string): string {
  return readFileSync(path.join(projectRoot, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

/**
 * Gegenstände der Verwaltung. Auf ihnen ist jede Abfrage erlaubt — sie sind
 * das, was der Betreiber verwaltet.
 */
const ADMINISTRATIVE = [
  'organization',
  'user',
  'adminUser',
  'adminSession',
  'adminInvitation',
  'session',
  /*
   * Seit M9/B1 zusätzlich — und die Aufnahme ist eine Entscheidung, keine
   * Formalität.
   *
   * `invitation` und `passwordReset` sind **Wege in** ein Unternehmen, keine
   * Daten **des** Unternehmens: Sie tragen eine Adresse und einen Tokenhash,
   * keinen Beleg und keinen Betrag. Der Betreiber braucht sie, weil ein
   * verlorener Einladungslink oder ein vergessenes Passwort der
   * Rechteverwaltung sonst eine Sackgasse wäre, aus der niemand herausführt.
   *
   * `role` steht mit, weil eine neu ausgestellte Einladung eine Rolle
   * mitbringen muss — der Betreiber **wählt** sie nicht, er liest die vorhandene
   * (`findOwnerRoleId`). Welche Rechte in einem Unternehmen gelten, geht ihn
   * nichts an.
   */
  'invitation',
  'passwordReset',
  'role',
  /*
   * `trustedDevice` seit M9/B2 — aus demselben Grund wie `session`.
   *
   * Ein vertrautes Gerät ist ein **Anmeldenachweis** eines Kontos, kein Datum
   * des Unternehmens. Der Betreiber räumt sie ab, wenn er ein Passwort
   * zurücksetzt; bliebe eines stehen, käme das Konto am zweiten Faktor vorbei
   * herein, und die Zurücksetzung wäre an der entscheidenden Stelle wirkungslos.
   */
  'trustedDevice',
  /*
   * `platformAuditEntry` seit M10/B2 — das Protokoll der **Anlage**, nicht das
   * eines Unternehmens. Es entsteht ausschließlich aus Handlungen des
   * Betreibers und enthält keinen Geschäftsvorfall.
   */
  'platformAuditEntry',
];

/**
 * Geschäftsdaten. Auf ihnen ist **ausschließlich Zählen** erlaubt: Aus einer
 * Anzahl lässt sich kein Beleg rekonstruieren, und ohne sie könnte der
 * Betreiber nicht einmal erkennen, ob ein Unternehmen die Anwendung benutzt.
 */
/**
 * Auf diese Gegenstände darf die Verwaltung **nur schreiben** (M10, B2).
 *
 * `auditLog` ist das Protokoll eines Unternehmens: Rechnungsnummern, Beträge,
 * Kundennamen stehen dort im Klartext. Der Betreiber trägt seinen Eingriff
 * hinein, damit die Betroffenen ihn sehen (FA-ADM-07) — lesen darf er dort
 * nichts.
 *
 * Bis M10 stand `auditLog` in `ADMINISTRATIVE`, also unter „alles erlaubt". Das
 * war nie benutzt worden, aber eine Ansicht der Verwaltung, die es liest, wäre
 * durchgegangen. Was der Betreiber zu sehen bekommt, steht seit M10 in
 * `platformAuditEntry` — einer eigenen Tabelle, die die fremden Zeilen gar nicht
 * erst enthält.
 */
const WRITE_ONLY = ['auditLog'];

const BUSINESS = [
  'invoice',
  'invoiceLine',
  'invoiceArtifact',
  'customer',
  'catalogItem',
  'payment',
  'template',
  'companyProfile',
  'numberSequence',
  'asset',
];

/**
 * Der Wächter kennt jede Datei, die mit einem `PlatformContext` arbeitet
 * (M10, B2, NFA-SEC-30).
 *
 * **Die vierte Lücke dieses Wächters.** Die ersten drei — Delegates direkt
 * angesprochen, über Beziehungsnamen, und Delegates in keiner Liste — stehen in
 * `CLAUDE.md`. Diese hier ist grundsätzlicher: Alle drei prüfen **eine** Datei.
 * `createPlatformAuditEntry` nahm einen `PlatformContext` und stand in
 * `audit-repository.ts`; dort hätte sich eine Lesefunktion auf `auditLog`
 * anlegen lassen, ohne dass eine der drei Prüfungen sie je gesehen hätte.
 *
 * Also zuerst die Frage, die vorher niemand gestellt hat: Gibt es solche
 * Nachbarn überhaupt? Die Antwort muss „nein" lauten, sonst prüft der Rest
 * dieser Datei nur die halbe Angriffsfläche.
 */
describe('NFA-SEC-30 Der Wächter sieht alles, was einen Betreiberkontext führt', () => {
  const REPOSITORY_DIR = 'src/infrastructure/repositories';

  /** Die beiden Dateien, die einen `PlatformContext` führen dürfen. */
  const ALLOWED = new Set(['platform-repository.ts', 'platform-context.ts']);

  it('führt außerhalb der geprüften Datei niemand einen Betreiberkontext', () => {
    const directory = path.join(projectRoot, REPOSITORY_DIR);
    const offenders = readdirSync(directory)
      .filter((file) => file.endsWith('.ts') && !ALLOWED.has(file))
      .filter((file) => /PlatformContext/u.test(sourceOf(path.join(REPOSITORY_DIR, file))));

    expect(
      offenders,
      'Eine Repository-Funktion mit `PlatformContext` gehört in `platform-repository.ts` — ' +
        'nur diese Datei wird auf Geschäftsdaten geprüft',
    ).toEqual([]);
  });

  it('findet die Prüfung überhaupt Dateien', () => {
    // Gegenprobe: Ohne sie bestünde die Prüfung oben auch dann, wenn das
    // Verzeichnis leer wäre oder der Pfad nicht stimmte.
    const files = readdirSync(path.join(projectRoot, REPOSITORY_DIR)).filter((file) =>
      file.endsWith('.ts'),
    );

    expect(files.length).toBeGreaterThan(4);
    expect(files).toContain('platform-repository.ts');
  });
});

describe('FA-ADM-02 Das Betreiber-Repository fasst keine Geschäftsdaten an', () => {
  it('fragt Geschäftstabellen höchstens zählend ab', () => {
    const source = sourceOf(PLATFORM_REPOSITORY);
    const offenders: string[] = [];

    for (const delegate of BUSINESS) {
      // Jeder Zugriff der Form `client.invoice.<methode>(`.
      const pattern = new RegExp(`\\.${delegate}\\.([a-zA-Z]+)\\s*\\(`, 'gu');

      for (const match of source.matchAll(pattern)) {
        const method = match[1] ?? '';
        if (method !== 'count' && method !== 'groupBy' && method !== 'aggregate') {
          offenders.push(`${delegate}.${method}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * Die Lücke, die B5 aufgedeckt hat.
   *
   * Die Prüfung oben sucht nach `client.invoice.<methode>(` — der Form, in der
   * man ein Delegate direkt anspricht. Es gibt aber eine zweite Form, und sie
   * sieht harmlos aus:
   *
   * ```ts
   * organization.findMany({ include: { invoices: true } })   // liest Belege!
   * organization.findMany({ include: { _count: { select: { invoices: true } } } })  // zählt sie
   * ```
   *
   * Beide nennen `invoices`, beide gehen über das Delegate `organization`, und
   * die erste liefert vollständige Belegzeilen. Der ursprüngliche Wächter hätte
   * sie durchgelassen — nicht aus Nachlässigkeit, sondern weil er die falsche
   * Ebene betrachtete.
   *
   * Geprüft wird deshalb über die **Beziehungsnamen**: Sie dürfen im Quelltext
   * nur innerhalb eines `_count`-Blocks vorkommen. Der Block wird vorher
   * herausgeschnitten; was danach übrig bleibt und einen Beziehungsnamen als
   * Schlüssel führt, ist ein Lesezugriff.
   */
  it('nennt Geschäftsbeziehungen nur innerhalb von `_count`', () => {
    // Die Beziehungsnamen, wie sie an `Organization` stehen (Plural).
    const relations = [
      'invoices',
      'invoiceLines',
      'artifacts',
      'customers',
      'catalogItems',
      'payments',
      'templates',
      'companyProfile',
      'numberSequences',
      'assets',
    ];

    // `_count: { select: { … } }` entfernen — dort ist die Nennung erlaubt.
    const withoutCounts = sourceOf(PLATFORM_REPOSITORY).replace(
      /_count\s*:\s*\{[\s\S]*?\}\s*\}/gu,
      '',
    );

    const offenders = relations.filter((relation) =>
      new RegExp(`\\b${relation}\\s*:`, 'u').test(withoutCounts),
    );

    expect(offenders).toEqual([]);
  });

  /**
   * Die Lücke, die M9/B1 aufgedeckt hat: **was in keiner Liste steht, prüft
   * niemand.**
   *
   * Die Prüfung auf Geschäftsdaten läuft über eine Aufzählung, und die auf
   * Verwaltungsgegenstände ebenso. Ein Delegate, das in **keiner** von beiden
   * vorkommt, fiel damit durch beide Netze — `invitation` und `passwordReset`
   * kamen so hinein, ohne dass jemand die Frage beantworten musste, ob sie
   * dorthin gehören.
   *
   * Deshalb hier die dritte Prüfung: Jedes benutzte Delegate muss in einer der
   * beiden Listen stehen. Wer ein neues anfasst, beantwortet die Frage — im
   * Diff, sichtbar.
   */
  it('benutzt kein Delegate, das in keiner Liste steht', () => {
    const source = sourceOf(PLATFORM_REPOSITORY);
    const known = new Set([...ADMINISTRATIVE, ...WRITE_ONLY, ...BUSINESS]);

    /*
     * Erfasst wird der **Empfänger**, nicht nur der Name.
     *
     * Der erste Anlauf suchte `.<name>.<methode>(` und filterte dann heraus,
     * was kein Delegate sein konnte — und warf dabei genau die unbekannten
     * Delegates weg, die er finden sollte. Er bestand, während `recoveryCode`
     * ungeprüft durchging.
     *
     * Ein Prisma-Delegate wird in dieser Datei ausschließlich über
     * `clientFor(...)` oder eine daraus gebundene Variable `client`
     * angesprochen. Genau das steht jetzt im Ausdruck; damit braucht es keinen
     * Filter, und was gefunden wird, ist ein Delegate.
     */
    const used = new Set(
      [...source.matchAll(/(?:clientFor\([^)]*\)|\bclient)\.([a-z][a-zA-Z]*)\.[a-zA-Z]+\s*\(/gu)].map(
        (match) => match[1] ?? '',
      ),
    );

    expect([...used].filter((delegate) => !known.has(delegate))).toEqual([]);

    // Gegenprobe: Die Prüfung darf nicht dadurch bestehen, dass sie nichts
    // findet.
    expect(used.size).toBeGreaterThan(5);
  });

  /**
   * Auf `auditLog` schreibt der Betreiber, er liest dort nie (M10, B2).
   *
   * Das Protokoll eines Unternehmens nennt Rechnungsnummern, Beträge und
   * Kundennamen. Sein Eingriff gehört hinein (FA-ADM-07) — der Blick hinein
   * nicht. Was er zu sehen bekommt, steht in `platformAuditEntry`.
   *
   * Die Alternative wäre ein `where: { actorKind: 'ADMIN' }` gewesen. Sie hätte
   * dieselbe Wirkung gehabt, solange niemand den Filter vergisst; eine getrennte
   * Tabelle enthält die fremden Zeilen gar nicht erst.
   */
  it('schreibt in das Protokoll der Mandanten, ohne darin zu lesen', () => {
    const source = sourceOf(PLATFORM_REPOSITORY);
    const offenders: string[] = [];

    for (const delegate of WRITE_ONLY) {
      const pattern = new RegExp(
        `(?:clientFor\\([^)]*\\)|\\bclient)\\.${delegate}\\.([a-zA-Z]+)\\s*\\(`,
        'gu',
      );

      for (const match of source.matchAll(pattern)) {
        const method = match[1] ?? '';
        if (method !== 'create' && method !== 'createMany') {
          offenders.push(`${delegate}.${method}`);
        }
      }
    }

    expect(offenders).toEqual([]);

    // Gegenprobe: Geschrieben wird tatsächlich — sonst prüfte die Regel nichts.
    expect(/\.auditLog\.create\s*\(/u.test(source)).toBe(true);
  });

  it('kennt die Verwaltungsgegenstände, die es benutzen darf', () => {
    const source = sourceOf(PLATFORM_REPOSITORY);

    // Umgekehrte Richtung: Die Datei soll überhaupt etwas verwalten — sonst
    // liefe die Prüfung oben ins Leere, weil sie nichts findet.
    const used = ADMINISTRATIVE.filter((delegate) =>
      new RegExp(`\\.${delegate}\\.`, 'u').test(source),
    );

    expect(used.length).toBeGreaterThan(2);
  });

  /**
   * Der Weg zurück existiert nicht (FA-ADM-04).
   *
   * Gäbe es irgendwo eine Funktion, die aus einem `PlatformContext` einen
   * `OrganizationContext` macht, wäre die gesamte Trennung eine Zeile weit
   * entfernt von ihrer Aufhebung — und die Übernahme einer Mandantensitzung
   * durch den Betreiber wäre gebaut, ohne dass jemand sie beschlossen hätte.
   */
  it('stellt aus einem Betreiberkontext keinen Mandantenkontext her', () => {
    const offenders: string[] = [];

    for (const file of [
      PLATFORM_REPOSITORY,
      'src/infrastructure/repositories/platform-context.ts',
      'src/application/admin/admin-session-service.ts',
      'src/application/admin/admin-login.ts',
      'src/application/admin/require-admin-session.ts',
      'src/application/admin/organization-admin.ts',
    ]) {
      if (/organizationContextOf/u.test(sourceOf(file))) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * Und der Adminbereich holt sich die Mandantensitzung auch nicht auf dem
   * Umweg über die Anwendungsschicht.
   */
  it('verwendet in den Adminseiten keine Mandantensitzung', () => {
    const offenders: string[] = [];

    for (const file of [
      'src/app/admin/page.tsx',
      'src/app/admin/actions.ts',
      'src/app/admin/login/page.tsx',
      'src/app/admin/login/actions.ts',
      'src/app/admin/login/code/page.tsx',
    ]) {
      const source = sourceOf(file);
      // `admin-session-service` ist erlaubt — gemeint ist der Mandantenweg.
      if (/requireSession\b|getOptionalSession\b|auth\/session-service/u.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
