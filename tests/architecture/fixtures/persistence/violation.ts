/**
 * Fixture für den Nachweis zu M5.5a: Eine Datei der Anwendungsschicht greift
 * unmittelbar auf den Prisma-Client zu, statt über ein Repository mit
 * Organisationskontext.
 *
 * Sie wird niemals ausgeführt. `tests/architecture/layering.test.ts` lintet sie
 * gezielt und erwartet, dass die Regel anschlägt.
 */
import type { PrismaClient } from '@prisma/client';

import { getPrismaClient } from '@/infrastructure/db/prisma';

export function unscopedClient(): PrismaClient {
  return getPrismaClient();
}
