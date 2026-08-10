/**
 * FIXTURE — kein Produktionscode.
 *
 * Diese Datei verletzt absichtlich die Schichtenregel aus NFA-ARCH-01. Sie wird
 * von tests/architecture/layering.test.ts gelintet, um nachzuweisen, dass das
 * Regelwerk solche Importe tatsächlich meldet. Vom regulären Lint-Lauf und vom
 * Build ist sie ausgenommen.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

import { messages } from '@/i18n/de';

export function violatesLayering(path: string): string {
  const client = new PrismaClient();
  const contents = readFileSync(path, 'utf8');
  return `${messages.app.name}:${contents}:${String(client)}`;
}
