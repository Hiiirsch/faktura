/**
 * Einrichtung der Zweifaktorauthentifizierung (NFA-SEC-05, Spec §11.1).
 *
 * Das Geheimnis wird erst dann dauerhaft aktiviert, wenn der Benutzer einen
 * damit erzeugten Code vorweisen kann. Andernfalls ließe sich das Konto durch
 * eine falsch eingescannte Kennung aussperren.
 *
 * Die Wiederherstellungscodes erscheinen genau einmal im Klartext — danach
 * liegt nur noch ihr Hash vor.
 */
import { RECOVERY_CODE_COUNT, formatRecoveryCode } from '@/domain/auth/recovery-code';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { generateRecoveryCodeRaw, hashToken } from '@/infrastructure/auth/tokens';
import { buildTotpUri, generateTotpSecret, verifyTotpCode } from '@/infrastructure/auth/totp';
import { getEnv } from '@/infrastructure/config/env';
import { runInTransaction } from '@/infrastructure/repositories/client';
import {
  deleteRecoveryCodes,
  deleteTrustedDevicesForUser,
  findUserById,
  replaceRecoveryCodes as writeRecoveryCodes,
  updateUser,
} from '@/infrastructure/repositories/auth-repository';
import type { Authorized } from '@/application/auth/authorize';

export type TotpSetupOffer = {
  readonly secret: string;
  readonly uri: string;
};

export type TotpSetupError =
  | { readonly kind: 'INVALID_CODE' }
  | { readonly kind: 'ALREADY_ENABLED' };

/**
 * Erzeugt ein Geheimnis samt `otpauth://`-URI. Beides wird noch nicht
 * gespeichert, sondern dem Benutzer angezeigt und beim Bestätigen
 * zurückgereicht.
 */
export function beginTotpSetup(email: string): TotpSetupOffer {
  const issuer = getEnv().APP_NAME;
  const secret = generateTotpSecret();
  return { secret, uri: buildTotpUri(secret, email, issuer) };
}

async function replaceRecoveryCodes(userId: string): Promise<readonly string[]> {
  const codes: string[] = [];
  const rows: { userId: string; codeHash: string }[] = [];

  for (let index = 0; index < RECOVERY_CODE_COUNT; index += 1) {
    const raw = generateRecoveryCodeRaw();
    codes.push(formatRecoveryCode(raw));
    rows.push({ userId, codeHash: hashToken(raw) });
  }

  // Alte Codes und neue Codes in einem Zug: Ein Abbruch dazwischen ließe den
  // Benutzer ohne jeden gültigen Wiederherstellungscode zurück.
  await runInTransaction(async (handle) => {
    await writeRecoveryCodes(userId, rows, handle);
  });

  return codes;
}

/**
 * Aktiviert TOTP nach erfolgreicher Probe und gibt die einmalig sichtbaren
 * Wiederherstellungscodes zurück.
 */
export async function confirmTotpSetup(
  organization: Authorized<'security.update'>,
  userId: string,
  email: string,
  secret: string,
  submittedCode: string,
  ipAddress: string | null,
): Promise<Result<readonly string[], TotpSetupError>> {
  const user = await findUserById(userId);

  if (user === null) {
    return err({ kind: 'INVALID_CODE' });
  }
  if (user.totpEnabled) {
    return err({ kind: 'ALREADY_ENABLED' });
  }
  if (!verifyTotpCode(secret, submittedCode, getEnv().APP_NAME)) {
    return err({ kind: 'INVALID_CODE' });
  }

  await updateUser(userId, { totpSecret: secret, totpEnabled: true });

  const codes = await replaceRecoveryCodes(userId);

  await recordAuditEntry(organization, {
    entityType: 'User',
    entityId: userId,
    action: 'TOTP_ENABLED',
    actorId: userId,
    ipAddress,
    details: { email },
  });

  return ok(codes);
}

export async function disableTotp(
  organization: Authorized<'security.update'>,
  userId: string,
  ipAddress: string | null,
): Promise<void> {
  await runInTransaction(async (handle) => {
    await updateUser(userId, { totpSecret: null, totpEnabled: false }, handle);
    await deleteRecoveryCodes(userId, handle);
    /*
     * Und die vertrauten Geräte (M9, FA-TRUST-04).
     *
     * Sie sind Nachweise **über** den zweiten Faktor. Ohne ihn haben sie keinen
     * Gegenstand mehr — und blieben sie stehen, wären sie beim nächsten
     * Einschalten wieder gültig, ohne dass jemand sie neu bestätigt hätte.
     */
    await deleteTrustedDevicesForUser(userId, handle);
  });

  await recordAuditEntry(organization, {
    entityType: 'User',
    entityId: userId,
    action: 'TOTP_DISABLED',
    actorId: userId,
    ipAddress,
  });
}

export async function regenerateRecoveryCodes(
  organization: Authorized<'security.update'>,
  userId: string,
  ipAddress: string | null,
): Promise<readonly string[]> {
  const codes = await replaceRecoveryCodes(userId);

  await recordAuditEntry(organization, {
    entityType: 'User',
    entityId: userId,
    action: 'RECOVERY_CODES_REGENERATED',
    actorId: userId,
    ipAddress,
  });

  return codes;
}
