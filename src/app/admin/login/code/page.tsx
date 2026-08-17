import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getOptionalAdminSession } from '@/application/admin/require-admin-session';
import { messages } from '@/i18n/de';
import { PENDING_LOGIN_COOKIE_NAME } from '@/infrastructure/auth/session-cookie';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { ADMIN_LOGIN_PATH, ADMIN_PATH } from '@/routes';
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, QUIET_BUTTON_CLASS } from '@/ui/components/form';

import { adminSecondFactorAction, type AdminLoginErrorCode } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.admin.codeTitle} · ${messages.app.name}` };

function errorMessage(code: AdminLoginErrorCode | undefined): string | null {
  switch (code) {
    case 'invalid':
      return messages.login.codeInvalid;
    case 'missing':
      return messages.login.codeMissing;
    case 'expired':
      return messages.login.codeExpired;
    case 'rejected':
      return messages.login.rejected;
    default:
      return null;
  }
}

/**
 * Der zweite Anmeldeschritt der Verwaltung (M8, FA-ADM-08).
 *
 * Öffentlich und trotzdem nicht offen: Sie liegt vor der Sitzung, geschützt
 * durch den kurzlebigen Nachweis aus dem ersten Schritt. Ohne ihn zeigt sie
 * nichts und leitet zurück — geprüft vom Zugriffsschutztest.
 */
export default async function AdminSecondFactorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  if ((await getOptionalAdminSession()) !== null) {
    redirect(ADMIN_PATH);
  }

  const pending = (await cookies()).get(PENDING_LOGIN_COOKIE_NAME)?.value ?? '';
  if (pending.length === 0) {
    redirect(`${ADMIN_LOGIN_PATH}?error=expired`);
  }

  const params = await searchParams;
  const rawError = typeof params.error === 'string' ? params.error : undefined;
  const error = errorMessage(rawError as AdminLoginErrorCode | undefined);
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <main className="mx-auto flex min-h-screen max-w-login flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold text-ink">{messages.admin.codeTitle}</h1>
        <p className="text-ink-muted">{messages.admin.codeIntro}</p>
      </header>

      {error !== null ? (
        <p
          role="alert"
          className="rounded-control border border-rule bg-ocker-wash px-4 py-3 text-ui text-ink"
        >
          {error}
        </p>
      ) : null}

      <form action={adminSecondFactorAction} className="flex flex-col gap-5">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <div className="flex flex-col gap-2">
          <label htmlFor="code" className="text-ui font-medium">
            {messages.login.codeLabel}
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            className={`${INPUT_CLASS} font-mono`}
          />
        </div>

        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.login.codeSubmit}
        </button>
      </form>

      <a href={ADMIN_LOGIN_PATH} className={QUIET_BUTTON_CLASS}>
        {messages.common.back}
      </a>
    </main>
  );
}
