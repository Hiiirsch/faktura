import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getOptionalSession } from '@/application/auth/require-session';
import { messages } from '@/i18n/de';
import { PENDING_LOGIN_COOKIE_NAME } from '@/infrastructure/auth/session-cookie';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { DASHBOARD_PATH, LOGIN_PATH } from '@/routes';
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, QUIET_BUTTON_CLASS } from '@/ui/components/form';

import { abandonSecondFactorAction, secondFactorAction, type SecondFactorErrorCode } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.login.codeTitle} · ${messages.app.name}` };

function errorMessage(code: SecondFactorErrorCode | undefined): string | null {
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
 * Der zweite Anmeldeschritt (M6.2, NFA-SEC-05).
 *
 * **Die Seite ist öffentlich und trotzdem nicht offen.** Sie liegt vor der
 * Sitzung — geschützt ist sie durch den kurzlebigen Nachweis aus dem ersten
 * Schritt. Ohne ihn zeigt sie nichts und leitet zurück; das Vorhandensein des
 * Cookies ist hier nur die Eintrittskarte zum Formular, geprüft wird der
 * Nachweis serverseitig beim Absenden.
 *
 * Das Formular ist eine Server-Komponente mit einfacher Server Action, kein
 * `useActionState`: Die Anmeldung muss ohne JavaScript funktionieren, und
 * dafür liefert React keine serverseitige Aktionskennung aus (CLAUDE.md).
 */
export default async function SecondFactorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  if ((await getOptionalSession()) !== null) {
    redirect(DASHBOARD_PATH);
  }

  // Kein Nachweis, keine Seite. Wer hier ohne Cookie landet, hat den ersten
  // Schritt nicht gemacht oder zu lange gebraucht.
  const pending = (await cookies()).get(PENDING_LOGIN_COOKIE_NAME)?.value ?? '';
  if (pending.length === 0) {
    redirect(`${LOGIN_PATH}?error=invalid`);
  }

  const params = await searchParams;
  const rawError = typeof params.error === 'string' ? params.error : undefined;
  const error = errorMessage(rawError as SecondFactorErrorCode | undefined);

  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <main className="mx-auto flex min-h-screen max-w-login flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold text-ink">{messages.login.codeTitle}</h1>
        <p className="text-ink-muted">{messages.login.codeIntro}</p>
      </header>

      {error !== null ? (
        <p
          role="alert"
          className="rounded-control border border-rule bg-ocker-wash px-4 py-3 text-ui text-ink"
        >
          {error}
        </p>
      ) : null}

      <form action={secondFactorAction} className="flex flex-col gap-5">
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
            // `one-time-code` lässt iOS und Android den Code aus der
            // Nachricht bzw. dem Schlüsselbund anbieten.
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

      {/* Der Rückweg verwirft den Nachweis, statt ihn liegen zu lassen. */}
      <form action={abandonSecondFactorAction}>
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
        <button type="submit" className={QUIET_BUTTON_CLASS}>
          {messages.login.otherAccount}
        </button>
      </form>
    </main>
  );
}
