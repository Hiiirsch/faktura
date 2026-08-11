import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCompanyProfile, getCompanyProfileOrEmpty } from '@/application/company/company-profile';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { assetPath, COMPANY_SETTINGS_PATH } from '@/routes';
import { SECTION_CLASS, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { AppShell } from '../../app-shell';
import { CompanyForm } from './company-form';
import { LogoForm } from './logo-form';
import { removeLogoAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.company.title} · ${messages.app.name}` };

export default async function CompanySettingsPage(): Promise<ReactNode> {
  const session = await requireSession();
  const [profile, saved] = await Promise.all([
    getCompanyProfileOrEmpty(session.organization),
    getCompanyProfile(session.organization),
  ]);
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={COMPANY_SETTINGS_PATH}>
      <PageHeader title={messages.company.heading} description={messages.company.intro} />

        <NoScriptNotice message={messages.common.noScript} />

        <CompanyForm profile={profile} csrfToken={csrfToken} />

        <section className={SECTION_CLASS}>
          <div className="flex flex-col gap-1">
            <h2 className="text-section font-medium">{messages.company.sectionLogo}</h2>
            <p className="text-ui text-ink-muted">
              {messages.company.sectionLogoHint}
            </p>
          </div>

          {saved?.logoAssetId == null ? (
            <p className="text-ui text-ink-muted">
              {messages.company.logoNone}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              {/*
                Als <img> eingebunden, nie als Inline-SVG: So kann eine
                hochgeladene SVG-Datei kein Skript im Seitenkontext ausführen.
                Die Auslieferungsroute unterbindet Ausführung zusätzlich.
                eslint-disable-next-line @next/next/no-img-element — die
                Optimierung von next/image setzt einen Loader voraus, der
                Bilder über das Netz lädt; das ist hier unerwünscht.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetPath(saved.logoAssetId)}
                alt={messages.company.logoAlt}
                className="max-h-24 max-w-64 bg-surface p-2"
              />
              <form action={removeLogoAction}>
                <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                  {messages.company.logoRemove}
                </button>
              </form>
            </div>
          )}

          <LogoForm csrfToken={csrfToken} />
        </section>
    </AppShell>
  );
}
