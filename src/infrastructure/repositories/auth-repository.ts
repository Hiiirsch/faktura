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
import type {
  PasswordReset,
  PendingLogin,
  Prisma,
  RecoveryCode,
  Session,
  TrustedDevice,
  User,
} from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';

export type { PasswordReset, PendingLogin, RecoveryCode, Session, TrustedDevice, User };

/**
 * Die Sitzung mit allem, was die Auflösung braucht (M8).
 *
 * Seit M8 kommen drei Dinge dazu, und alle drei sind Abweisungsgründe:
 * `disabledAt` am Konto, `suspendedAt` an der Organisation und die
 * Berechtigungen der Rolle. Sie werden **in derselben Abfrage** geladen — würde
 * die Sitzung erst aufgelöst und die Sperre danach geprüft, gäbe es ein Fenster,
 * in dem ein gesperrtes Konto arbeitet.
 */
const forSession = {
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      organizationId: true,
      disabledAt: true,
      organization: { select: { suspendedAt: true } },
      role: {
        select: {
          id: true,
          name: true,
          permissions: { select: { permissionKey: true } },
        },
      },
    },
  },
} satisfies Prisma.SessionInclude;

export type SessionWithUser = Prisma.SessionGetPayload<{ include: typeof forSession }>;

// ─── Konten ─────────────────────────────────────────────────────────────────

/**
 * Das Konto samt Sperrzustand seines Unternehmens (M8).
 *
 * Die Stilllegung wird mitgeladen, weil die Anmeldung sie prüfen muss und eine
 * zweite Abfrage ein Fenster dazwischen ließe.
 */
export type UserWithOrganizationState = Prisma.UserGetPayload<{
  include: { organization: { select: { suspendedAt: true } } };
}>;

export async function findUserByEmail(
  email: string,
): Promise<UserWithOrganizationState | null> {
  return clientFor(undefined).user.findUnique({
    where: { email },
    include: { organization: { select: { suspendedAt: true } } },
  });
}

/**
 * Das Konto samt Sperrzustand seines Unternehmens.
 *
 * Dieselbe Projektion wie `findUserByEmail`, aus demselben Grund: Wo ein Konto
 * geladen wird, um etwas damit zu tun, gehören die beiden Abweisungsgründe
 * (`disabledAt`, `Organization.suspendedAt`) in dieselbe Abfrage. Eine zweite
 * ließe ein Fenster dazwischen — und ein Aufrufer, der sie vergisst, hätte kein
 * Fenster, sondern ein Loch.
 */
export async function findUserById(id: string): Promise<UserWithOrganizationState | null> {
  return clientFor(undefined).user.findUnique({
    where: { id },
    include: { organization: { select: { suspendedAt: true } } },
  });
}

/**
 * Legt ein Konto an.
 *
 * Der Handle ist nicht schmückend: Beim Annehmen einer Einladung entsteht das
 * Konto **innerhalb** derselben Transaktion, die die Einladung verbraucht — und
 * SQLite hat genau einen Schreiber. Ohne den Handle liefe die Anlage auf der
 * Verbindung außerhalb der Transaktion und wartete auf eine Sperre, die die
 * Transaktion hält, bis der Socket-Timeout zuschlägt.
 */
export async function createUser(
  data: Prisma.UserUncheckedCreateInput,
  handle?: TransactionHandle,
): Promise<User> {
  return clientFor(handle).user.create({ data });
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
    include: forSession,
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
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).session.deleteMany({
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

// ─── Zwischenzustand der Anmeldung ──────────────────────────────────────────

/**
 * Der Nachweis zwischen Passwort und zweitem Faktor (M6.2).
 *
 * Er hängt am Konto und fällt damit unter dieselbe dokumentierte Ausnahme wie
 * Sitzungen: Zu diesem Zeitpunkt ist der Mandant zwar bekannt, aber der Zugriff
 * erfolgt über den Tokenhash, nicht über die Organisation.
 */
export async function createPendingLogin(
  data: Prisma.PendingLoginUncheckedCreateInput,
): Promise<void> {
  await clientFor(undefined).pendingLogin.create({ data });
}

export async function findPendingLoginByHash(tokenHash: string): Promise<PendingLogin | null> {
  return clientFor(undefined).pendingLogin.findUnique({ where: { tokenHash } });
}

export async function deletePendingLogin(id: string): Promise<void> {
  await clientFor(undefined).pendingLogin.delete({ where: { id } }).catch(() => undefined);
}

/**
 * Räumt ältere Nachweise desselben Kontos ab.
 *
 * Aufgerufen beim Anlegen eines neuen: Wer sich zweimal hintereinander
 * anmeldet, soll nicht zwei gültige Nachweise hinterlassen — der erste wäre
 * ein offenes Zeitfenster, von dem niemand mehr weiß.
 */
export async function deletePendingLoginsForUser(userId: string): Promise<void> {
  await clientFor(undefined).pendingLogin.deleteMany({ where: { userId } });
}

/** Dasselbe für ein Betreiberkonto (M8). */
export async function deletePendingLoginsForAdmin(adminUserId: string): Promise<void> {
  await clientFor(undefined).pendingLogin.deleteMany({ where: { adminUserId } });
}

/**
 * Entfernt abgelaufene Nachweise.
 *
 * Wie bei den Sitzungen räumt sich die Tabelle im laufenden Betrieb selbst
 * auf, statt auf einen geplanten Auftrag zu warten.
 */
export async function deleteExpiredPendingLogins(now: Date): Promise<void> {
  await clientFor(undefined).pendingLogin.deleteMany({ where: { expiresAt: { lte: now } } });
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

// ─── Passwortzurücksetzungen (M8, FA-MEMB-04) ───────────────────────────────
//
// Hier und nicht in `member-repository.ts`, obwohl die Rechteverwaltung sie
// auslöst: Ein Zurücksetzungsnachweis ist dasselbe wie ein `PendingLogin` und
// ein Wiederherstellungscode — ein einmalig einlösbares Geheimnis am Konto, das
// als Hash liegt und über den Token gefunden wird. Wer ihn einlöst, hat keine
// Sitzung und keine Organisation; die Zugehörigkeit ist das Ergebnis.
//
// Die **Berechtigung**, ihn auszustellen, prüft die Anwendungsschicht: Sie
// bestätigt über `findMember(context, id)`, dass das Konto zum eigenen
// Unternehmen gehört, und stellt ihn erst danach aus.

export async function createPasswordReset(
  data: { readonly userId: string; readonly tokenHash: string; readonly expiresAt: Date },
  handle?: TransactionHandle,
): Promise<PasswordReset> {
  return clientFor(handle).passwordReset.create({ data });
}

export async function findPasswordResetByHash(tokenHash: string): Promise<PasswordReset | null> {
  return clientFor(undefined).passwordReset.findUnique({ where: { tokenHash } });
}

export async function markPasswordResetUsed(
  id: string,
  usedAt: Date,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).passwordReset.update({ where: { id }, data: { usedAt } });
}

/**
 * Verwirft die noch nicht eingelösten Nachweise eines Kontos.
 *
 * Aufgerufen vor jedem Ausstellen und nach jedem Einlösen — dieselbe Regel wie
 * beim zweiten Anmeldeschritt: Ein neuer Nachweis entwertet ältere. Zwei
 * gleichzeitig gültige Links wären zwei Wege zu einem Passwort, und der
 * ältere läge länger irgendwo herum.
 */
export async function deleteUnusedPasswordResets(
  userId: string,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).passwordReset.deleteMany({ where: { userId, usedAt: null } });
}

// ─── Vertraute Geräte (M9, FA-TRUST-*) ──────────────────────────────────────
//
// Hier und nicht in einer eigenen Datei: Ein vertrautes Gerät ist dasselbe wie
// eine Sitzung und ein `PendingLogin` — ein Nachweis am Konto, der als Hash
// liegt und über seinen Token gefunden wird.

export async function createTrustedDevice(
  data: {
    readonly userId: string;
    readonly tokenHash: string;
    readonly userAgent: string | null;
    readonly ipAddress: string | null;
    readonly expiresAt: Date;
    readonly lastUsedAt: Date;
  },
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).trustedDevice.create({ data });
}

/**
 * Das vertraute Gerät zu einem Tokenhash — **gebunden an das Konto**.
 *
 * `userId` steht in der Bedingung, nicht in einer Prüfung danach. Ohne diese
 * Bindung wäre ein entwendetes Cookie ein Universalschlüssel: Es überspränge den
 * zweiten Faktor für jedes Konto, dessen Passwort der Angreifer kennt.
 */
export async function findTrustedDevice(
  userId: string,
  tokenHash: string,
): Promise<TrustedDevice | null> {
  return clientFor(undefined).trustedDevice.findFirst({ where: { userId, tokenHash } });
}

export async function touchTrustedDevice(id: string, lastUsedAt: Date): Promise<void> {
  await clientFor(undefined).trustedDevice.update({ where: { id }, data: { lastUsedAt } });
}

export async function listTrustedDevicesForUser(
  userId: string,
): Promise<readonly TrustedDevice[]> {
  return clientFor(undefined).trustedDevice.findMany({
    where: { userId },
    orderBy: { lastUsedAt: 'desc' },
  });
}

/** Die Einschränkung auf `userId` verhindert, dass ein fremdes Gerät endet. */
export async function deleteTrustedDevice(userId: string, id: string): Promise<boolean> {
  const result = await clientFor(undefined).trustedDevice.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

/**
 * Verwirft **alle** vertrauten Geräte eines Kontos.
 *
 * Aufgerufen von jedem Ereignis, das den Verdacht auf Verlust begründet:
 * Passwortzurücksetzung, Abschalten des zweiten Faktors, Sperren des Kontos,
 * „alle anderen Sitzungen beenden". Ohne diese Aufrufe wäre ein vertrautes Gerät
 * die Stelle, an der eine Zurücksetzung wirkungslos bleibt.
 */
export async function deleteTrustedDevicesForUser(
  userId: string,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).trustedDevice.deleteMany({ where: { userId } });
}
