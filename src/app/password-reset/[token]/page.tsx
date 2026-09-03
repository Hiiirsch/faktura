import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { loadPasswordReset } from '@/application/members/redeem';
import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { messages } from '@/i18n/de';
import { PasswordField } from '@/ui/components/password-field';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { LOGIN_PATH } from '@/routes';
import { Alert, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';
import { BrandLockup } from '@/ui/components/brand';

import { completePasswordResetAction, type ResetErrorCode } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.passwordReset.title} · ${messages.app.name}` };

function errorMessage(code: ResetErrorCode | undefined): string | null {
  switch (code) {
    case 'invalid':
      return messages.passwordReset.invalid;
    case 'mismatch':
      return messages.password.mismatch;
    case 'tooShort':
      return messages.password.tooShort.replace('{min}', String(MIN_PASSWORD_LENGTH));
    case 'compromised':
      return messages.password.compromised;
    case 'rejected':
      return messages.common.rejected;
    default:
      return null;
  }
}

/**
 * Ein neues Passwort setzen (M8, FA-MEMB-04).
 *
 * Wie die Einladungsseite: Ohne gültigen Token genau ein Satz und kein
 * Formular. Die Adresse des Kontos steht nur bei gültigem Token da — sie ist die
 * einzige Auskunft, die die Seite gibt, und sie ist nötig, damit niemand das
 * Passwort des falschen Kontos setzt.
 */
export default async function PasswordResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { token } = await params;
  const reset = await loadPasswordReset(token);
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const rawError = (await searchParams).error;
  const error = errorMessage(
    typeof rawError === 'string' ? (rawError as ResetErrorCode) : undefined,
  );

  if (!reset.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-login flex-col justify-center gap-6 px-6 py-16">
        <BrandLockup as="h1" size="page" />
        <Alert tone="error">{messages.passwordReset.invalid}</Alert>
        <Link href={LOGIN_PATH} className="text-ui text-accent hover:text-accent-hover">
          {messages.invitation.toLogin}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-login flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <span className="text-label font-semibold uppercase text-ink-faint">
          {messages.app.name}
        </span>
        <h1 className="text-page font-semibold text-ink">{messages.passwordReset.heading}</h1>
        <p className="text-ui text-ink-muted">
          {messages.passwordReset.intro.replace('{email}', reset.value.email)}
        </p>
      </header>

      {error === null ? null : <Alert tone="error">{error}</Alert>}

      <form
        action={completePasswordResetAction.bind(null, token)}
        className="flex flex-col gap-5"
      >
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <PasswordField
          name="password"
          label={messages.passwordReset.password}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
        />

        <PasswordField
          name="passwordRepeat"
          label={messages.passwordReset.passwordRepeat}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
        />

        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.passwordReset.submit}
        </button>
      </form>
    </main>
  );
}
