import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import QRCode from 'qrcode';

import { requirePermission } from '@/application/auth/authorize';
import { getSecurityOverview } from '@/application/auth/security-overview';
import { beginTotpSetup } from '@/application/auth/totp-setup';
import { checkSystemStatus } from '@/application/system/check-system-status';
import { getAppTimeZone } from '@/application/system/display-settings';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { SECURITY_SETTINGS_PATH } from '@/routes';
import { SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';
import { formatDateTime } from '@/ui/format';

import { AppShell } from '../../app-shell';

import {
  disableTotpAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  revokeTrustedDeviceAction,
} from './actions';
import { RecoveryCodesForm } from './recovery-codes-form';
import { TotpSetupForm } from './totp-setup-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.security.title} · ${messages.app.name}` };

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requirePermission('security.read');
  const [overview, status] = await Promise.all([
    getSecurityOverview(session.userId, session.sessionId),
    checkSystemStatus(),
  ]);
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

      {/*
        Betriebszustand (NFA-BETR-08).
        Er steht hier und nicht auf der Übersicht: Die Übersicht beantwortet
        „wie läuft das Geschäft", diese Seite „läuft der Dienst". Dieselbe
        Auskunft liefert `/api/health` an Container und Reverse Proxy.
      */}
      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-section font-semibold text-ink">{messages.status.heading}</h2>
          <span
            className={
              'rounded-control px-3 py-1 text-ui font-medium text-ink ' +
              (status.healthy ? 'bg-moss-wash' : 'bg-ocker-wash')
            }
          >
            {status.healthy ? messages.status.healthy : messages.status.unhealthy}
          </span>
        </div>
        <p className="text-small text-ink-muted">{messages.status.intro}</p>

        <dl className="flex flex-col gap-3">
          {[
            {
              label: messages.status.componentDatabase,
              hint: messages.status.componentDatabaseDescription,
              state: status.components.database,
            },
            {
              label: messages.status.componentRenderer,
              hint: messages.status.componentRendererDescription,
              state: status.components.renderer,
            },
          ].map((component) => (
            <div
              key={component.label}
              className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-3 last:border-b-0"
            >
              <dt className="flex flex-col">
                <span className="text-ui font-medium text-ink">{component.label}</span>
                <span className="text-small text-ink-muted">{component.hint}</span>
              </dt>
              <dd className="text-ui text-ink">
                {component.state === 'UP' ? messages.status.stateUp : messages.status.stateDown}
              </dd>
            </div>
          ))}
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <dt className="text-ui text-ink-muted">{messages.status.checkedAt}</dt>
            <dd className="font-mono text-data text-ink">
              {formatDateTime(status.checkedAt, status.timeZone)}
            </dd>
          </div>
        </dl>
      </section>

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

      {/*
        Vertraute Geräte (M9, FA-TRUST-05).

        Neben den Sitzungen und nicht darin: Beides sind Spuren von Geräten, aber
        sie bedeuten Verschiedenes — eine Sitzung ist ein laufender Zugang, ein
        vertrautes Gerät ein erlassener Faktor beim **nächsten** Zugang.

        Sie stehen hier, weil ein Nachweis, den man nicht sieht, sich nicht
        widerrufen lässt.
      */}
      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <h2 className="text-section font-medium">{messages.security.trustedHeading}</h2>
        <p className="text-ui text-ink-muted">{messages.security.trustedIntro}</p>

        {overview.trustedDevices.length === 0 ? (
          <p className="text-ui text-ink-muted">{messages.security.trustedEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule">
            {overview.trustedDevices.map((device) => (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-ui font-medium">
                    {device.userAgent ?? messages.security.sessionUnknownDevice}
                  </span>
                  <span className="text-ui text-ink-muted">
                    {messages.security.trustedLastUsed}{' '}
                    {formatDateTime(device.lastUsedAt, timeZone)} ·{' '}
                    {messages.security.trustedExpires}{' '}
                    {formatDateTime(device.expiresAt, timeZone)}
                    {device.ipAddress === null ? '' : ` · ${device.ipAddress}`}
                  </span>
                </div>

                <form action={revokeTrustedDeviceAction}>
                  <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                  <input type="hidden" name="deviceId" value={device.id} />
                  <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                    {messages.security.trustedRevoke}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <p className="max-w-form text-small text-ink-muted">{messages.security.trustedNote}</p>
      </section>
    </AppShell>
  );
}
