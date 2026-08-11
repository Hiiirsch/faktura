/**
 * Verwaltung von Sitzungen (NFA-SEC-06, -07, -09).
 *
 * Hier entsteht der Mandantenkontext: Die aufgelöste Sitzung führt ihn mit
 * sich (`ActiveSession.organization`). Jede Seite und jede Server Action hat
 * ihn damit zur Hand, ohne ihn selbst herzuleiten — und ohne die Möglichkeit,
 * die falsche Organisation zu wählen.
 */
import {
  computeSessionExpiry,
  isSessionExpired,
  shouldTouchSession,
} from '@/domain/auth/session-policy';
import { generateSessionToken, hashToken } from '@/infrastructure/auth/tokens';
import {
  createSessionRow,
  deleteSession,
  deleteSessionByTokenHash,
  deleteSessionsForUser,
  findSessionByTokenHash,
  listSessionsForUser,
  revokeSessionForUser,
  touchSession,
} from '@/infrastructure/repositories/auth-repository';
import {
  type OrganizationContext,
  organizationContextOf,
} from '@/infrastructure/repositories/organization-context';

/**
 * Der Mandantenkontext, wie ihn Seiten und Server Actions weiterreichen.
 *
 * Erneut ausgeführt, weil `src/app` nicht unmittelbar aus der
 * Infrastrukturschicht importieren darf (Schichtregel, NFA-ARCH-01).
 */
export type { OrganizationContext };

export type RequestContext = {
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
};

export type ActiveSession = {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly expiresAt: Date;
  /** Der Mandant, dessen Daten diese Sitzung sehen darf. */
  readonly organization: OrganizationContext;
};

export type SessionSummary = {
  readonly id: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly isCurrent: boolean;
};

export type IssuedSession = {
  readonly token: string;
  readonly expiresAt: Date;
};

export async function createSession(
  userId: string,
  context: RequestContext,
  now: Date = new Date(),
): Promise<IssuedSession> {
  const token = generateSessionToken();
  const expiresAt = computeSessionExpiry(now);

  await createSessionRow({
    userId,
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
 * Löst ein Sitzungstoken auf. Eine abgelaufene Sitzung wird dabei gleich
 * entfernt, statt nur abgelehnt zu werden — so räumt sich die Tabelle im
 * laufenden Betrieb selbst auf, ohne geplanten Auftrag.
 */
export async function resolveSession(
  token: string,
  now: Date = new Date(),
): Promise<ActiveSession | null> {
  const session = await findSessionByTokenHash(hashToken(token));

  if (session === null) {
    return null;
  }

  if (isSessionExpired(session.expiresAt, now)) {
    await deleteSession(session.id);
    return null;
  }

  if (shouldTouchSession(session.lastSeenAt, now)) {
    await touchSession(session.id, now);
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    email: session.user.email,
    expiresAt: session.expiresAt,
    organization: organizationContextOf(session.user.organizationId),
  };
}

export async function listSessions(
  userId: string,
  currentSessionId: string,
): Promise<readonly SessionSummary[]> {
  const sessions = await listSessionsForUser(userId);

  return sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    isCurrent: session.id === currentSessionId,
  }));
}

/** Beendet eine einzelne Sitzung. Die Einschränkung auf `userId` verhindert,
 * dass eine fremde Sitzungskennung beendet werden kann. */
export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  return revokeSessionForUser(userId, sessionId);
}

/** „Überall abmelden" (Spec §11.1). Die aufrufende Sitzung kann ausgenommen werden. */
export async function revokeAllSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  return deleteSessionsForUser(userId, exceptSessionId);
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await deleteSessionByTokenHash(hashToken(token));
}
