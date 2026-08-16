'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { completeSecondFactor, login } from '@/application/auth/login';
import { readRequestContext } from '@/application/auth/request-context';
import { MAX_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import {
  clearedPendingLoginCookieOptions,
  PENDING_LOGIN_COOKIE_NAME,
  pendingLoginCookieOptions,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '@/infrastructure/auth/session-cookie';
import { DASHBOARD_PATH, LOGIN_CODE_PATH, LOGIN_PATH } from '@/routes';

/**
 * Serverseitige Validierung — die einzige, die zählt (NFA-SEC-11).
 *
 * Die Obergrenze für das Passwort ist kein Komfortmerkmal: Argon2id mit 64 MB
 * Speicher auf ein unbegrenztes Eingabefeld anzuwenden wäre ein Angriffsvektor.
 */
const loginSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

const codeSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export type LoginErrorCode = 'invalid' | 'locked' | 'missing' | 'rejected';
/** `expired` steht für „kein gültiger Nachweis mehr" — auch für „nie einen gehabt". */
export type SecondFactorErrorCode = 'invalid' | 'locked' | 'missing' | 'rejected' | 'expired';

function redirectWithError(code: LoginErrorCode, minutes?: number): never {
  const params = new URLSearchParams({ error: code });
  if (minutes !== undefined) {
    params.set('minutes', String(minutes));
  }
  redirect(`${LOGIN_PATH}?${params.toString()}`);
}

function redirectToCodeWithError(code: SecondFactorErrorCode): never {
  redirect(`${LOGIN_CODE_PATH}?error=${code}`);
}

/** Setzt das Sitzungscookie und räumt den Zwischenzustand ab. */
async function establishSession(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
  cookieStore.set(PENDING_LOGIN_COOKIE_NAME, '', clearedPendingLoginCookieOptions());
}

/**
 * Erster Schritt: E-Mail und Passwort (Spec §10.1, seit M6.2 zweistufig).
 *
 * Führt das Konto keinen zweiten Faktor, endet die Anmeldung hier — die zweite
 * Seite erscheint dann gar nicht. Genau das war der Anlass für die Aufteilung:
 * Ein Feld für einen Code, den die meisten Konten nicht führen, steht sonst bei
 * jeder Anmeldung im Weg.
 */
export async function loginAction(formData: FormData): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    redirectWithError('rejected');
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
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

  if (result.value.kind === 'SECOND_FACTOR_REQUIRED') {
    const cookieStore = await cookies();
    cookieStore.set(
      PENDING_LOGIN_COOKIE_NAME,
      result.value.pending.token,
      pendingLoginCookieOptions(result.value.pending.expiresAt),
    );
    redirect(LOGIN_CODE_PATH);
  }

  await establishSession(result.value.session.token, result.value.session.expiresAt);
  redirect(DASHBOARD_PATH);
}

/**
 * Zweiter Schritt: der Bestätigungscode.
 *
 * Der Nachweis kommt aus dem Cookie, nicht aus dem Formular: Ein verstecktes
 * Feld wäre für JavaScript lesbar und stünde im Quelltext der Seite.
 */
export async function secondFactorAction(formData: FormData): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    redirectToCodeWithError('rejected');
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_LOGIN_COOKIE_NAME)?.value ?? '';

  if (token.length === 0) {
    redirectWithError('invalid');
  }

  const parsed = codeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) {
    redirectToCodeWithError('missing');
  }

  const context = await readRequestContext();
  const result = await completeSecondFactor(token, parsed.data.code, context);

  if (!result.ok) {
    switch (result.error.kind) {
      case 'LOCKED':
        // Zurück an den Anfang: Der Nachweis ist verbraucht, und die Sperre
        // gehört an die Stelle, an der man sie sieht, bevor man tippt.
        cookieStore.set(PENDING_LOGIN_COOKIE_NAME, '', clearedPendingLoginCookieOptions());
        redirectWithError('locked', result.error.remainingMinutes);
        break;
      case 'NO_PENDING_LOGIN':
        cookieStore.set(PENDING_LOGIN_COOKIE_NAME, '', clearedPendingLoginCookieOptions());
        redirectWithError('invalid');
        break;
      default:
        redirectToCodeWithError('invalid');
    }
  }

  await establishSession(result.value.token, result.value.expiresAt);
  redirect(DASHBOARD_PATH);
}

/** „Andere Anmeldung": verwirft den Nachweis und beginnt von vorn. */
export async function abandonSecondFactorAction(formData: FormData): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    redirectWithError('rejected');
  }

  const cookieStore = await cookies();
  cookieStore.set(PENDING_LOGIN_COOKIE_NAME, '', clearedPendingLoginCookieOptions());
  redirect(LOGIN_PATH);
}
