/**
 * Sitzungen der zentralen Verwaltung (M8, FA-ADM-01).
 *
 * Aufgebaut wie `src/application/auth/session-service.ts` und bewusst **nicht**
 * mit ihm verschmolzen: Die beiden Sitzungsarten teilen sich weder Tabelle noch
 * Cookie noch Ablaufregel-Aufrufer. Eine gemeinsame Funktion mit einem
 * Unterscheidungsmerkmal wäre genau die Stelle, an der später jemand das
 * Merkmal vergisst.
 *
 * Was sie sich **doch** teilen, ist die Regel selbst
 * (`src/domain/auth/session-policy.ts`) und die Tokenerzeugung
 * (`infrastructure/auth/tokens.ts`) — reine Funktionen ohne Zustand, bei denen
 * eine zweite Umsetzung nur Gelegenheit zum Auseinanderlaufen wäre.
 *
 * Der entscheidende Unterschied zur Mandantensitzung steht im Rückgabetyp:
 * `AdminSession` führt einen `PlatformContext` und **keinen**
 * `OrganizationContext`. Damit ist jede Abfrage von Geschäftsdaten aus dem
 * Adminbereich ein Übersetzungsfehler (FA-ADM-02).
 */
import {
  computeSessionExpiry,
  isSessionExpired,
  shouldTouchSession,
} from '@/domain/auth/session-policy';
import { generateSessionToken, hashToken } from '@/infrastructure/auth/tokens';
import {
  createAdminSessionRow,
  deleteAdminSession,
  deleteAdminSessionByTokenHash,
  findAdminSessionByTokenHash,
  touchAdminSession,
} from '@/infrastructure/repositories/platform-repository';
import {
  type PlatformContext,
  platformContextOf,
} from '@/infrastructure/repositories/platform-context';

export type { PlatformContext };

export type RequestContext = {
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
};

export type AdminSession = {
  readonly sessionId: string;
  readonly adminUserId: string;
  readonly email: string;
  readonly expiresAt: Date;
  /**
   * Der Betreiberkontext. Es gibt **kein** Feld `organization` — und keine
   * Funktion, die eines herstellt.
   */
  readonly platform: PlatformContext;
};

export type IssuedAdminSession = {
  readonly token: string;
  readonly expiresAt: Date;
};

export async function createAdminSession(
  adminUserId: string,
  context: RequestContext,
  now: Date = new Date(),
): Promise<IssuedAdminSession> {
  const token = generateSessionToken();
  const expiresAt = computeSessionExpiry(now);

  await createAdminSessionRow({
    adminUserId,
    tokenHash: hashToken(token),
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
  });

  return { token, expiresAt };
}

/**
 * Löst ein Admintoken auf.
 *
 * Eine abgelaufene Sitzung wird gleich entfernt — wie bei den
 * Mandantensitzungen räumt sich die Tabelle im Betrieb selbst auf. Ein
 * gesperrtes Betreiberkonto verliert seine Sitzung sofort, nicht erst mit
 * ihrem Ablauf.
 */
export async function resolveAdminSession(
  token: string,
  now: Date = new Date(),
): Promise<AdminSession | null> {
  const session = await findAdminSessionByTokenHash(hashToken(token));

  if (session === null) {
    return null;
  }

  if (isSessionExpired(session.expiresAt, now) || session.adminUser.disabledAt !== null) {
    await deleteAdminSession(session.id);
    return null;
  }

  if (shouldTouchSession(session.lastSeenAt, now)) {
    await touchAdminSession(session.id, now);
  }

  return {
    sessionId: session.id,
    adminUserId: session.adminUser.id,
    email: session.adminUser.email,
    expiresAt: session.expiresAt,
    platform: platformContextOf(session.adminUser.id),
  };
}

export async function endAdminSession(token: string): Promise<void> {
  await deleteAdminSessionByTokenHash(hashToken(token));
}
