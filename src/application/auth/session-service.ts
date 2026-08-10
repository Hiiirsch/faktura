/**
 * Verwaltung von Sitzungen (NFA-SEC-06, -07, -09).
 */
import {
  computeSessionExpiry,
  isSessionExpired,
  shouldTouchSession,
} from '@/domain/auth/session-policy';
import { generateSessionToken, hashToken } from '@/infrastructure/auth/tokens';
import { getPrismaClient } from '@/infrastructure/db/prisma';

export type RequestContext = {
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
};

export type ActiveSession = {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly expiresAt: Date;
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

  await getPrismaClient().session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
    },
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
  const prisma = getPrismaClient();

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true } } },
  });

  if (session === null) {
    return null;
  }

  if (isSessionExpired(session.expiresAt, now)) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  if (shouldTouchSession(session.lastSeenAt, now)) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    email: session.user.email,
    expiresAt: session.expiresAt,
  };
}

export async function listSessions(
  userId: string,
  currentSessionId: string,
): Promise<readonly SessionSummary[]> {
  const sessions = await getPrismaClient().session.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
  });

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
  const result = await getPrismaClient().session.deleteMany({
    where: { id: sessionId, userId },
  });
  return result.count > 0;
}

/** „Überall abmelden" (Spec §11.1). Die aufrufende Sitzung kann ausgenommen werden. */
export async function revokeAllSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const result = await getPrismaClient().session.deleteMany({
    where: {
      userId,
      ...(exceptSessionId === undefined ? {} : { id: { not: exceptSessionId } }),
    },
  });
  return result.count;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await getPrismaClient().session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
