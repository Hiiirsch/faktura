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
   * **Seit M17 leer.** Bis dahin stand hier `src/infrastructure/db/backup.ts`:
   * Die Sicherung brauchte `VACUUM INTO`, wofür Prisma keine Entsprechung hat.
   * Mit PostgreSQL erzeugt `pg_dump` den Abzug, und die Ausnahme ist
   * weggefallen statt umgeschrieben worden.
   *
   * Die Liste bleibt als Liste stehen, damit eine künftige Ausnahme hier
   * eingetragen und damit sichtbar werden muss.
   */
  const ALLOWED: readonly string[] = [];

  it('enthält im Quellcode keinen einzigen Roh-SQL-Aufruf mehr', async () => {
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

  it('braucht für die Sicherung keine Ausnahme mehr', async () => {
    // Die Gegenprobe zur leeren Liste: Wer `pg_dump` durch einen SQL-Aufruf
    // ersetzt, bricht diesen Test — und muss die Ausnahme bewusst wieder
    // eintragen, statt sie unbemerkt zu erben.
    const backup = await readFile(path.join(sourceRoot, 'infrastructure/db/backup.ts'), 'utf8');

    expect(RAW_SQL_PATTERN.test(backup)).toBe(false);
    expect(backup).toContain('pg_dump');
  });

});
