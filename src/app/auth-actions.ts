'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import { deleteSessionByToken } from '@/application/auth/session-service';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { clearedSessionCookieOptions, SESSION_COOKIE_NAME } from '@/infrastructure/auth/session-cookie';
import { LOGIN_PATH } from '@/routes';

export async function logoutAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token !== undefined) {
    await deleteSessionByToken(token);
  }

  await recordAuditEntry({
    entityType: 'User',
    entityId: session.userId,
    action: 'LOGOUT',
    actorId: session.userId,
  });

  cookieStore.set(SESSION_COOKIE_NAME, '', clearedSessionCookieOptions());

  redirect(LOGIN_PATH);
}
