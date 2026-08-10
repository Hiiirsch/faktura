/**
 * Zusammenstellung für die Seite „Sicherheit" (NFA-SEC-05, -09).
 *
 * Eine einzige Abfrage für die gesamte Seite, damit der angezeigte Zustand in
 * sich stimmig ist.
 */
import { getPrismaClient } from '@/infrastructure/db/prisma';

import { listSessions, type SessionSummary } from './session-service';

export type SecurityOverview = {
  readonly totpEnabled: boolean;
  readonly unusedRecoveryCodes: number;
  readonly sessions: readonly SessionSummary[];
};

export async function getSecurityOverview(
  userId: string,
  currentSessionId: string,
): Promise<SecurityOverview> {
  const prisma = getPrismaClient();

  const [user, unusedRecoveryCodes, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpEnabled: true },
    }),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
    listSessions(userId, currentSessionId),
  ]);

  return {
    totpEnabled: user.totpEnabled,
    unusedRecoveryCodes,
    sessions,
  };
}
