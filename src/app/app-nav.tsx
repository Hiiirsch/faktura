import Link from 'next/link';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import {
  CATALOG_PATH,
  COMPANY_SETTINGS_PATH,
  CUSTOMERS_PATH,
  DASHBOARD_PATH,
  INVOICES_PATH,
  NUMBERING_SETTINGS_PATH,
  SECURITY_SETTINGS_PATH,
} from '@/routes';

import { logoutAction } from './auth-actions';

const LINK_CLASS =
  'rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100 focus:outline-none ' +
  'focus:ring-2 focus:ring-neutral-400 dark:hover:bg-neutral-800';

const ACTIVE_LINK_CLASS = `${LINK_CLASS} bg-neutral-100 dark:bg-neutral-800`;

const ITEMS = [
  { href: DASHBOARD_PATH, label: messages.nav.dashboard },
  { href: INVOICES_PATH, label: messages.nav.invoices },
  { href: CUSTOMERS_PATH, label: messages.nav.customers },
  { href: CATALOG_PATH, label: messages.nav.catalog },
  { href: COMPANY_SETTINGS_PATH, label: messages.nav.company },
  { href: NUMBERING_SETTINGS_PATH, label: messages.nav.numbering },
  { href: SECURITY_SETTINGS_PATH, label: messages.nav.security },
] as const;

/**
 * Navigation der angemeldeten Ansicht.
 *
 * Liegt in der Routen-Schicht statt in `src/ui`, weil sie die Abmelde-Aktion
 * einbindet — Server Actions gehören nicht in die reine Anzeigeschicht.
 */
export function AppNav({
  currentPath,
  csrfToken,
  email,
}: {
  readonly currentPath: string;
  readonly csrfToken: string;
  readonly email: string;
}): ReactNode {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <nav aria-label={messages.nav.label} className="flex flex-wrap items-center gap-1">
          <span className="pr-3 text-sm font-semibold">{messages.app.name}</span>
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={currentPath === item.href ? 'page' : undefined}
              className={currentPath === item.href ? ACTIVE_LINK_CLASS : LINK_CLASS}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">{email}</span>
          <form action={logoutAction}>
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <button type="submit" className={LINK_CLASS}>
              {messages.nav.logout}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
