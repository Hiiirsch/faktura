/**
 * Konten, Sitzungen und Wiederherstellungscodes.
 *
 * **Die dokumentierte Ausnahme von der Kontextpflicht.** Die Anmeldung löst
 * allein über die E-Mail-Adresse auf — zu dem Zeitpunkt ist noch nicht bekannt,
 * zu welcher Organisation sie gehört; genau das ist das Ergebnis der Abfrage.
 * `User.email` ist deshalb global eindeutig, und diese Funktionen nehmen keinen
 * `OrganizationContext`.
 *
 * Die Abgrenzung entsteht danach: Aus dem gefundenen Konto entsteht der
 * Kontext, und jeder weitere Zugriff läuft mit ihm. Sitzungen und
 * Wiederherstellungscodes hängen am Konto, nicht an der Organisation; sie
 * tragen die Spalte deshalb nicht.
 */
import type { Prisma, RecoveryCode, Session, User } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';

export type { RecoveryCode, Session, User };

export type SessionWithUser = Prisma.SessionGetPayload<{
  include: { user: { select: { id: true; email: true; organizationId: true } } };
}>;

// ─── Konten ─────────────────────────────────────────────────────────────────

export async function findUserByEmail(email: string): Promise<User | null> {
  return clientFor(undefined).user.findUnique({ where: { email } });
}

export async function findUserById(id: string): Promise<User | null> {
  return clientFor(undefined).user.findUnique({ where: { id } });
}

export async function createUser(data: Prisma.UserUncheckedCreateInput): Promise<User> {
  return clientFor(undefined).user.create({ data });
}

export async function updateUser(
  id: string,
  data: Prisma.UserUncheckedUpdateInput,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).user.update({ where: { id }, data });
}

// ─── Sitzungen ──────────────────────────────────────────────────────────────

export async function createSessionRow(data: Prisma.SessionUncheckedCreateInput): Promise<void> {
  await clientFor(undefined).session.create({ data });
}

export async function findSessionByTokenHash(tokenHash: string): Promise<SessionWithUser | null> {
  return clientFor(undefined).session.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, organizationId: true } } },
  });
}

export async function listSessionsForUser(userId: string): Promise<readonly Session[]> {
  return clientFor(undefined).session.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
  });
}

export async function touchSession(id: string, lastSeenAt: Date): Promise<void> {
  await clientFor(undefined).session.update({ where: { id }, data: { lastSeenAt } });
}

export async function deleteSession(id: string): Promise<void> {
  await clientFor(undefined).session.delete({ where: { id } });
}

/** Die Einschränkung auf `userId` verhindert, dass eine fremde Sitzung endet. */
export async function deleteSessionsForUser(
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const result = await clientFor(undefined).session.deleteMany({
    where: {
      userId,
      ...(exceptSessionId === undefined ? {} : { id: { not: exceptSessionId } }),
    },
  });
  return result.count;
}

export async function deleteSessionByTokenHash(tokenHash: string): Promise<void> {
  await clientFor(undefined).session.deleteMany({ where: { tokenHash } });
}

export async function revokeSessionForUser(userId: string, sessionId: string): Promise<boolean> {
  const result = await clientFor(undefined).session.deleteMany({
    where: { id: sessionId, userId },
  });
  return result.count > 0;
}

// ─── Wiederherstellungscodes ────────────────────────────────────────────────

export async function findRecoveryCodeByHash(codeHash: string): Promise<RecoveryCode | null> {
  return clientFor(undefined).recoveryCode.findUnique({ where: { codeHash } });
}

export async function markRecoveryCodeUsed(id: string, usedAt: Date): Promise<void> {
  await clientFor(undefined).recoveryCode.update({ where: { id }, data: { usedAt } });
}

export async function countUnusedRecoveryCodes(userId: string): Promise<number> {
  return clientFor(undefined).recoveryCode.count({ where: { userId, usedAt: null } });
}

export async function replaceRecoveryCodes(
  userId: string,
  rows: readonly { readonly userId: string; readonly codeHash: string }[],
  handle: TransactionHandle,
): Promise<void> {
  const client = clientFor(handle);
  await client.recoveryCode.deleteMany({ where: { userId } });
  await client.recoveryCode.createMany({ data: [...rows] });
}

export async function deleteRecoveryCodes(
  userId: string,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).recoveryCode.deleteMany({ where: { userId } });
}
