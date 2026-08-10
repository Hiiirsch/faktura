import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import QRCode from 'qrcode';

import { requireSession } from '@/application/auth/require-session';
import { getSecurityOverview } from '@/application/auth/security-overview';
import { beginTotpSetup } from '@/application/auth/totp-setup';
import { getAppTimeZone } from '@/application/system/display-settings';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { DASHBOARD_PATH, SECURITY_SETTINGS_PATH } from '@/routes';
import { formatDateTime } from '@/ui/format';

import { disableTotpAction, revokeOtherSessionsAction, revokeSessionAction } from './actions';
import { RecoveryCodesForm } from './recovery-codes-form';
import { TotpSetupForm } from './totp-setup-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.security.title} · ${messages.app.name}` };

const SECONDARY_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 ' +
  'dark:border-neutral-700 dark:hover:bg-neutral-800';

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requireSession();
  const overview = await getSecurityOverview(session.userId, session.sessionId);
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  const timeZone = getAppTimeZone();

  const params = await searchParams;
  const isSettingUp = params.setup === '1' && !overview.totpEnabled;

  // Geheimnis und QR-Code entstehen im selben Rendervorgang und gehören damit
  // zwingend zusammen. Gespeichert wird erst beim Bestätigen.
  const setupOffer = isSettingUp ? beginTotpSetup(session.email) : null;
  const qrCodeSvg =
    setupOffer === null
      ? null
      : await QRCode.toString(setupOffer.uri, { type: 'svg', margin: 1, width: 200 });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <Link
          href={DASHBOARD_PATH}
          className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
        >
          {messages.security.back}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{messages.security.heading}</h1>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">{messages.security.totpHeading}</h2>
          <span
            className={
              overview.totpEnabled
                ? 'rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-900 dark:bg-green-950 dark:text-green-200'
                : 'rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
            }
          >
            {overview.totpEnabled ? messages.security.totpEnabled : messages.security.totpDisabled}
          </span>
        </div>

        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {messages.security.totpIntro}
        </p>

        {overview.totpEnabled ? (
          <div className="flex flex-col gap-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <RecoveryCodesForm csrfToken={csrfToken} unusedCount={overview.unusedRecoveryCodes} />

            <form action={disableTotpAction}>
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <button type="submit" className={SECONDARY_BUTTON}>
                {messages.security.totpDisable}
              </button>
            </form>
          </div>
        ) : setupOffer !== null && qrCodeSvg !== null ? (
          <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <TotpSetupForm
              secret={setupOffer.secret}
              csrfToken={csrfToken}
              qrCodeSvg={qrCodeSvg}
            />
            <Link
              href={SECURITY_SETTINGS_PATH}
              className="mt-4 inline-block text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
            >
              {messages.security.totpCancel}
            </Link>
          </div>
        ) : (
          <Link href={`${SECURITY_SETTINGS_PATH}?setup=1`} className={`${SECONDARY_BUTTON} w-fit`}>
            {messages.security.totpStart}
          </Link>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-medium">{messages.security.sessionsHeading}</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {messages.security.sessionsIntro}
        </p>

        <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
          {overview.sessions.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  {entry.userAgent ?? messages.security.sessionUnknownDevice}
                  {entry.isCurrent ? ` · ${messages.security.sessionCurrent}` : ''}
                </span>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {messages.security.sessionLastSeen}{' '}
                  {formatDateTime(entry.lastSeenAt, timeZone)}
                  {entry.ipAddress === null ? '' : ` · ${entry.ipAddress}`}
                </span>
              </div>

              {entry.isCurrent ? null : (
                <form action={revokeSessionAction}>
                  <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                  <input type="hidden" name="sessionId" value={entry.id} />
                  <button type="submit" className={SECONDARY_BUTTON}>
                    {messages.security.sessionRevoke}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        {overview.sessions.length > 1 ? (
          <form action={revokeOtherSessionsAction}>
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <button type="submit" className={SECONDARY_BUTTON}>
              {messages.security.sessionRevokeAll}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
