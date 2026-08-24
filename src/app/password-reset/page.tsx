import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { isMailConfigured } from '@/infrastructure/mail/mailer';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { LOGIN_PATH } from '@/routes';
import { Alert, INPUT_CLASS, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';
import { BrandLockup } from '@/ui/components/brand';
import { FOCUS_RING } from '@/ui/components/form';

import { LegalFooter } from '../legal-footer';
import { requestPasswordResetAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.passwordReset.requestTitle} · ${messages.app.name}` };

/**
 * „Passwort vergessen" (M14, B3, FA-MEMB-08).
 *
 * **Die Antwort ist immer dieselbe.** Unbekannte Adresse, gesperrtes Konto,
 * stillgelegtes Unternehmen, Bremse gegriffen, Erfolg — fünf Fälle, ein Satz.
 * Alles andere wäre eine Auskunft darüber, wer hier ein Konto hat, und die
 * bekäme jeder, der eine Adresse ausprobiert.
 *
 * **Ohne eingerichteten Versand verspricht die Seite keine Mail**, sondern nennt
 * den Weg über die Rechteverwaltung. Das ist keine Auskunft über ein Konto,
 * sondern über die Anlage — sie gilt für alle gleich und verrät nichts.
 *
 * Ein Server-Formular ohne JavaScript: Wer sein Passwort vergessen hat, steht
 * ohnehin vor der Tür (NFA-UI-06).
 */
export default async function PasswordResetRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  const params = await searchParams;
  const sent = params.gesendet === '1';
  const canDeliver = isMailConfigured();

  return (
    <main className="mx-auto flex w-full max-w-login flex-col gap-6 px-6 py-16">
      <BrandLockup />

      <div className="flex flex-col gap-2">
        <h1 className="text-page font-semibold text-ink">{messages.passwordReset.requestHeading}</h1>
        <p className="text-ui text-ink-muted">
          {canDeliver
            ? messages.passwordReset.requestIntro
            : messages.passwordReset.requestNoMailHint}
        </p>
      </div>

      {sent ? <Alert tone="note">{messages.passwordReset.requestDone}</Alert> : null}

      {canDeliver ? (
        <form action={requestPasswordResetAction} className="flex flex-col gap-4">
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
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <button type="submit" className={PRIMARY_BUTTON_CLASS}>
              {messages.passwordReset.requestSubmit}
            </button>
          </div>
        </form>
      ) : null}

      <Link href={LOGIN_PATH} className={`text-ui text-accent underline underline-offset-4 ${FOCUS_RING}`}>
        {messages.passwordReset.backToLogin}
      </Link>

      <LegalFooter />
    </main>
  );
}
