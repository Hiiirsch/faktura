import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getOptionalSession } from '@/application/auth/require-session';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { DASHBOARD_PATH } from '@/routes';

import { loginAction, type LoginErrorCode } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.login.title} · ${messages.app.name}` };

const FIELD_CLASS =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 ' +
  'focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 ' +
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

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

  // Die Middleware reicht den CSRF-Token über eine Kopfzeile durch, weil das
  // zugehörige Cookie beim allerersten Aufruf noch nicht in der Anfrage steht.
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{messages.app.name}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{messages.login.intro}</p>
      </header>

      {error !== null ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      <form action={loginAction} className="flex flex-col gap-5">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium">
            {messages.login.email}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium">
            {messages.login.password}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="secondFactor" className="text-sm font-medium">
            {messages.login.secondFactor}
          </label>
          <input
            id="secondFactor"
            name="secondFactor"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            aria-describedby="secondFactorHint"
            className={FIELD_CLASS}
          />
          <p id="secondFactorHint" className="text-sm text-neutral-600 dark:text-neutral-400">
            {messages.login.secondFactorOptional}
          </p>
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {messages.login.submit}
        </button>
      </form>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {messages.login.noRegistrationHint}
      </p>
    </main>
  );
}
