/**
 * Anmeldung (NFA-SEC-04, -05, -07, -08, Spec §11.1).
 *
 * Passwort und zweiter Faktor werden in einem Schritt entgegengenommen. Das
 * erspart einen serverseitigen Zwischenzustand zwischen den beiden Schritten,
 * der selbst wieder abzusichern wäre, und entspricht Spec §10.1 („`/login`:
 * Passwort + TOTP").
 *
 * Das Feld für den zweiten Faktor nimmt wahlweise ein TOTP-Einmalkennwort oder
 * einen Wiederherstellungscode entgegen; beide sind am Format unterscheidbar.
 */
import { isWellFormedRecoveryCode, normalizeRecoveryCode } from '@/domain/auth/recovery-code';
import {
  clearFailedAttempts,
  isLocked,
  type LockoutState,
  registerFailedAttempt,
  remainingLockoutMs,
} from '@/domain/auth/lockout-policy';
import { isWellFormedTotpCode } from '@/domain/auth/totp-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { hashPassword, verifyPassword } from '@/infrastructure/auth/password-hasher';
import { hashToken } from '@/infrastructure/auth/tokens';
import { verifyTotpCode } from '@/infrastructure/auth/totp';
import { getEnv } from '@/infrastructure/config/env';
import {
  findRecoveryCodeByHash,
  findUserByEmail,
  markRecoveryCodeUsed,
  updateUser,
} from '@/infrastructure/repositories/auth-repository';
import {
  type OrganizationContext,
  organizationContextOf,
} from '@/infrastructure/repositories/organization-context';

import { createSession, type IssuedSession, type RequestContext } from './session-service';

export type LoginInput = {
  readonly email: string;
  readonly password: string;
  readonly secondFactor: string;
};

export type LoginError =
  /** Bewusst ununterscheidbar für falsches Konto, falsches Passwort und
   * falschen zweiten Faktor — sonst ließe sich erfragen, welche Adressen
   * existieren. */
  | { readonly kind: 'INVALID_CREDENTIALS' }
  | { readonly kind: 'LOCKED'; readonly remainingMinutes: number };

/**
 * Vergleichshash für nicht existierende Konten. Ohne ihn wäre eine Anmeldung
 * mit unbekannter Adresse messbar schneller als eine mit bekannter, und die
 * Ununterscheidbarkeit der Fehlermeldung wäre wertlos.
 */
let decoyHash: string | undefined;

async function getDecoyHash(): Promise<string> {
  decoyHash ??= await hashPassword('kein-konto-mit-dieser-adresse');
  return decoyHash;
}

function toLockoutState(user: { failedLogins: number; lockedUntil: Date | null }): LockoutState {
  return { failedLogins: user.failedLogins, lockedUntil: user.lockedUntil };
}

/** Prüft den zweiten Faktor: erst TOTP, dann Wiederherstellungscode. */
async function verifySecondFactor(
  userId: string,
  organization: OrganizationContext,
  totpSecret: string,
  submitted: string,
  context: RequestContext,
): Promise<boolean> {
  const issuer = getEnv().APP_NAME;

  if (isWellFormedTotpCode(submitted) && verifyTotpCode(totpSecret, submitted, issuer)) {
    return true;
  }

  if (!isWellFormedRecoveryCode(submitted)) {
    return false;
  }

  const normalized = normalizeRecoveryCode(submitted);
  const candidate = await findRecoveryCodeByHash(hashToken(normalized));

  if (candidate === null || candidate.userId !== userId || candidate.usedAt !== null) {
    return false;
  }

  // Ein Wiederherstellungscode gilt genau einmal.
  await markRecoveryCodeUsed(candidate.id, new Date());
  await recordAuditEntry(organization, {
    entityType: 'User',
    entityId: userId,
    action: 'RECOVERY_CODE_USED',
    actorId: userId,
    ipAddress: context.ipAddress,
  });

  return true;
}

async function registerFailure(
  userId: string,
  organization: OrganizationContext,
  state: LockoutState,
  context: RequestContext,
  now: Date,
): Promise<void> {
  const next = registerFailedAttempt(state, now);

  await updateUser(userId, {
    failedLogins: next.failedLogins,
    lockedUntil: next.lockedUntil,
  });

  await recordAuditEntry(organization, {
    entityType: 'User',
    entityId: userId,
    action: 'LOGIN_FAILED',
    actorId: userId,
    ipAddress: context.ipAddress,
    details: { failedLogins: next.failedLogins },
  });

  if (next.lockedUntil !== null) {
    await recordAuditEntry(organization, {
      entityType: 'User',
      entityId: userId,
      action: 'ACCOUNT_LOCKED',
      actorId: userId,
      ipAddress: context.ipAddress,
      details: { lockedUntil: next.lockedUntil.toISOString() },
    });
  }
}

export async function login(
  input: LoginInput,
  context: RequestContext,
  now: Date = new Date(),
): Promise<Result<IssuedSession, LoginError>> {
  const email = input.email.trim().toLowerCase();
  const user = await findUserByEmail(email);

  if (user === null) {
    // Gleicher Rechenaufwand wie bei einem existierenden Konto.
    await verifyPassword(await getDecoyHash(), input.password);
    return err({ kind: 'INVALID_CREDENTIALS' });
  }

  // Der Mandantenkontext steht ab hier fest: Er kommt aus dem Konto, nie aus
  // der Anfrage.
  const organization = organizationContextOf(user.organizationId);

  const lockout = toLockoutState(user);
  if (isLocked(lockout, now)) {
    return err({
      kind: 'LOCKED',
      remainingMinutes: Math.ceil(remainingLockoutMs(lockout, now) / 60_000),
    });
  }

  const passwordMatches = await verifyPassword(user.passwordHash, input.password);
  if (!passwordMatches) {
    await registerFailure(user.id, organization, lockout, context, now);
    return err({ kind: 'INVALID_CREDENTIALS' });
  }

  if (user.totpEnabled && user.totpSecret !== null) {
    const secondFactorValid = await verifySecondFactor(
      user.id,
      organization,
      user.totpSecret,
      input.secondFactor,
      context,
    );
    if (!secondFactorValid) {
      await registerFailure(user.id, organization, lockout, context, now);
      return err({ kind: 'INVALID_CREDENTIALS' });
    }
  }

  const cleared = clearFailedAttempts();
  await updateUser(user.id, {
    failedLogins: cleared.failedLogins,
    lockedUntil: cleared.lockedUntil,
  });

  // Jede Anmeldung erzeugt ein frisches Token (NFA-SEC-07).
  const session = await createSession(user.id, context, now);

  await recordAuditEntry(organization, {
    entityType: 'User',
    entityId: user.id,
    action: 'LOGIN_SUCCEEDED',
    actorId: user.id,
    ipAddress: context.ipAddress,
  });

  return ok(session);
}
