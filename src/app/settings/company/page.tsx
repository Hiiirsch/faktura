import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { getCompanyProfile, getCompanyProfileOrEmpty } from '@/application/company/company-profile';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { assetPath, COMPANY_SETTINGS_PATH } from '@/routes';
import { CARD_CLASS, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';

import { AppNav } from '../../app-nav';
import { CompanyForm } from './company-form';
import { LogoForm } from './logo-form';
import { removeLogoAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.company.title} · ${messages.app.name}` };

export default async function CompanySettingsPage(): Promise<ReactNode> {
  const session = await requireSession();
  const [profile, saved] = await Promise.all([getCompanyProfileOrEmpty(), getCompanyProfile()]);
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <>
      <AppNav currentPath={COMPANY_SETTINGS_PATH} csrfToken={csrfToken} email={session.email} />

      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{messages.company.heading}</h1>
          <p className="text-neutral-600 dark:text-neutral-400">{messages.company.intro}</p>
        </header>

        <NoScriptNotice message={messages.common.noScript} />

        <CompanyForm profile={profile} csrfToken={csrfToken} />

        <section className={CARD_CLASS}>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium">{messages.company.sectionLogo}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {messages.company.sectionLogoHint}
            </p>
          </div>

          {saved?.logoAssetId == null ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
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
                className="max-h-24 max-w-64 bg-white p-2"
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
      </main>
    </>
  );
}
