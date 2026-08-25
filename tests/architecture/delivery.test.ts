/**
 * Wer einen Nachweis ausstellt, stellt ihn auch zu (M14 — FA-MEMB-08).
 *
 * **Der Wächter ist aus einem Fehlschlag entstanden.** B2 hat drei Wege
 * verkabelt — Mitglied einladen, Zurücksetzung durch die Rechteverwaltung,
 * Betreiberkonto einrichten — und drei übersehen, alle in der Verwaltung:
 * Unternehmen anlegen, Einladung erneut ausstellen, Zurücksetzung für ein
 * Mandantenkonto. Aufgefallen ist es dem Auftraggeber, der ein Unternehmen
 * anlegte und auf eine Mail wartete, die nie kam.
 *
 * Nichts daran war ein Typfehler: Jede dieser Funktionen war für sich richtig.
 * Der Fehler lag zwischen ihnen — genau die Sorte, für die dieses Projekt
 * Wächter schreibt.
 *
 * Geprüft wird die Regel in ihrer greifbaren Form: Ein Modul der
 * Anwendungsschicht, das `generateRedemptionToken()` aufruft, ruft auch eine
 * `deliver*`-Funktion auf. Das ist gröber als „jeder einzelne Vorgang stellt
 * zu" — ein Modul mit zwei Vorgängen, von denen nur einer zustellt, käme
 * durch. Feiner ginge es nur mit einer Analyse je Funktion, und die wäre eine
 * zweite Vorstellung davon, was dieser Code tut. Die Ausgänge selbst decken
 * die Integrationstests ab.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Dieselbe Sammelweise wie in `offline.test.ts`, nur synchron. */
function collect(directory: string): string[] {
  const entries = readdirSync(path.join(projectRoot, directory), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collect(relative));
    } else if (/\.tsx?$/u.test(entry.name)) {
      files.push(relative);
    }
  }

  return files;
}

const ISSUES = /generateRedemptionToken\s*\(/u;
const DELIVERS = /\bdeliver[A-Z]\w*\s*\(/u;

/** Die Datei, in der die `deliver*`-Funktionen selbst stehen. */
const DELIVERY_MODULE = path.join('src', 'application', 'notifications', 'deliver.ts');

describe('FA-MEMB-08 Wer einen Nachweis ausstellt, stellt ihn zu', () => {
  const modules = collect(path.join('src', 'application'))
    .filter((file) => file !== DELIVERY_MODULE)
    .map((file) => ({ file, source: readFileSync(path.join(projectRoot, file), 'utf8') }))
    .filter((entry) => ISSUES.test(entry.source));

  it('findet überhaupt Module, die Nachweise ausstellen', () => {
    // Ohne diese Prüfung wäre der Wächter grün, sobald sich die Funktion
    // umbenennt — und bewiese dann nichts mehr.
    expect(modules.length).toBeGreaterThanOrEqual(5);
  });

  it.each(modules.map((entry) => [entry.file, entry] as const))(
    '%s stellt zu',
    (_name, entry) => {
      expect(DELIVERS.test(entry.source)).toBe(true);
    },
  );

  it('schlägt an, wenn ein Modul einen Nachweis ausstellt und nichts zustellt', () => {
    // Der Gegenbeweis: So sah `organization-admin.ts` vor der Behebung aus.
    const verstoß = [
      "const token = generateRedemptionToken();",
      "await createInvitation({ tokenHash: hashToken(token) });",
      "return ok({ token });",
    ].join('\n');

    expect(ISSUES.test(verstoß)).toBe(true);
    expect(DELIVERS.test(verstoß)).toBe(false);
  });
});
