import Link from 'next/link';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { ADMIN_ACCOUNTS_PATH, ADMIN_AUDIT_PATH, ADMIN_PATH } from '@/routes';
import { BrandLockup } from '@/ui/components/brand';
import { FOCUS_RING, QUIET_BUTTON_CLASS } from '@/ui/components/form';

import { adminLogoutAction } from './actions';

/**
 * Der Weg zwischen den Seiten der Verwaltung (M10, B1).
 *
 * **Ein Streifen, kein `AppShell`.** Der Rahmen der Mandanten zeigt Firmenname,
 * Konto und Rolle und lädt dafür das Firmenprofil — in der Verwaltung wäre das
 * die erste Stelle, an der Mandantendaten hereinsickern. Deshalb ein eigenes,
 * absichtlich karges Bauteil: Marke, die Ziele, die Adresse des Betreibers.
 *
 * **Waagerecht statt seitlich.** Die Verwaltung hat eine Handvoll Seiten, der
 * Mandantenbereich zwölf. Eine 240 px breite Leiste für zwei Einträge nimmt
 * Platz für eine Ordnung, die es nicht gibt.
 *
 * **Das Abmelden sitzt hier, nicht auf der Übersicht.** Dort stand es bis M10,
 * und mit einer einzigen Seite war das richtig. Sobald es zwei gibt, ist es ein
 * Fehler: Von der Kontenseite führte kein Weg hinaus, ohne vorher zurück zur
 * Übersicht zu gehen. Aufgefallen im Screenshot, nicht im Test — ein fehlender
 * Knopf ist kein Typfehler.
 *
 * Die Einträge tragen Text, keine Symbole. Der Frontend-Entwurf verlangt Symbol
 * **und** Text (FA-UI-12) — die Regel gilt der Seitenleiste, deren Symbole beim
 * Zielen helfen. Zwei waagerechte Wörter brauchen keine Piktogramme, und ein
 * halber Satz wäre schlechter als keiner.
 */
export function AdminNav({
  currentPath,
  email,
  csrfToken,
}: {
  readonly currentPath: string;
  readonly email: string;
  readonly csrfToken: string;
}): ReactNode {
  const items = [
    { href: ADMIN_PATH, label: messages.admin.navOrganizations },
    { href: ADMIN_ACCOUNTS_PATH, label: messages.admin.navAccounts },
    { href: ADMIN_AUDIT_PATH, label: messages.admin.navAudit },
  ];

  return (
    <header className="border-b border-rule bg-surface-sunken">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-6 px-8 py-3">
        <BrandLockup />

        <nav aria-label={messages.admin.navLabel} className="flex flex-1 items-center gap-1">
          {items.map((item) => {
            // Genau der Pfad, nicht sein Anfang: `/admin` wäre sonst auf jeder
            // Unterseite gleichzeitig aktiv.
            const active = currentPath === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-control px-3 py-1.5 text-ui ${FOCUS_RING} ${
                  active ? 'bg-accent-wash font-medium text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <span className="font-mono text-data text-ink-muted">{email}</span>

        <form action={adminLogoutAction}>
          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
          <button type="submit" className={QUIET_BUTTON_CLASS}>
            {messages.admin.logout}
          </button>
        </form>
      </div>
    </header>
  );
}
