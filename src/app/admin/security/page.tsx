import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { getAdminSecurityOverview } from '@/application/admin/admin-security';
import { requireAdminSession } from '@/application/admin/require-admin-session';
import { messages } from '@/i18n/de';
import { getAppTimeZone } from '@/application/system/display-settings';
import { isPasskeyCapableOrigin } from '@/infrastructure/auth/webauthn';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { ADMIN_PASSKEY_PATH, ADMIN_SECURITY_PATH } from '@/routes';
import { Alert, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';
import { Toast } from '@/ui/components/toast';
import { formatDate, formatDateTime } from '@/ui/format';

import { AdminNav } from '../admin-nav';
import { PasskeyForm } from '../../passkey-form';

import {
  removeAdminPasskeyAction,
  revokeAdminSessionAction,
  revokeOtherAdminSessionsAction,
} from './actions';
import { AdminPasswordForm } from './password-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.adminSecurity.title} · ${messages.app.name}` };

/** Rückmeldung aus der Adresse — dasselbe Muster wie bei den Mandanten (M5.8). */
function noticeFor(key: string | undefined): string | null {
  switch (key) {
    case 'sitzung-beendet':
      return messages.adminSecurity.sessionRevoked;
    case 'andere-sitzungen-beendet':
      return messages.adminSecurity.otherSessionsRevoked;
    case 'passkey-entfernt':
      return messages.adminSecurity.passkeyRemoved;
    default:
      return null;
  }
}

/**
 * Die eigene Sicherheit eines Betreiberkontos (M14.1, FA-ADM-18, -19).
 *
 * **Das Gegenstück zu `/settings/security`, aber nicht dessen Kopie.** Drei
 * Abschnitte der Mandantenseite fehlen hier, und alle drei fehlen aus einem
 * Grund:
 *
 * - **Zweiter Faktor abschalten** — gibt es nicht. Für Betreiberkonten ist er
 *   verpflichtend (FA-ADM-08); ein Knopf dafür wäre ein Knopf gegen den
 *   Katalog. Der Abschnitt steht trotzdem da, weil die Frage sonst offen
 *   bliebe: Er sagt, warum es ihn nicht gibt und was bei Verlust hilft.
 * - **Wiederherstellungscodes** — gibt es ebenfalls nicht; der Ausweg ist
 *   `admin:reset` auf dem Server oder ein zweiter Betreiber.
 * - **Vertraute Geräte** — für die Verwaltung nicht vorgesehen (FA-ADM-08), es
 *   gibt also nichts anzuzeigen und nichts zu widerrufen.
 *
 * **Der Betriebszustand fehlt hier ebenfalls**, obwohl er auf der
 * Mandantenseite steht: Er hat unter `/admin/operations` längst einen Platz,
 * und zweimal dieselbe Auskunft sind zwei Stellen, die auseinanderlaufen
 * können.
 */
export default async function AdminSecurityPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const session = await requireAdminSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  const params = await searchParams;

  const done = params['erledigt'];
  const notice = noticeFor(typeof done === 'string' ? done : undefined);

  const overview = await getAdminSecurityOverview(session.platform, session.sessionId);
  const timeZone = getAppTimeZone();
  const passkeysPossible = isPasskeyCapableOrigin();

  return (
    <>
      <AdminNav currentPath={ADMIN_SECURITY_PATH} email={session.email} csrfToken={csrfToken} />

      <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 pb-12">
        <PageHeader
          title={messages.adminSecurity.heading}
          description={messages.adminSecurity.intro}
        />

        {notice === null ? null : <Toast message={notice} />}

        <section className="flex flex-col gap-4 border-t border-rule pt-6">
          <h2 className="text-section font-medium">{messages.adminSecurity.passwordHeading}</h2>
          <p className="max-w-form text-ui text-ink-muted">
            {messages.adminSecurity.passwordIntro}
          </p>

          <AdminPasswordForm csrfToken={csrfToken} />
        </section>

        <section className="flex flex-col gap-4 border-t border-rule pt-6">
          <h2 className="text-section font-medium">{messages.adminSecurity.totpHeading}</h2>
          <p className="max-w-text text-ui text-ink-muted">{messages.adminSecurity.totpIntro}</p>
        </section>

        {/*
          Passkeys vor den Sitzungen: Sie sind der stärkste Anmeldeweg, und die
          Reihenfolge auf der Seite soll das sagen — dieselbe Anordnung wie bei
          den Mandanten.
        */}
        <section className="flex flex-col gap-4 border-t border-rule pt-6">
          <h2 className="text-section font-medium">{messages.adminSecurity.passkeyHeading}</h2>
          <p className="max-w-form text-ui text-ink-muted">
            {messages.adminSecurity.passkeyIntro}
          </p>

          {overview.passkeys.length === 0 ? (
            <p className="text-ui text-ink-muted">{messages.adminSecurity.passkeyEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-rule">
              {overview.passkeys.map((passkey) => (
                <li
                  key={passkey.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-ui font-medium">{passkey.label}</span>
                    <span className="text-ui text-ink-muted">
                      {messages.security.passkeyCreated.replace(
                        '{date}',
                        formatDate(passkey.createdAt, timeZone),
                      )}
                      {' · '}
                      {passkey.lastUsedAt === null
                        ? messages.security.passkeyNeverUsed
                        : `${messages.security.passkeyLastUsed} ${formatDateTime(passkey.lastUsedAt, timeZone)}`}
                    </span>
                    {passkey.disabled ? (
                      <span className="text-small text-ink">
                        {messages.security.passkeyDisabled}
                      </span>
                    ) : null}
                  </div>

                  <form action={removeAdminPasskeyAction}>
                    <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                    <input type="hidden" name="passkeyId" value={passkey.id} />
                    <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                      {messages.adminSecurity.passkeyRemove}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {passkeysPossible ? (
            <PasskeyForm endpoint={ADMIN_PASSKEY_PATH} csrfToken={csrfToken} />
          ) : (
            <Alert tone="error">{messages.security.passkeyUnsupported}</Alert>
          )}

          <p className="max-w-form text-small text-ink-muted">
            {messages.security.passkeyDomainNote}
          </p>
        </section>

        <section className="flex flex-col gap-4 border-t border-rule pt-6">
          <h2 className="text-section font-medium">{messages.adminSecurity.sessionsHeading}</h2>
          <p className="text-ui text-ink-muted">{messages.adminSecurity.sessionsIntro}</p>

          <ul className="flex flex-col divide-y divide-rule">
            {overview.sessions.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-ui font-medium">
                    {entry.userAgent ?? messages.adminSecurity.sessionUnknownDevice}
                    {entry.isCurrent ? ` · ${messages.adminSecurity.sessionCurrent}` : ''}
                  </span>
                  <span className="text-ui text-ink-muted">
                    {messages.adminSecurity.sessionLastSeen}{' '}
                    {formatDateTime(entry.lastSeenAt, timeZone)}
                    {entry.ipAddress === null ? '' : ` · ${entry.ipAddress}`}
                  </span>
                </div>

                {entry.isCurrent ? null : (
                  <form action={revokeAdminSessionAction}>
                    <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                    <input type="hidden" name="sessionId" value={entry.id} />
                    <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                      {messages.adminSecurity.sessionRevoke}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          {overview.sessions.length > 1 ? (
            <form action={revokeOtherAdminSessionsAction}>
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                {messages.adminSecurity.sessionRevokeAll}
              </button>
            </form>
          ) : null}
        </section>
      </main>
    </>
  );
}
