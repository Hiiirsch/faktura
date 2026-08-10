'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { login } from '@/application/auth/login';
import { readRequestContext } from '@/application/auth/request-context';
import { MAX_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { sessionCookieOptions, SESSION_COOKIE_NAME } from '@/infrastructure/auth/session-cookie';
import { DASHBOARD_PATH, LOGIN_PATH } from '@/routes';

/**
 * Serverseitige Validierung — die einzige, die zählt (NFA-SEC-11).
 *
 * Die Obergrenze für das Passwort ist kein Komfortmerkmal: Argon2id mit 64 MB
 * Speicher auf ein unbegrenztes Eingabefeld anzuwenden wäre ein Angriffsvektor.
 */
const loginSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  secondFactor: z.string().trim().max(64).default(''),
});

export type LoginErrorCode = 'invalid' | 'locked' | 'missing' | 'rejected';

function redirectWithError(code: LoginErrorCode, minutes?: number): never {
  const params = new URLSearchParams({ error: code });
  if (minutes !== undefined) {
    params.set('minutes', String(minutes));
  }
  redirect(`${LOGIN_PATH}?${params.toString()}`);
}

export async function loginAction(formData: FormData): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    redirectWithError('rejected');
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    secondFactor: formData.get('secondFactor') ?? '',
  });

  if (!parsed.success) {
    redirectWithError('missing');
  }

  const context = await readRequestContext();
  const result = await login(parsed.data, context);

  if (!result.ok) {
    if (result.error.kind === 'LOCKED') {
      redirectWithError('locked', result.error.remainingMinutes);
    }
    redirectWithError('invalid');
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    result.value.token,
    sessionCookieOptions(result.value.expiresAt),
  );

  redirect(DASHBOARD_PATH);
}
