import { headers } from 'next/headers';
import Link from 'next/link';
import QRCode from 'qrcode';
import type { ReactNode } from 'react';

import { loadAdminSetup } from '@/application/admin/admin-setup';
import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { ADMIN_LOGIN_PATH } from '@/routes';
import { Alert, INPUT_CLASS, PRIMARY_BUTTON_CLASS } from '@/ui/components/form';

import { type AdminSetupErrorCode, completeAdminSetupAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.admin.setupTitle} · ${messages.app.name}` };

function errorMessage(code: AdminSetupErrorCode | undefined): string | null {
  switch (code) {
    case 'invalid':
      return messages.admin.setupInvalid;
    case 'mismatch':
      return messages.password.mismatch;
    case 'tooShort':
      return messages.password.tooShort.replace('{min}', String(MIN_PASSWORD_LENGTH));
    case 'compromised':
      return messages.password.compromised;
    case 'code':
      return messages.admin.setupInvalidCode;
    case 'taken':
      return messages.admin.setupEmailTaken;
    case 'rejected':
      return messages.common.rejected;
    default:
      return null;
  }
}

/**
 * Ein Betreiberkonto einrichten (M8, FA-ADM-06, -08).
 *
 * **Öffentlich und trotzdem nicht offen.** Der Nachweis steht in der Adresse.
 * Ohne gültigen Token zeigt die Seite einen Satz und **kein Formular** — weder
 * die Adresse noch das Geheimnis.
 *
 * Das Konto entsteht erst beim Absenden, vollständig: Passwort und zweiter
 * Faktor in einer Transaktion. Damit gibt es zu keinem Zeitpunkt ein
 * Betreiberkonto ohne zweiten Faktor (FA-ADM-08).
 *
 * Schmal und ohne Karte, wie die Anmeldung und die Einladungsseite: Es gibt
 * nichts, wovon sich dieses Formular abheben müsste.
 */
export default async function AdminSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { token } = await params;
  const offer = await loadAdminSetup(token);
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const rawError = (await searchParams).error;
  const error = errorMessage(
    typeof rawError === 'string' ? (rawError as AdminSetupErrorCode) : undefined,
  );

  if (!offer.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-login flex-col justify-center gap-6 px-6 py-16">
        <h1 className="text-page font-semibold text-ink">{messages.app.name}</h1>
        <Alert tone="error">{messages.admin.setupInvalid}</Alert>
        <Link href={ADMIN_LOGIN_PATH} className="text-ui text-accent hover:text-accent-hover">
          {messages.invitation.toLogin}
        </Link>
      </main>
    );
  }

  // Serverseitig erzeugt, reine Vektorgrafik aus dem eigenen Prozess — kein
  // Skript darin und keine Anfrage nach außen (NFA-UI-04).
  const qrCodeSvg = await QRCode.toString(offer.value.uri, {
    type: 'svg',
    margin: 1,
    width: 200,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-login flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <span className="text-label font-semibold uppercase text-ink-faint">
          {messages.app.name}
        </span>
        <h1 className="text-page font-semibold text-ink">{messages.admin.setupHeading}</h1>
        <p className="text-ui text-ink-muted">
          {messages.admin.setupIntro.replace('{email}', offer.value.email)}
        </p>
      </header>

      {error === null ? null : <Alert tone="error">{error}</Alert>}

      <form
        action={completeAdminSetupAction.bind(null, token)}
        className="flex flex-col gap-5"
      >
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

        <label className="flex flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">{messages.admin.setupName}</span>
          <input
            name="name"
            type="text"
            autoComplete="name"
            className={INPUT_CLASS}
            aria-describedby="name-hint"
          />
          <span id="name-hint" className="text-small text-ink-muted">
            {messages.admin.setupNameHint}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">{messages.admin.setupPassword}</span>
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
            {messages.admin.setupPasswordRepeat}
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

        <div className="flex flex-col gap-3 border-t border-rule pt-5">
          <p className="text-ui text-ink-muted">{messages.admin.setupScan}</p>

          <div
            className="w-fit rounded-control bg-surface p-3"
            dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
          />

          <p className="text-ui text-ink-muted">{messages.admin.setupManualEntry}</p>
          <code className="w-fit rounded-control bg-surface-sunken px-2 py-1 font-mono text-ui">
            {offer.value.secret}
          </code>

          <p className="text-small text-ink-muted">{messages.admin.setupNoRecoveryCodes}</p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">{messages.admin.setupCode}</span>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className={`${INPUT_CLASS} font-mono`}
          />
        </label>

        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.admin.setupSubmit}
        </button>
      </form>
    </main>
  );
}
