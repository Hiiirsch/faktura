'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { authorize } from '@/application/auth/authorize';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import { revokeAllSessions, revokeSession } from '@/application/auth/session-service';
import {
  confirmTotpSetup,
  disableTotp,
  regenerateRecoveryCodes,
} from '@/application/auth/totp-setup';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { SECURITY_SETTINGS_PATH } from '@/routes';

/** Rückgabe der Formulare, die Ergebnisse anzeigen müssen. */
export type TotpFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'codes'; readonly codes: readonly string[] };

const confirmSchema = z.object({
  secret: z.string().trim().min(16).max(128),
  code: z.string().trim().min(1).max(32),
});

const sessionIdSchema = z.string().trim().min(1).max(64);

export async function confirmTotpAction(
  _previous: TotpFormState,
  formData: FormData,
): Promise<TotpFormState> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'security.update');

  const parsed = confirmSchema.safeParse({
    secret: formData.get('secret'),
    code: formData.get('code'),
  });

  if (!parsed.success) {
    return { status: 'error', message: 'INVALID_CODE' };
  }

  const context = await readRequestContext();
  const result = await confirmTotpSetup(
    authorized,
    session.userId,
    session.email,
    parsed.data.secret,
    parsed.data.code,
    context.ipAddress,
  );

  if (!result.ok) {
    return { status: 'error', message: result.error.kind };
  }

  revalidatePath(SECURITY_SETTINGS_PATH);
  return { status: 'codes', codes: result.value };
}

export async function regenerateRecoveryCodesAction(
  _previous: TotpFormState,
  formData: FormData,
): Promise<TotpFormState> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'security.update');
  const context = await readRequestContext();

  const codes = await regenerateRecoveryCodes(authorized, session.userId, context.ipAddress);

  revalidatePath(SECURITY_SETTINGS_PATH);
  return { status: 'codes', codes };
}

export async function disableTotpAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'security.update');
  const context = await readRequestContext();

  await disableTotp(authorized, session.userId, context.ipAddress);
  revalidatePath(SECURITY_SETTINGS_PATH);
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'security.update');

  const parsed = sessionIdSchema.safeParse(formData.get('sessionId'));
  if (!parsed.success) {
    return;
  }

  const revoked = await revokeSession(session.userId, parsed.data);
  if (revoked) {
    const context = await readRequestContext();
    await recordAuditEntry(authorized, {
      entityType: 'Session',
      entityId: parsed.data,
      action: 'SESSION_REVOKED',
      actorId: session.userId,
      ipAddress: context.ipAddress,
    });
  }

  revalidatePath(SECURITY_SETTINGS_PATH);
}

export async function revokeOtherSessionsAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const authorized = authorize(session, 'security.update');
  const context = await readRequestContext();

  const count = await revokeAllSessions(session.userId, session.sessionId);

  await recordAuditEntry(authorized, {
    entityType: 'User',
    entityId: session.userId,
    action: 'SESSIONS_REVOKED_ALL',
    actorId: session.userId,
    ipAddress: context.ipAddress,
    details: { revokedCount: count },
  });

  revalidatePath(SECURITY_SETTINGS_PATH);
}
