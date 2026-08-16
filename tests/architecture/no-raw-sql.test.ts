/**
 * NFA-ARCH-10 — Der Datenbankzugriff erfolgt ausschließlich über den ORM;
 * es existieren keine **ungeprüften** Roh-SQL-Aufrufe.
 *
 * Drei Prüfungen: Die Lint-Regel muss bei einem Roh-SQL-Aufruf anschlagen, der
 * Quellcode darf außerhalb der einen erlaubten Datei keinen enthalten — und
 * diese eine Datei muss die eine bleiben.
 *
 * **Warum es überhaupt eine gibt.** Seit M7 erzeugt die Anwendung selbst
 * Sicherungen (NFA-BETR-05). Eine konsistente Sicherung verlangt
 * `VACUUM INTO`; Prisma kennt dafür keine Entsprechung, und die Alternative —
 * die Datei im laufenden Betrieb kopieren — verbietet NFA-BETR-04
 * ausdrücklich. Das Wort „ungeprüft" in NFA-ARCH-10 lässt genau diesen Fall
 * zu: einen Aufruf, dessen Argument nie aus einer Anfrage stammt und der an
 * einer Stelle liegt, die man im Diff sieht.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourceRoot = path.join(projectRoot, 'src');

const RAW_SQL_PATTERN = /\$(?:queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe|queryRawTyped)\b/;

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSourceFiles(fullPath);
      }
      return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
    }),
  );
  return files.flat();
}

describe('NFA-ARCH-10 Datenbankzugriff nur über den ORM', () => {
  it('meldet einen Roh-SQL-Aufruf', async () => {
    const eslint = new ESLint({ cwd: projectRoot, ignore: false });
    const results = await eslint.lintFiles(['tests/architecture/fixtures/raw-sql/violation.ts']);

    const messages = results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === 'no-restricted-syntax');

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]?.message).toContain('kein Roh-SQL');
  });

  /**
   * Die eine erlaubte Stelle. Als Liste und nicht als Kommentar, damit ein
   * zweiter Aufruf den Test bricht statt nur eine Regel zu verletzen, an die
   * sich niemand erinnert.
   */
  const ALLOWED = ['src/infrastructure/db/backup.ts'];

  it('enthält im Quellcode keinen Roh-SQL-Aufruf außerhalb der Sicherung', async () => {
    const files = await collectSourceFiles(sourceRoot);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const relative = path.relative(projectRoot, file);
      if (ALLOWED.includes(relative)) {
        continue;
      }
      const contents = await readFile(file, 'utf8');
      if (RAW_SQL_PATTERN.test(contents)) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('beschränkt die Ausnahme auf genau einen Aufruf', async () => {
    const contents = await readFile(path.join(projectRoot, ALLOWED[0] ?? ''), 'utf8');
    // Ohne Kommentare gezählt: Die Datei erklärt die Ausnahme ausführlich und
    // nennt den Aufruf dabei beim Namen.
    const code = contents.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const calls = code.match(/\$(?:queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe|queryRawTyped)\b/g);

    // Genau einer, und genau `VACUUM INTO`.
    expect(calls).toHaveLength(1);
    expect(contents).toContain('VACUUM INTO');
  });
});
