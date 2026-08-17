/**
 * Anmeldung an der zentralen Verwaltung (M8, FA-ADM-01, FA-ADM-08).
 *
 * Zweistufig wie die Mandantenanmeldung seit M6.2 — mit einem Unterschied:
 * **Der zweite Faktor ist hier nicht wahlweise, sondern immer.** Wer
 * Unternehmen anlegen und sperren kann, sichert sich mit mehr als einem
 * Passwort. `scripts/create-admin.ts` richtet ihn deshalb schon beim Anlegen
 * ein; ein Betreiberkonto ohne zweiten Faktor entsteht gar nicht erst.
 *
 * Wiederherstellungscodes gibt es für Betreiberkonten **nicht**. Sie hängen in
 * `RecoveryCode` am `User`, und eine Spiegeltabelle für eine Handvoll
 * Adminkonten wäre Aufwand ohne Ertrag. Der Weg zurück ist
 * `npm run admin:create` auf dem Server: Wer Shellzugang hat, hat ohnehin die
 * Datenbank.
 *
 * Der Zwischenzustand teilt sich die Tabelle `PendingLogin` mit der
 * Mandantenanmeldung — sie trägt seit M8 entweder `userId` **oder**
 * `adminUserId`, festgehalten durch eine CHECK-Bedingung. Zwei Tabellen für
 * denselben kurzlebigen Nachweis wären zwei Ablaufregeln, die auseinanderlaufen
 * können.
 */
import {
  clearFailedAttempts,
  isLocked,
  type LockoutState,
  registerFailedAttempt,
  remainingLockoutMs,
} from '@/domain/auth/lockout-policy';
import {
  isPendingLoginExpired,
  pendingLoginExpiry,
} from '@/domain/auth/pending-login-policy';
import { isWellFormedTotpCode } from '@/domain/auth/totp-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import { hashPassword, verifyPassword } from '@/infrastructure/auth/password-hasher';
import { generateSessionToken, hashToken } from '@/infrastructure/auth/tokens';
import { verifyTotpCode } from '@/infrastructure/auth/totp';
import { getEnv } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import {
  createPendingLogin,
  deleteExpiredPendingLogins,
  deletePendingLogin,
  deletePendingLoginsForAdmin,
  findPendingLoginByHash,
} from '@/infrastructure/repositories/auth-repository';
import {
  findAdminUserByEmail,
  findAdminUserById,
  updateAdminUser,
} from '@/infrastructure/repositories/platform-repository';

import {
  createAdminSession,
  type IssuedAdminSession,
  type RequestContext,
} from './admin-session-service';

export type AdminLoginInput = {
  readonly email: string;
  readonly password: string;
};

export type AdminLoginError =
  /** Ununterscheidbar für unbekanntes Konto und falsches Passwort. */
  | { readonly kind: 'INVALID_CREDENTIALS' }
  | { readonly kind: 'LOCKED'; readonly remainingMinutes: number };

export type PendingAdminSecondFactor = {
  readonly token: string;
  readonly expiresAt: Date;
};

export type AdminSecondFactorError =
  | { readonly kind: 'NO_PENDING_LOGIN' }
  | { readonly kind: 'INVALID_CODE' }
  | { readonly kind: 'LOCKED'; readonly remainingMinutes: number };

/**
 * Vergleichshash für nicht existierende Konten — ohne ihn wäre eine Anmeldung
 * mit unbekannter Adresse messbar schneller als eine mit bekannter.
 */
let decoyHash: string | undefined;

async function getDecoyHash(): Promise<string> {
  decoyHash ??= await hashPassword('kein-betreiberkonto-mit-dieser-adresse');
  return decoyHash;
}

function toLockoutState(admin: { failedLogins: number; lockedUntil: Date | null }): LockoutState {
  return { failedLogins: admin.failedLogins, lockedUntil: admin.lockedUntil };
}

async function registerFailure(
  adminUserId: string,
  state: LockoutState,
  ipAddress: string | null,
  now: Date,
): Promise<void> {
  const next = registerFailedAttempt(state, now);

  await updateAdminUser(adminUserId, {
    failedLogins: next.failedLogins,
    lockedUntil: next.lockedUntil,
  });

  logger.security('admin.login_failed', {
    adminUserId,
    ipAddress,
    failedLogins: next.failedLogins,
  });

  if (next.lockedUntil !== null) {
    logger.security(
      'admin.account_locked',
      { adminUserId, ipAddress, lockedUntil: next.lockedUntil },
      'error',
    );
  }
}

/**
 * Erster Schritt: E-Mail und Passwort.
 *
 * Endet **immer** mit einem Nachweis, nie mit einer Sitzung — anders als bei
 * Mandantenkonten, die ohne zweiten Faktor sofort angemeldet sind.
 */
export async function adminLogin(
  input: AdminLoginInput,
  context: RequestContext,
  now: Date = new Date(),
): Promise<Result<PendingAdminSecondFactor, AdminLoginError>> {
  const email = input.email.trim().toLowerCase();
  const admin = await findAdminUserByEmail(email);

  if (admin === null || admin.disabledAt !== null) {
    // Gleicher Rechenaufwand wie bei einem existierenden Konto.
    await verifyPassword(await getDecoyHash(), input.password);
    return err({ kind: 'INVALID_CREDENTIALS' });
  }

  const lockout = toLockoutState(admin);
  if (isLocked(lockout, now)) {
    return err({
      kind: 'LOCKED',
      remainingMinutes: Math.ceil(remainingLockoutMs(lockout, now) / 60_000),
    });
  }

  if (!(await verifyPassword(admin.passwordHash, input.password))) {
    await registerFailure(admin.id, lockout, context.ipAddress, now);
    return err({ kind: 'INVALID_CREDENTIALS' });
  }

  const token = generateSessionToken();
  await deleteExpiredPendingLogins(now);
  await deletePendingLoginsForAdmin(admin.id);
  await createPendingLogin({
    adminUserId: admin.id,
    tokenHash: hashToken(token),
    ipAddress: context.ipAddress,
    expiresAt: pendingLoginExpiry(now),
    createdAt: now,
  });

  return ok({ token, expiresAt: pendingLoginExpiry(now) });
}

/** Zweiter Schritt: der Bestätigungscode. */
export async function completeAdminSecondFactor(
  token: string,
  code: string,
  context: RequestContext,
  now: Date = new Date(),
): Promise<Result<IssuedAdminSession, AdminSecondFactorError>> {
  const pending = await findPendingLoginByHash(hashToken(token));

  // Ein Nachweis ohne `adminUserId` gehört der Mandantenanmeldung und ist hier
  // so wenig wert wie ein unbekannter.
  if (pending === null || pending.adminUserId === null) {
    return err({ kind: 'NO_PENDING_LOGIN' });
  }

  if (isPendingLoginExpired(pending.expiresAt, now)) {
    await deletePendingLogin(pending.id);
    return err({ kind: 'NO_PENDING_LOGIN' });
  }

  const admin = await findAdminUserById(pending.adminUserId);
  if (admin === null || admin.disabledAt !== null || admin.totpSecret === null) {
    await deletePendingLogin(pending.id);
    return err({ kind: 'NO_PENDING_LOGIN' });
  }

  const lockout = toLockoutState(admin);
  if (isLocked(lockout, now)) {
    await deletePendingLogin(pending.id);
    return err({
      kind: 'LOCKED',
      remainingMinutes: Math.ceil(remainingLockoutMs(lockout, now) / 60_000),
    });
  }

  const submitted = code.trim();
  const valid =
    isWellFormedTotpCode(submitted) &&
    verifyTotpCode(admin.totpSecret, submitted, getEnv().APP_NAME);

  if (!valid) {
    await registerFailure(admin.id, lockout, context.ipAddress, now);
    return err({ kind: 'INVALID_CODE' });
  }

  const cleared = clearFailedAttempts();
  await updateAdminUser(admin.id, {
    failedLogins: cleared.failedLogins,
    lockedUntil: cleared.lockedUntil,
    lastLoginAt: now,
  });

  await deletePendingLogin(pending.id);
  const session = await createAdminSession(admin.id, context, now);

  logger.security(
    'admin.login_succeeded',
    { adminUserId: admin.id, ipAddress: context.ipAddress },
    'info',
  );

  return ok(session);
}
