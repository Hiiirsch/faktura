/**
 * NFA-ARCH-10 — Der Datenbankzugriff erfolgt ausschließlich über den ORM;
 * es existieren keine ungeprüften Roh-SQL-Aufrufe.
 *
 * Zwei Prüfungen: Die Lint-Regel muss bei einem Roh-SQL-Aufruf anschlagen, und
 * der reale Quellcode darf keinen enthalten.
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

  it('enthält im Quellcode keinen Roh-SQL-Aufruf', async () => {
    const files = await collectSourceFiles(sourceRoot);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const contents = await readFile(file, 'utf8');
      if (RAW_SQL_PATTERN.test(contents)) {
        offenders.push(path.relative(projectRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
