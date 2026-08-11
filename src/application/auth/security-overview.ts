/**
 * Zusammenstellung für die Seite „Sicherheit" (NFA-SEC-05, -09).
 *
 * Eine einzige Abfrage für die gesamte Seite, damit der angezeigte Zustand in
 * sich stimmig ist.
 */
import {
  countUnusedRecoveryCodes,
  findUserById,
} from '@/infrastructure/repositories/auth-repository';

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
  const [user, unusedRecoveryCodes, sessions] = await Promise.all([
    findUserById(userId),
    countUnusedRecoveryCodes(userId),
    listSessions(userId, currentSessionId),
  ]);

  return {
    totpEnabled: user?.totpEnabled ?? false,
    unusedRecoveryCodes,
    sessions,
  };
}
