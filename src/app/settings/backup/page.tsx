import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { requireSession } from '@/application/auth/require-session';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { BACKUP_DOWNLOAD_PATH, BACKUP_SETTINGS_PATH } from '@/routes';
import { PRIMARY_BUTTON_CLASS, SECTION_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { AppShell } from '../../app-shell';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.backup.title} · ${messages.app.name}` };

/**
 * Sicherung und Wiederherstellung (Spec §10.1, NFA-BETR-05, -06).
 *
 * **Sichern per Knopf, Wiederherstellen von Hand.** Das ist keine Auslassung:
 * Eine Wiederherstellung überschreibt den gesamten Bestand und ist nicht
 * rücknehmbar. Ein Knopf dafür in einer Oberfläche, die man täglich benutzt,
 * ist eine Falle — die Schritte stehen deshalb hier, und ausgeführt werden sie
 * auf der Kommandozeile, wo man sie liest, bevor man sie tippt.
 *
 * Der Download ist ein Verweis, keine Server Action: Der Browser soll die
 * Datei mit seinen eigenen Mitteln entgegennehmen.
 */
export default async function BackupSettingsPage(): Promise<ReactNode> {
  const session = await requireSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={BACKUP_SETTINGS_PATH}>
      <PageHeader title={messages.backup.heading} description={messages.backup.intro} />

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-semibold text-ink">{messages.backup.createHeading}</h2>
        <p className="max-w-form text-ui text-ink-muted">{messages.backup.createHint}</p>
        <div>
          <a href={BACKUP_DOWNLOAD_PATH} className={PRIMARY_BUTTON_CLASS} download>
            {messages.backup.download}
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
