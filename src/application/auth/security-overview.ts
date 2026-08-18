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

import {
  listSessions,
  listTrustedDevices,
  type SessionSummary,
  type TrustedDeviceSummary,
} from './session-service';

export type SecurityOverview = {
  readonly totpEnabled: boolean;
  readonly unusedRecoveryCodes: number;
  readonly sessions: readonly SessionSummary[];
  /** Vertraute Geräte (M9, FA-TRUST-05) — sichtbar, damit widerrufbar. */
  readonly trustedDevices: readonly TrustedDeviceSummary[];
};

export async function getSecurityOverview(
  userId: string,
  currentSessionId: string,
): Promise<SecurityOverview> {
  const [user, unusedRecoveryCodes, sessions, trustedDevices] = await Promise.all([
    findUserById(userId),
    countUnusedRecoveryCodes(userId),
    listSessions(userId, currentSessionId),
    listTrustedDevices(userId),
  ]);

  return {
    totpEnabled: user?.totpEnabled ?? false,
    unusedRecoveryCodes,
    sessions,
    trustedDevices,
  };
}
