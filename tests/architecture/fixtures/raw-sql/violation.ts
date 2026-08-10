/**
 * FIXTURE — kein Produktionscode.
 *
 * Verletzt absichtlich NFA-ARCH-10 (Datenbankzugriff ausschließlich über den
 * ORM). Wird von tests/architecture/no-raw-sql.test.ts gelintet.
 */
import { getPrismaClient } from '@/infrastructure/db/prisma';

export async function violatesOrmOnlyAccess(entityType: string): Promise<unknown> {
  return getPrismaClient().$queryRawUnsafe(
    `SELECT * FROM AuditLog WHERE entityType = '${entityType}'`,
  );
}
