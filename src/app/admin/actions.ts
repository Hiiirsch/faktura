'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { endAdminSession } from '@/application/admin/admin-session-service';
import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import {
  ADMIN_SESSION_COOKIE_NAME,
  clearedAdminSessionCookieOptions,
} from '@/infrastructure/auth/session-cookie';
import { ADMIN_LOGIN_PATH } from '@/routes';

/** Abmelden aus der Verwaltung: Sitzung serverseitig beenden, Cookie löschen. */
export async function adminLogoutAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? '';

  if (token.length > 0) {
    await endAdminSession(token);
  }

  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, '', clearedAdminSessionCookieOptions());
  redirect(ADMIN_LOGIN_PATH);
}
