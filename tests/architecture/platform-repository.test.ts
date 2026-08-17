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
 */
import { readFileSync } from 'node:fs';
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
  'session',
  'auditLog',
];

/**
 * Geschäftsdaten. Auf ihnen ist **ausschließlich Zählen** erlaubt: Aus einer
 * Anzahl lässt sich kein Beleg rekonstruieren, und ohne sie könnte der
 * Betreiber nicht einmal erkennen, ob ein Unternehmen die Anwendung benutzt.
 */
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
