import {
  Building2,
  DatabaseBackup,
  FileText,
  Hash,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  type LucideIcon,
  Package,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { authorize } from '@/application/auth/authorize';
import type { ActiveSession } from '@/application/auth/session-service';
import { getCompanyProfile } from '@/application/company/company-profile';
import { holds, type PermissionKey } from '@/domain/policy/can';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import {
  EXPORT_SETTINGS_PATH,
  CATALOG_PATH,
  MEMBERS_SETTINGS_PATH,
  ROLES_SETTINGS_PATH,
  COMPANY_SETTINGS_PATH,
  CUSTOMERS_PATH,
  DASHBOARD_PATH,
  INVOICES_PATH,
  NUMBERING_SETTINGS_PATH,
  SECURITY_SETTINGS_PATH,
  TEMPLATE_SETTINGS_PATH,
} from '@/routes';
import { FOCUS_RING } from '@/ui/components/form';
import { ICON_STROKE } from '@/ui/components/icon';

import { logoutAction } from './auth-actions';

/**
 * Der Rahmen der angemeldeten Ansicht (Frontend-Entwurf §3, §7).
 *
 * Sidebar 240 px. Jeder Eintrag trägt **Symbol und Text** (FA-UI-12, seit
 * M5.8): Das Symbol hilft beim Zielen, der Text bleibt die Auskunft — ein
 * Symbol ohne Beschriftung gibt es in dieser Navigation nicht. Alle stammen
 * aus einem Satz und werden nie eingefärbt außer in `currentColor`; zwei
 * Strichstärken in einer Liste liest man sofort, ohne benennen zu können, was
 * stört.
 *
 * Der aktive Eintrag ist durch Fläche **und** einen 2 px breiten Balken
 * markiert, nie durch Farbe allein (FA-UI-12).
 *
 * Kopf- und Fußzone haben **feste Höhe** (FA-UI-15). Der Grund ist der spätere
 * Mehrbenutzerbetrieb: Ein Organisationswechsler und ein Kontomenü treten an
 * dieselbe Stelle, ohne dass sich darunter etwas verschiebt.
 *
 * Liegt in der Routen-Schicht statt in `src/ui`, weil er die Abmelde-Aktion
 * einbindet — Server Actions gehören nicht in die reine Anzeigeschicht.
 */

/**
 * Ein Eintrag der Navigation samt dem Recht, das ihn sichtbar macht (M8).
 *
 * Ohne diese Angabe stünde in der Seitenleiste ein Weg, der mit 404 endet:
 * `requirePermission` antwortet auf einer Seite ohne Recht mit „nicht
 * gefunden", und ein Menüpunkt, der ins Nichts führt, ist schlechter als
 * keiner. Die Zuordnung ist deshalb dieselbe wie in der Seite selbst — der
 * schwächste Schlüssel, den die Seite verlangt.
 */
type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** `undefined` heißt: für jedes angemeldete Konto sichtbar. */
  readonly permission?: PermissionKey;
};

const NAVIGATION: readonly NavItem[] = [
  { href: DASHBOARD_PATH, label: messages.nav.dashboard, icon: LayoutDashboard },
  { href: INVOICES_PATH, label: messages.nav.invoices, icon: FileText, permission: 'invoice.read' },
  {
    href: CUSTOMERS_PATH,
    label: messages.nav.customers,
    icon: Users,
    permission: 'customer.read',
  },
  { href: CATALOG_PATH, label: messages.nav.catalog, icon: Package, permission: 'catalogItem.read' },
];

const SETTINGS: readonly NavItem[] = [
  {
    href: COMPANY_SETTINGS_PATH,
    label: messages.nav.company,
    icon: Building2,
    // Die Seite ist das Bearbeitungsformular; `companyProfile.read` allein ist
    // ein Grundrecht und würde sie jedem zeigen.
    permission: 'companyProfile.update',
  },
  {
    href: NUMBERING_SETTINGS_PATH,
    label: messages.nav.numbering,
    icon: Hash,
    permission: 'numbering.read',
  },
  {
    href: TEMPLATE_SETTINGS_PATH,
    label: messages.templates.title,
    icon: LayoutTemplate,
    permission: 'template.read',
  },
  {
    href: MEMBERS_SETTINGS_PATH,
    label: messages.nav.members,
    icon: UserCog,
    permission: 'organization.administer',
  },
  {
    href: ROLES_SETTINGS_PATH,
    label: messages.nav.roles,
    icon: KeyRound,
    permission: 'organization.administer',
  },
  // Die eigene Sicherheit ist keine Rechtefrage — `security.read` ist ein
  // Grundrecht, und der Eintrag steht für jedes Konto.
  { href: SECURITY_SETTINGS_PATH, label: messages.nav.security, icon: ShieldCheck },
  {
    href: EXPORT_SETTINGS_PATH,
    label: messages.nav.backup,
    icon: DatabaseBackup,
    permission: 'export.run',
  },
];

/** Die Einträge, die dieses Konto benutzen kann. */
function visibleTo(items: readonly NavItem[], session: ActiveSession): readonly NavItem[] {
  return items.filter(
    (item) => item.permission === undefined || holds(session.actor, item.permission),
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  currentPath,
}: {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly currentPath: string;
}): ReactNode {
  const isActive = currentPath === href;

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={
        `flex items-center gap-3 border-l-2 px-3 py-2 text-ui transition-colors ` +
        `duration-(--duration-state) ${FOCUS_RING} ` +
        (isActive
          ? 'border-accent bg-accent-wash font-medium text-ink'
          : 'border-transparent text-ink-muted hover:text-ink')
      }
    >
      {/* Das Symbol ist Zielhilfe, nicht Auskunft — für Hilfstechnik gilt der
          Text daneben. */}
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
      {label}
    </Link>
  );
}

/**
 * Initialen für die Kontozone.
 *
 * Aus dem erfassten Namen, wo es einen gibt (seit M8) — sonst aus dem Teil der
 * Adresse vor dem `@`. Der Rückfall bleibt, weil ein Name freiwillig ist: Wer
 * eine Einladung ohne Namen annimmt, soll nicht mit einem leeren Kreis dasitzen.
 */
function initialsOf(name: string | null, email: string): string {
  const source = name === null || name.trim().length === 0 ? (email.split('@')[0] ?? email) : name;
  const parts = source.split(/[\s._-]+/u).filter((part) => part.length > 0);
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
  // `companyProfile.read` ist ein Grundrecht (`BASE_PERMISSIONS`) — die Schale
  // gibt es für jedes angemeldete Konto, und den Namen des eigenen Arbeitgebers
  // zu kennen ist keine Rechtefrage.
  const company = await getCompanyProfile(authorize(session, 'companyProfile.read'));
  const organizationName =
    company === null || company.legalName.length === 0
      ? messages.nav.organizationFallback
      : company.legalName;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-rule bg-surface-sunken border-b lg:h-screen lg:w-sidebar lg:sticky lg:top-0 lg:border-r lg:border-b-0">
        {/*
          [ORG-ZONE] — Anwendung und Unternehmen (FA-UI-15).
          
          Die Zone war seit M5.5b für einen **Organisationswechsler**
          freigehalten. Den wird es nicht geben: Eine Adresse gehört zu genau
          einem Unternehmen (FA-ORG-04), also gibt es nichts zu wechseln. Wer
          zwei Unternehmen führt, führt zwei Konten und meldet sich um.
          
          Die feste Höhe bleibt — sie hält die Navigation darunter an ihrem
          Platz, unabhängig davon, wie lang der Unternehmensname ist.
        */}
        <div className="flex h-zone shrink-0 flex-col justify-center border-b border-rule px-4">
          <span className="text-ui font-semibold text-ink">{messages.app.name}</span>
          <span className="truncate text-small text-ink-muted">{organizationName}</span>
        </div>

        <nav aria-label={messages.nav.label} className="flex flex-1 flex-col gap-1 py-4">
          {visibleTo(NAVIGATION, session).map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              currentPath={currentPath}
            />
          ))}

          <span className="px-3 pt-6 pb-2 text-label font-semibold uppercase text-ink-faint">
            {messages.nav.settings}
          </span>
          {visibleTo(SETTINGS, session).map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              currentPath={currentPath}
            />
          ))}
        </nav>

        {/*
          [NUTZER-ZONE] — Konto und Rolle (FA-UI-15).
          
          Seit M8 steht hier, **wer** angemeldet ist und **als was**: Name (oder
          Adresse, solange kein Name erfasst ist) und der Name der Rolle. Die
          Rolle gehört dazu, weil sie erklärt, warum die Navigation darüber so
          aussieht, wie sie aussieht — ein Konto ohne `invoice.read` sieht keinen
          Eintrag „Rechnungen" und soll den Grund nicht raten müssen.
          
          Kein aufklappbares Menü: Darin stünden genau zwei Einträge, und beide
          gibt es schon — „Sicherheit" in der Navigation, „Abmelden" hier. Ein
          Menü wäre ein Klick mehr für nichts.
        */}
        <div
          aria-label={messages.nav.userZone}
          className="flex h-zone shrink-0 items-center gap-3 border-t border-rule px-4"
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent-wash text-label font-semibold text-accent"
          >
            {initialsOf(session.name, session.email)}
          </span>

          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-small font-medium text-ink">
              {session.name ?? session.email}
            </span>
            <span className="truncate text-label text-ink-faint">
              {session.roleName ?? messages.nav.roleMissing}
            </span>
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
