import Link from 'next/link';
import type { ReactNode } from 'react';

import type { ActiveSession } from '@/application/auth/session-service';
import { getCompanyProfile } from '@/application/company/company-profile';
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
import { FOCUS_RING } from '@/ui/components/form';

import { logoutAction } from './auth-actions';

/**
 * Der Rahmen der angemeldeten Ansicht (Frontend-Entwurf §3, §7).
 *
 * Sidebar 240 px, **Textnavigation ohne Icons**: Icons in einer kurzen
 * Navigation sind Dekoration — sie kosten Platz und Ladezeit und tragen neben
 * fünf eindeutigen Wörtern nichts bei. Der aktive Eintrag ist durch Fläche und
 * einen 2 px breiten Balken markiert (FA-UI-12).
 *
 * Kopf- und Fußzone haben **feste Höhe** (FA-UI-15). Der Grund ist der spätere
 * Mehrbenutzerbetrieb: Ein Organisationswechsler und ein Kontomenü treten an
 * dieselbe Stelle, ohne dass sich darunter etwas verschiebt.
 *
 * Liegt in der Routen-Schicht statt in `src/ui`, weil er die Abmelde-Aktion
 * einbindet — Server Actions gehören nicht in die reine Anzeigeschicht.
 */

const NAVIGATION = [
  { href: DASHBOARD_PATH, label: messages.nav.dashboard },
  { href: INVOICES_PATH, label: messages.nav.invoices },
  { href: CUSTOMERS_PATH, label: messages.nav.customers },
  { href: CATALOG_PATH, label: messages.nav.catalog },
] as const;

const SETTINGS = [
  { href: COMPANY_SETTINGS_PATH, label: messages.nav.company },
  { href: NUMBERING_SETTINGS_PATH, label: messages.nav.numbering },
  { href: SECURITY_SETTINGS_PATH, label: messages.nav.security },
] as const;

function NavLink({
  href,
  label,
  currentPath,
}: {
  readonly href: string;
  readonly label: string;
  readonly currentPath: string;
}): ReactNode {
  const isActive = currentPath === href;

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={
        `border-l-2 px-3 py-2 text-ui transition-colors duration-(--duration-state) ${FOCUS_RING} ` +
        (isActive
          ? 'border-accent bg-accent-wash font-medium text-ink'
          : 'border-transparent text-ink-muted hover:text-ink')
      }
    >
      {label}
    </Link>
  );
}

/** Initialen aus der Anmeldeadresse — es gibt in V1 keinen erfassten Namen. */
function initialsOf(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]+/).filter((part) => part.length > 0);
  const letters = parts.slice(0, 2).map((part) => part.slice(0, 1));
  return (letters.join('') || email.slice(0, 1)).toUpperCase();
}

export async function AppShell({
  session,
  csrfToken,
  currentPath,
  children,
}: {
  readonly session: ActiveSession;
  readonly csrfToken: string;
  readonly currentPath: string;
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const company = await getCompanyProfile(session.organization);
  const organizationName =
    company === null || company.legalName.length === 0
      ? messages.nav.organizationFallback
      : company.legalName;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-rule bg-surface-sunken border-b lg:h-screen lg:w-sidebar lg:sticky lg:top-0 lg:border-r lg:border-b-0">
        {/* [ORG-ZONE] — feste Höhe, später der Organisationswechsler (§7). */}
        <div className="flex h-zone shrink-0 flex-col justify-center border-b border-rule px-4">
          <span className="text-ui font-semibold text-ink">{messages.app.name}</span>
          <span className="truncate text-small text-ink-muted">{organizationName}</span>
        </div>

        <nav aria-label={messages.nav.label} className="flex flex-1 flex-col gap-1 py-4">
          {NAVIGATION.map((item) => (
            <NavLink key={item.href} {...item} currentPath={currentPath} />
          ))}

          <span className="px-3 pt-6 pb-2 text-label font-semibold uppercase text-ink-faint">
            {messages.nav.settings}
          </span>
          {SETTINGS.map((item) => (
            <NavLink key={item.href} {...item} currentPath={currentPath} />
          ))}
        </nav>

        {/* [NUTZER-ZONE] — feste Höhe, später das Kontomenü (§7). */}
        <div
          aria-label={messages.nav.userZone}
          className="flex h-zone shrink-0 items-center gap-3 border-t border-rule px-4"
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent-wash text-label font-semibold text-accent"
          >
            {initialsOf(session.email)}
          </span>
          <span className="min-w-0 flex-1 truncate text-small text-ink-muted">
            {session.email}
          </span>
          <form action={logoutAction}>
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <button
              type="submit"
              className={`rounded-control px-2 py-1 text-small text-accent hover:text-accent-hover ${FOCUS_RING}`}
            >
              {messages.nav.logout}
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <main className="mx-auto flex max-w-content flex-col gap-6 px-8 pb-12">{children}</main>
      </div>
    </div>
  );
}
