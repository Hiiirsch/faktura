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
import { SECURITY_SETTINGS_PATH } from '@/routes';
import { SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';
import { formatDateTime } from '@/ui/format';

import { AppShell } from '../../app-shell';

import { disableTotpAction, revokeOtherSessionsAction, revokeSessionAction } from './actions';
import { RecoveryCodesForm } from './recovery-codes-form';
import { TotpSetupForm } from './totp-setup-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.security.title} · ${messages.app.name}` };

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
    <AppShell session={session} csrfToken={csrfToken} currentPath={SECURITY_SETTINGS_PATH}>
      <PageHeader title={messages.security.heading} />

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-section font-medium">{messages.security.totpHeading}</h2>
          <span
            className={
              overview.totpEnabled
                ? 'rounded-control bg-moss-wash px-3 py-1 text-ui font-medium text-ink'
                : 'rounded-control bg-surface-sunken px-3 py-1 text-ui font-medium text-ink-muted  '
            }
          >
            {overview.totpEnabled ? messages.security.totpEnabled : messages.security.totpDisabled}
          </span>
        </div>

        <p className="text-ui text-ink-muted">
          {messages.security.totpIntro}
        </p>

        {overview.totpEnabled ? (
          <div className="flex flex-col gap-6 border-t border-rule pt-4">
            <RecoveryCodesForm csrfToken={csrfToken} unusedCount={overview.unusedRecoveryCodes} />

            <form action={disableTotpAction}>
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                {messages.security.totpDisable}
              </button>
            </form>
          </div>
        ) : setupOffer !== null && qrCodeSvg !== null ? (
          <div className="border-t border-rule pt-4">
            <TotpSetupForm
              secret={setupOffer.secret}
              csrfToken={csrfToken}
              qrCodeSvg={qrCodeSvg}
            />
            <Link
              href={SECURITY_SETTINGS_PATH}
              className="mt-4 inline-block text-ui text-ink-muted underline underline-offset-4"
            >
              {messages.security.totpCancel}
            </Link>
          </div>
        ) : (
          <Link href={`${SECURITY_SETTINGS_PATH}?setup=1`} className={`${SECONDARY_BUTTON_CLASS} w-fit`}>
            {messages.security.totpStart}
          </Link>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <h2 className="text-section font-medium">{messages.security.sessionsHeading}</h2>
        <p className="text-ui text-ink-muted">
          {messages.security.sessionsIntro}
        </p>

        <ul className="flex flex-col divide-y divide-rule">
          {overview.sessions.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-col gap-1">
                <span className="text-ui font-medium">
                  {entry.userAgent ?? messages.security.sessionUnknownDevice}
                  {entry.isCurrent ? ` · ${messages.security.sessionCurrent}` : ''}
                </span>
                <span className="text-ui text-ink-muted">
                  {messages.security.sessionLastSeen}{' '}
                  {formatDateTime(entry.lastSeenAt, timeZone)}
                  {entry.ipAddress === null ? '' : ` · ${entry.ipAddress}`}
                </span>
              </div>

              {entry.isCurrent ? null : (
                <form action={revokeSessionAction}>
                  <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                  <input type="hidden" name="sessionId" value={entry.id} />
                  <button type="submit" className={SECONDARY_BUTTON_CLASS}>
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
            <button type="submit" className={SECONDARY_BUTTON_CLASS}>
              {messages.security.sessionRevokeAll}
            </button>
          </form>
        ) : null}
      </section>
    </AppShell>
  );
}
