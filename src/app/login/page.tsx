import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getOptionalSession } from '@/application/auth/require-session';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { isPasskeyCapableOrigin } from '@/infrastructure/auth/webauthn';
import { DASHBOARD_PATH, PASSKEY_LOGIN_PATH } from '@/routes';
import { Alert, INPUT_CLASS, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';

import { PasskeyLoginButton } from '../passkey-login-button';
import { loginAction, type LoginErrorCode } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.login.title} · ${messages.app.name}` };

function errorMessage(code: LoginErrorCode | undefined, minutes: string | undefined): string | null {
  switch (code) {
    case 'invalid':
      return messages.login.invalidCredentials;
    case 'locked':
      return messages.login.locked.replace('{minutes}', minutes ?? '15');
    case 'missing':
      return messages.login.missingFields;
    case 'rejected':
      return messages.login.rejected;
    default:
      return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  // Eine bereits angemeldete Sitzung hat auf der Anmeldeseite nichts verloren.
  if ((await getOptionalSession()) !== null) {
    redirect(DASHBOARD_PATH);
  }

  const params = await searchParams;
  const rawError = typeof params.error === 'string' ? params.error : undefined;
  const rawMinutes = typeof params.minutes === 'string' ? params.minutes : undefined;
  const error = errorMessage(rawError as LoginErrorCode | undefined, rawMinutes);

  /*
   * Bestätigung nach einem Einlösevorgang (M8).
   *
   * Sie steht hier und nicht auf der Einlöseseite, weil die Anmeldung das Ziel
   * ist: Wer sein Konto eingerichtet hat, soll den Satz genau dort lesen, wo er
   * als Nächstes etwas tut. Und sie steht in der Adresse, nicht in einem
   * Zustand — sie gilt einer Handlung, nicht einem Zustand, und soll ein
   * Neuladen nicht überleben.
   */
  const done =
    params.eingerichtet === '1'
      ? messages.invitation.accountReady
      : params.passwort === '1'
        ? messages.invitation.passwordReady
        : null;

  // Die Middleware reicht den CSRF-Token über eine Kopfzeile durch, weil das
  // zugehörige Cookie beim allerersten Aufruf noch nicht in der Anfrage steht.
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  // Ohne sicheren Kontext gäbe der Knopf nur eine wortlose Ablehnung.
  const passkeysPossible = isPasskeyCapableOrigin();

  return (
    <main className="mx-auto flex min-h-screen max-w-login flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold text-ink">{messages.app.name}</h1>
        <p className="text-ink-muted">{messages.login.intro}</p>
      </header>

      {done === null ? null : <Alert tone="success">{done}</Alert>}

      {error !== null ? (
        <p
          role="alert"
          className="rounded-control border border-rule bg-ocker-wash px-4 py-3 text-ui text-ink"
        >
          {error}
        </p>
      ) : null}

      <form action={loginAction} className="flex flex-col gap-5">
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

        <button
          type="submit"
          className={PRIMARY_BUTTON_CLASS}
        >
          {messages.login.submit}
        </button>
      </form>

      {/*
        Der Passkey-Weg steht **neben** dem Formular, nicht an seiner Stelle
        (M9, FA-PASS-06).

        WebAuthn braucht JavaScript; das Formular darüber nicht. Fällt
        JavaScript aus, fällt dieser Abschnitt weg und der gewohnte Weg bleibt —
        deshalb ist es eine Ergänzung und kein Ersatz.
      */}
      {passkeysPossible ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-rule" />
            <span className="text-small text-ink-faint">{messages.login.passkeyOr}</span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <PasskeyLoginButton
            endpoint={PASSKEY_LOGIN_PATH}
            redirectTo={DASHBOARD_PATH}
            csrfToken={csrfToken}
          />
        </div>
      ) : null}

      <p className="text-ui text-ink-muted">
        {messages.login.noRegistrationHint}
      </p>
    </main>
  );
}
