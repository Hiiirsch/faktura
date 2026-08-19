import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getOptionalAdminSession } from '@/application/admin/require-admin-session';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { isPasskeyCapableOrigin } from '@/infrastructure/auth/webauthn';
import { ADMIN_PASSKEY_LOGIN_PATH, ADMIN_PATH } from '@/routes';
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';

import { PasskeyLoginButton } from '../../passkey-login-button';
import { adminLoginAction, type AdminLoginErrorCode } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.admin.loginTitle} · ${messages.app.name}` };

function errorMessage(code: AdminLoginErrorCode | undefined, minutes: string | undefined): string | null {
  switch (code) {
    case 'invalid':
      return messages.login.invalidCredentials;
    case 'locked':
      return messages.login.locked.replace('{minutes}', minutes ?? '15');
    case 'missing':
      return messages.login.missingFields;
    case 'expired':
      return messages.login.codeExpired;
    case 'rejected':
      return messages.login.rejected;
    default:
      return null;
  }
}

/**
 * Anmeldung an der zentralen Verwaltung (M8).
 *
 * Bewusst dieselbe schlichte Form wie die Mandantenanmeldung: schmale Spalte,
 * flach, kein eigenes Erscheinungsbild. Die Verwaltung ist kein zweites
 * Produkt, sondern dieselbe Anwendung aus der Sicht des Betreibers.
 *
 * Als Server-Komponente mit einfacher Server Action — die Anmeldung muss ohne
 * JavaScript funktionieren (CLAUDE.md).
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  if ((await getOptionalAdminSession()) !== null) {
    redirect(ADMIN_PATH);
  }

  const params = await searchParams;
  const rawError = typeof params.error === 'string' ? params.error : undefined;
  const rawMinutes = typeof params.minutes === 'string' ? params.minutes : undefined;
  const error = errorMessage(rawError as AdminLoginErrorCode | undefined, rawMinutes);

  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  const passkeysPossible = isPasskeyCapableOrigin();

  return (
    <main className="mx-auto flex min-h-screen max-w-login flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold text-ink">{messages.admin.heading}</h1>
        <p className="text-ink-muted">{messages.admin.loginIntro}</p>
      </header>

      {error !== null ? (
        <p
          role="alert"
          className="rounded-control border border-rule bg-ocker-wash px-4 py-3 text-ui text-ink"
        >
          {error}
        </p>
      ) : null}

      <form action={adminLoginAction} className="flex flex-col gap-5">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-ui font-medium">
            {messages.login.email}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-ui font-medium">
            {messages.login.password}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={INPUT_CLASS}
          />
        </div>

        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.login.submit}
        </button>
      </form>

      {/*
        Auch hier eine Ergänzung neben dem Formular (M9, FA-PASS-06,
        FA-ADM-08).

        Ein Passkey mit Nutzerverifikation bringt beide Faktoren mit — Besitz des
        Geräts und Gerätesperre. Deshalb entsteht damit unmittelbar eine
        Sitzung, während der Passwortweg über den zweiten Schritt führt.
      */}
      {passkeysPossible ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-rule" />
            <span className="text-small text-ink-faint">{messages.login.passkeyOr}</span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <PasskeyLoginButton
            endpoint={ADMIN_PASSKEY_LOGIN_PATH}
            redirectTo={ADMIN_PATH}
            csrfToken={csrfToken}
          />
        </div>
      ) : null}
    </main>
  );
}
