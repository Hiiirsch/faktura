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
import { getPrismaClient } from '@/infrastructure/db/prisma';

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
  const prisma = getPrismaClient();
  const codes: string[] = [];
  const rows: { userId: string; codeHash: string }[] = [];

  for (let index = 0; index < RECOVERY_CODE_COUNT; index += 1) {
    const raw = generateRecoveryCodeRaw();
    codes.push(formatRecoveryCode(raw));
    rows.push({ userId, codeHash: hashToken(raw) });
  }

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({ data: rows }),
  ]);

  return codes;
}

/**
 * Aktiviert TOTP nach erfolgreicher Probe und gibt die einmalig sichtbaren
 * Wiederherstellungscodes zurück.
 */
export async function confirmTotpSetup(
  userId: string,
  email: string,
  secret: string,
  submittedCode: string,
  ipAddress: string | null,
): Promise<Result<readonly string[], TotpSetupError>> {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (user === null) {
    return err({ kind: 'INVALID_CODE' });
  }
  if (user.totpEnabled) {
    return err({ kind: 'ALREADY_ENABLED' });
  }
  if (!verifyTotpCode(secret, submittedCode, getEnv().APP_NAME)) {
    return err({ kind: 'INVALID_CODE' });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: secret, totpEnabled: true },
  });

  const codes = await replaceRecoveryCodes(userId);

  await recordAuditEntry({
    entityType: 'User',
    entityId: userId,
    action: 'TOTP_ENABLED',
    actorId: userId,
    ipAddress,
    details: { email },
  });

  return ok(codes);
}

export async function disableTotp(userId: string, ipAddress: string | null): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabled: false },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);

  await recordAuditEntry({
    entityType: 'User',
    entityId: userId,
    action: 'TOTP_DISABLED',
    actorId: userId,
    ipAddress,
  });
}

export async function regenerateRecoveryCodes(
  userId: string,
  ipAddress: string | null,
): Promise<readonly string[]> {
  const codes = await replaceRecoveryCodes(userId);

  await recordAuditEntry({
    entityType: 'User',
    entityId: userId,
    action: 'RECOVERY_CODES_REGENERATED',
    actorId: userId,
    ipAddress,
  });

  return codes;
}
