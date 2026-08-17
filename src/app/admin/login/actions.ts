'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { adminLogin, completeAdminSecondFactor } from '@/application/admin/admin-login';
import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { MAX_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import {
  adminSessionCookieOptions,
  ADMIN_SESSION_COOKIE_NAME,
  clearedPendingLoginCookieOptions,
  PENDING_LOGIN_COOKIE_NAME,
  pendingLoginCookieOptions,
} from '@/infrastructure/auth/session-cookie';
import { ADMIN_LOGIN_CODE_PATH, ADMIN_LOGIN_PATH, ADMIN_PATH } from '@/routes';

/**
 * Anmeldung an der Verwaltung (M8).
 *
 * Aufgebaut wie `src/app/login/actions.ts`, aber ohne den Zweig „Konto ohne
 * zweiten Faktor": Betreiberkonten führen ihn verpflichtend (FA-ADM-08), der
 * erste Schritt endet deshalb immer auf der Codeseite.
 */
const credentialsSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

const codeSchema = z.object({ code: z.string().trim().min(1).max(64) });

export type AdminLoginErrorCode = 'invalid' | 'locked' | 'missing' | 'rejected' | 'expired';

function backToLogin(code: AdminLoginErrorCode, minutes?: number): never {
  const params = new URLSearchParams({ error: code });
  if (minutes !== undefined) {
    params.set('minutes', String(minutes));
  }
  redirect(`${ADMIN_LOGIN_PATH}?${params.toString()}`);
}

export async function adminLoginAction(formData: FormData): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    backToLogin('rejected');
  }

  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    backToLogin('missing');
  }

  const context = await readRequestContext();
  const result = await adminLogin(parsed.data, context);

  if (!result.ok) {
    if (result.error.kind === 'LOCKED') {
      backToLogin('locked', result.error.remainingMinutes);
    }
    backToLogin('invalid');
  }

  const cookieStore = await cookies();
  cookieStore.set(
    PENDING_LOGIN_COOKIE_NAME,
    result.value.token,
    // Derselbe Nachweis wie bei der Mandantenanmeldung, aber mit dem Pfad der
    // Verwaltung: Er begleitet keine Anfrage außerhalb von `/admin`.
    { ...pendingLoginCookieOptions(result.value.expiresAt), path: '/admin' },
  );
  redirect(ADMIN_LOGIN_CODE_PATH);
}

export async function adminSecondFactorAction(formData: FormData): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    redirect(`${ADMIN_LOGIN_CODE_PATH}?error=rejected`);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_LOGIN_COOKIE_NAME)?.value ?? '';
  if (token.length === 0) {
    backToLogin('expired');
  }

  const parsed = codeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) {
    redirect(`${ADMIN_LOGIN_CODE_PATH}?error=missing`);
  }

  const context = await readRequestContext();
  const result = await completeAdminSecondFactor(token, parsed.data.code, context);

  const clearPending = { ...clearedPendingLoginCookieOptions(), path: '/admin' as const };

  if (!result.ok) {
    switch (result.error.kind) {
      case 'LOCKED':
        cookieStore.set(PENDING_LOGIN_COOKIE_NAME, '', clearPending);
        backToLogin('locked', result.error.remainingMinutes);
        break;
      case 'NO_PENDING_LOGIN':
        cookieStore.set(PENDING_LOGIN_COOKIE_NAME, '', clearPending);
        backToLogin('expired');
        break;
      default:
        redirect(`${ADMIN_LOGIN_CODE_PATH}?error=invalid`);
    }
  }

  cookieStore.set(
    ADMIN_SESSION_COOKIE_NAME,
    result.value.token,
    adminSessionCookieOptions(result.value.expiresAt),
  );
  cookieStore.set(PENDING_LOGIN_COOKIE_NAME, '', clearPending);
  redirect(ADMIN_PATH);
}
