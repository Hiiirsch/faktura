/**
 * Anmeldung in zwei Schritten (NFA-SEC-04, -05, -07, -08, Spec §11.1).
 *
 * Bis M6.2 wurden Passwort und zweiter Faktor **in einem** Schritt
 * entgegengenommen. Das ersparte den Zwischenzustand, verlangte aber ein Feld
 * für einen Code, den die meisten Konten gar nicht führen. Seit M6.2 fragt die
 * Anwendung ihn auf einer eigenen Seite — und nur dann, wenn das Konto ihn
 * tatsächlich führt.
 *
 * **Was diese Änderung kostet, ausdrücklich benannt.** Die einstufige Fassung
 * konnte falsches Passwort und falschen Code ununterscheidbar beantworten. Das
 * geht jetzt nicht mehr: Wer den zweiten Schritt zu sehen bekommt, weiß, dass
 * das Passwort stimmte. Diese Auskunft ist jedem zweistufigen Verfahren
 * eigen — sie ist der Preis dafür, den Code nur dort zu verlangen, wo es ihn
 * gibt. Unverändert ununterscheidbar bleibt der **erste** Schritt: unbekanntes
 * Konto und falsches Passwort ergeben dieselbe Antwort und denselben
 * Rechenaufwand.
 *
 * **Der Zwischenzustand verleiht kein Recht.** Er beweist, dass ein Passwort
 * stimmte, mehr nicht; er läuft nach fünf Minuten ab und liegt in einer
 * eigenen Tabelle, die keine Sitzungsabfrage findet. Die Sperre nach zehn
 * Fehlversuchen (NFA-SEC-08) zählt im zweiten Schritt weiter — sonst wäre der
 * Code beliebig oft ratbar, sobald das Passwort einmal stimmte.
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
import {
  isPendingLoginExpired,
  pendingLoginExpiry,
} from '@/domain/auth/pending-login-policy';
import { isWellFormedTotpCode } from '@/domain/auth/totp-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { hashPassword, verifyPassword } from '@/infrastructure/auth/password-hasher';
import { generateSessionToken, hashToken } from '@/infrastructure/auth/tokens';
import { verifyTotpCode } from '@/infrastructure/auth/totp';
import { getEnv } from '@/infrastructure/config/env';
import {
  createPendingLogin,
  deleteExpiredPendingLogins,
  deletePendingLogin,
  deletePendingLoginsForUser,
  findPendingLoginByHash,
  findRecoveryCodeByHash,
  findUserByEmail,
  findUserById,
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
};

export type LoginError =
  /** Bewusst ununterscheidbar für falsches Konto und falsches Passwort —
   * sonst ließe sich erfragen, welche Adressen existieren. */
  | { readonly kind: 'INVALID_CREDENTIALS' }
  | { readonly kind: 'LOCKED'; readonly remainingMinutes: number };

/** Der Nachweis des ersten Schritts, wie ihn der Browser als Cookie erhält. */
export type PendingSecondFactor = {
  readonly token: string;
  readonly expiresAt: Date;
};

/**
 * Was nach dem Passwort geschieht: Entweder ist die Anmeldung fertig, oder es
 * fehlt der zweite Faktor. Als Vereinigungstyp, damit die aufrufende Stelle
 * beide Fälle behandeln **muss** — ein `session?: …` hätte sich versehentlich
 * ignorieren lassen.
 */
export type LoginOutcome =
  | { readonly kind: 'SESSION'; readonly session: IssuedSession }
  | { readonly kind: 'SECOND_FACTOR_REQUIRED'; readonly pending: PendingSecondFactor };

export type SecondFactorError =
  | { readonly kind: 'NO_PENDING_LOGIN' }
  | { readonly kind: 'INVALID_CODE' }
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

/**
 * Ein frisch bestandener Passwortschritt wird zum Nachweis.
 *
 * Ältere Nachweise desselben Kontos fallen dabei weg: Wer sich zweimal
 * hintereinander anmeldet, soll nicht zwei offene Zeitfenster hinterlassen.
 */
async function issuePendingLogin(
  userId: string,
  context: RequestContext,
  now: Date,
): Promise<PendingSecondFactor> {
  const token = generateSessionToken();
  const expiresAt = pendingLoginExpiry(now);

  await deleteExpiredPendingLogins(now);
  await deletePendingLoginsForUser(userId);
  await createPendingLogin({
    userId,
    tokenHash: hashToken(token),
    ipAddress: context.ipAddress,
    expiresAt,
    createdAt: now,
  });

  return { token, expiresAt };
}

/** Fehlversuche zurücksetzen und die Sitzung ausstellen. */
async function completeLogin(
  userId: string,
  organization: OrganizationContext,
  context: RequestContext,
  now: Date,
): Promise<IssuedSession> {
  const cleared = clearFailedAttempts();
  await updateUser(userId, {
    failedLogins: cleared.failedLogins,
    lockedUntil: cleared.lockedUntil,
  });

  // Jede Anmeldung erzeugt ein frisches Token (NFA-SEC-07).
  const session = await createSession(userId, context, now);

  await recordAuditEntry(organization, {
    entityType: 'User',
    entityId: userId,
    action: 'LOGIN_SUCCEEDED',
    actorId: userId,
    ipAddress: context.ipAddress,
  });

  return session;
}

/**
 * Erster Schritt: E-Mail und Passwort.
 *
 * Führt das Konto keinen zweiten Faktor, ist die Anmeldung hier fertig — die
 * zweite Seite erscheint dann gar nicht.
 */
export async function login(
  input: LoginInput,
  context: RequestContext,
  now: Date = new Date(),
): Promise<Result<LoginOutcome, LoginError>> {
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
    // Fehlversuche bleiben stehen, bis der zweite Faktor stimmt: Ein richtiges
    // Passwort allein darf die Sperre nicht zurücksetzen.
    return ok({
      kind: 'SECOND_FACTOR_REQUIRED',
      pending: await issuePendingLogin(user.id, context, now),
    });
  }

  return ok({ kind: 'SESSION', session: await completeLogin(user.id, organization, context, now) });
}

/**
 * Zweiter Schritt: der Bestätigungscode.
 *
 * Geprüft wird in dieser Reihenfolge, und die Reihenfolge ist der Punkt:
 *
 * 1. Gibt es einen gültigen, nicht abgelaufenen Nachweis? Sonst zurück an den
 *    Anfang — ohne Auskunft darüber, ob es ihn je gab.
 * 2. Ist das Konto inzwischen gesperrt? Die Sperre gilt auch hier; ein
 *    Nachweis aus der Zeit davor hebt sie nicht auf.
 * 3. Führt das Konto überhaupt noch einen zweiten Faktor? Wurde er zwischen
 *    beiden Schritten abgeschaltet, ist der Nachweis wertlos — dann wird neu
 *    angemeldet, statt ihn stillschweigend durchzuwinken.
 * 4. Stimmt der Code?
 *
 * Der Nachweis wird nach Erfolg gelöscht. Nach einem Fehlversuch bleibt er
 * bestehen, damit ein Vertipper nicht die ganze Anmeldung kostet — die Sperre
 * begrenzt die Versuche.
 */
export async function completeSecondFactor(
  token: string,
  code: string,
  context: RequestContext,
  now: Date = new Date(),
): Promise<Result<IssuedSession, SecondFactorError>> {
  const pending = await findPendingLoginByHash(hashToken(token));

  if (pending === null) {
    return err({ kind: 'NO_PENDING_LOGIN' });
  }

  if (isPendingLoginExpired(pending.expiresAt, now)) {
    await deletePendingLogin(pending.id);
    return err({ kind: 'NO_PENDING_LOGIN' });
  }

  const user = await findUserById(pending.userId);
  if (user === null) {
    await deletePendingLogin(pending.id);
    return err({ kind: 'NO_PENDING_LOGIN' });
  }

  const organization = organizationContextOf(user.organizationId);
  const lockout = toLockoutState(user);

  if (isLocked(lockout, now)) {
    await deletePendingLogin(pending.id);
    return err({
      kind: 'LOCKED',
      remainingMinutes: Math.ceil(remainingLockoutMs(lockout, now) / 60_000),
    });
  }

  if (!user.totpEnabled || user.totpSecret === null) {
    // Zwischen den Schritten abgeschaltet: Der Nachweis gilt nicht mehr.
    await deletePendingLogin(pending.id);
    return err({ kind: 'NO_PENDING_LOGIN' });
  }

  const valid = await verifySecondFactor(
    user.id,
    organization,
    user.totpSecret,
    code,
    context,
  );

  if (!valid) {
    await registerFailure(user.id, organization, lockout, context, now);
    return err({ kind: 'INVALID_CODE' });
  }

  await deletePendingLogin(pending.id);
  return ok(await completeLogin(user.id, organization, context, now));
}
