/**
 * FIXTURE — kein Produktionscode.
 *
 * Verletzt absichtlich die Schichtenregel für die Anzeigeschicht: Die
 * Oberfläche greift nicht unmittelbar auf Persistenz oder Infrastruktur zu.
 * Wird von tests/architecture/layering.test.ts gelintet.
 */
import { getPrismaClient } from '@/infrastructure/db/prisma';

export async function violatesUiLayering(): Promise<number> {
  return getPrismaClient().auditLog.count();
}
