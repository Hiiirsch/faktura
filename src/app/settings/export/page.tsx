import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { DATA_EXPORT_PATH, EXPORT_SETTINGS_PATH } from '@/routes';
import { PRIMARY_BUTTON_CLASS, SECTION_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { AppShell } from '../../app-shell';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.backup.title} · ${messages.app.name}` };

/**
 * Datenexport des eigenen Unternehmens (NFA-COMP-03).
 *
 * **Was hier seit M8 nicht mehr steht: die Sicherung.** Sie umfasst die
 * Datenbankdatei als Ganzes, also alle Unternehmen, und ist damit eine
 * Handlung des Betreibers — sie liegt in der zentralen Verwaltung
 * (NFA-SEC-23). Übrig bleibt der Export, der genau die Daten dieses
 * Unternehmens liefert.
 *
 * Die Schritte der Wiederherstellung bleiben zur Kenntnis stehen: Wer den
 * Export in der Hand hält, soll wissen, wie der Weg zurück aussieht und wer
 * ihn geht.
 *
 * Der Download ist ein Verweis, keine Server Action: Der Browser soll die
 * Datei mit seinen eigenen Mitteln entgegennehmen.
 */
export default async function ExportSettingsPage(): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={EXPORT_SETTINGS_PATH}>
      <PageHeader title={messages.backup.heading} description={messages.backup.intro} />

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-semibold text-ink">{messages.backup.exportHeading}</h2>
        <p className="max-w-form text-ui text-ink-muted">{messages.backup.exportHint}</p>
        <div>
          <a href={DATA_EXPORT_PATH} className={PRIMARY_BUTTON_CLASS} download>
            {messages.backup.exportDownload}
          </a>
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-semibold text-ink">{messages.backup.scheduleHeading}</h2>
        <p className="max-w-form text-ui text-ink-muted">{messages.backup.scheduleHint}</p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-semibold text-ink">{messages.backup.restoreHeading}</h2>
        <p className="max-w-form text-ui text-ink-muted">{messages.backup.restoreIntro}</p>

        <ol className="flex flex-col gap-2">
          {messages.backup.restoreSteps.map((step, index) => (
            <li key={step} className="flex gap-3 border-b border-rule pb-2 last:border-b-0">
              <span className="font-mono text-data text-ink-muted">{index + 1}.</span>
              <span className="font-mono text-data text-ink">{step}</span>
            </li>
          ))}
        </ol>

        <p className="max-w-form text-small text-ink-muted">{messages.backup.restoreNote}</p>
      </section>
    </AppShell>
  );
}
