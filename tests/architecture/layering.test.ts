/**
 * NFA-ARCH-01 — Die Domain-Schicht enthält keine Importe aus Persistenz-, UI-
 * oder Framework-Modulen; ein Lint-Regelwerk erzwingt dies.
 *
 * Die Anforderung ist mit „T" verifiziert. Eine konfigurierte Regel allein
 * belegt das nicht: Sie könnte falsch eingehängt, überschrieben oder wirkungslos
 * sein. Dieser Test führt ESLint deshalb programmatisch aus und prüft beides —
 * dass die Regel bei einem Verstoß anschlägt und dass die echte Domain-Schicht
 * sauber ist.
 */
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

function createLinter(): ESLint {
  // `ignore: false` hebt die globale Ausnahme für das Fixture-Verzeichnis auf.
  return new ESLint({ cwd: projectRoot, ignore: false });
}

describe('NFA-ARCH-01 Schichtentrennung', () => {
  it('meldet verbotene Importe in der Domain-Schicht', async () => {
    const results = await createLinter().lintFiles([
      'tests/architecture/fixtures/domain/violation.ts',
    ]);

    const messages = results.flatMap((result) => result.messages);
    const restrictedImportMessages = messages.filter(
      (message) => message.ruleId === '@typescript-eslint/no-restricted-imports',
    );

    expect(restrictedImportMessages.length).toBeGreaterThanOrEqual(3);

    const combined = restrictedImportMessages.map((message) => message.message).join('\n');
    expect(combined).toContain('Persistenzmodule');
    expect(combined).toContain('Node-Builtins');
    expect(combined).toContain('äußere Schichten');
  });

  it('meldet Zugriffe der Anzeigeschicht auf die Infrastruktur', async () => {
    const results = await createLinter().lintFiles([
      'tests/architecture/fixtures/ui/violation.ts',
    ]);

    const restrictedImportMessages = results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === '@typescript-eslint/no-restricted-imports');

    expect(restrictedImportMessages.length).toBeGreaterThanOrEqual(1);
    expect(restrictedImportMessages[0]?.message).toContain('äußere Schichten');
  });

  it('verwehrt der Anwendungsschicht den unmittelbaren Prisma-Zugriff (M5.5a)', async () => {
    const results = await createLinter().lintFiles([
      'tests/architecture/fixtures/persistence/violation.ts',
    ]);

    const restrictedImportMessages = results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === '@typescript-eslint/no-restricted-imports');

    // Zwei Verstöße: der Typimport aus @prisma/client und getPrismaClient selbst.
    expect(restrictedImportMessages.length).toBeGreaterThanOrEqual(2);

    const combined = restrictedImportMessages.map((message) => message.message).join('\n');
    expect(combined).toContain('src/infrastructure/repositories');
  });

  it('erlaubt der Repository-Schicht genau diesen Zugriff', async () => {
    const results = await new ESLint({ cwd: projectRoot }).lintFiles([
      'src/infrastructure/repositories/**/*.ts',
    ]);

    expect(results.length).toBeGreaterThan(0);

    const problems = results.flatMap((result) =>
      result.messages.map((message) => ({
        file: result.filePath.replace(projectRoot, ''),
        rule: message.ruleId,
        message: message.message,
      })),
    );

    expect(problems).toEqual([]);
  });

  it('hält die tatsächliche Domain-Schicht frei von Verstößen', async () => {
    const results = await new ESLint({ cwd: projectRoot }).lintFiles(['src/domain/**/*.ts']);

    expect(results.length).toBeGreaterThan(0);

    const problems = results.flatMap((result) =>
      result.messages.map((message) => ({
        file: result.filePath.replace(projectRoot, ''),
        rule: message.ruleId,
        message: message.message,
      })),
    );

    expect(problems).toEqual([]);
  });

  it('erlaubt der Domain-Schicht Importe innerhalb der eigenen Schicht', async () => {
    const results = await new ESLint({ cwd: projectRoot }).lintFiles([
      'src/domain/quantity/quantity.ts',
    ]);

    const errors = results.flatMap((result) => result.messages);
    expect(errors).toEqual([]);
  });
});
