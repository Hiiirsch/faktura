import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { loadInvitation } from '@/application/members/redeem';
import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { LOGIN_PATH } from '@/routes';
import { Alert, INPUT_CLASS, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';

import { acceptInvitationAction, type AcceptErrorCode } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.invitation.title} · ${messages.app.name}` };

function errorMessage(code: AcceptErrorCode | undefined): string | null {
  switch (code) {
    case 'invalid':
      return messages.invitation.invalid;
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
 * Eine Einladung annehmen (M8, FA-MEMB-02, -03, -05).
 *
 * **Öffentlich und trotzdem nicht offen.** Der Nachweis steht in der Adresse.
 * Ohne gültigen Token zeigt die Seite genau einen Satz und **kein Formular** —
 * weder die eingeladene Adresse noch den Namen des Unternehmens. Sonst ließe
 * sich mit geratenen Token ausprobieren, wer wo eingeladen wurde.
 *
 * Vier Fälle, eine Antwort (FA-MEMB-05): unbekannt, abgelaufen, zurückgezogen,
 * schon angenommen. Die Unterscheidung wäre eine Auskunft.
 *
 * Schmal und ohne Karte, wie die Anmeldung seit M6.1: Es gibt nichts, wovon
 * sich dieses Formular abheben müsste.
 */
export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { token } = await params;
  const offer = await loadInvitation(token);
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const rawError = (await searchParams).error;
  const error = errorMessage(
    typeof rawError === 'string' ? (rawError as AcceptErrorCode) : undefined,
  );

  if (!offer.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-login flex-col justify-center gap-6 px-6 py-16">
        <h1 className="text-page font-semibold text-ink">{messages.app.name}</h1>
        <Alert tone="error">{messages.invitation.invalid}</Alert>
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
        <h1 className="text-page font-semibold text-ink">{messages.invitation.heading}</h1>
        <p className="text-ui text-ink-muted">
          {messages.invitation.intro
            .replace('{organization}', offer.value.organizationName)
            .replace('{role}', offer.value.roleName)
            .replace('{email}', offer.value.email)}
        </p>
      </header>

      {error === null ? null : <Alert tone="error">{error}</Alert>}

      <form
        action={acceptInvitationAction.bind(null, token)}
        className="flex flex-col gap-5"
      >
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <label className="flex flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">{messages.invitation.name}</span>
          <input
            name="name"
            type="text"
            autoComplete="name"
            className={INPUT_CLASS}
            aria-describedby="name-hint"
          />
          <span id="name-hint" className="text-small text-ink-muted">
            {messages.invitation.nameHint}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">{messages.invitation.password}</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">
            {messages.invitation.passwordRepeat}
          </span>
          <input
            name="passwordRepeat"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            className={INPUT_CLASS}
          />
        </label>

        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.invitation.submit}
        </button>
      </form>
    </main>
  );
}
