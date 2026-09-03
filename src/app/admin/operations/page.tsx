import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireAdminSession } from '@/application/admin/require-admin-session';
import { getAppTimeZone } from '@/application/system/display-settings';
import { checkSystemStatus } from '@/application/system/check-system-status';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { ADMIN_OPERATIONS_PATH, BACKUP_DOWNLOAD_PATH } from '@/routes';
import { SECONDARY_BUTTON_CLASS, SECTION_CLASS } from '@/ui/components/form';
import { APP_VERSION } from '@/domain/version';
import { PageHeader } from '@/ui/components/page';
import { formatDateTime } from '@/ui/format';

import { AdminNav } from '../admin-nav';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.admin.operationsTitle} · ${messages.app.name}` };

/**
 * Zustand und Sicherung (M10, B5, FA-ADM-17).
 *
 * **Es entsteht hier nichts Neues.** `checkSystemStatus()` gibt es seit M7 für
 * den Healthcheck des Containers, und die Sicherung liegt seit M8 richtig unter
 * `/admin/api/backup` — nur mit Adminsitzung, weil sie den Bestand **aller**
 * Unternehmen enthält (NFA-SEC-23). Was fehlte, war der Weg dorthin aus der
 * Oberfläche: Wer die Anwendung betreibt, aber keine Konsole hat, kam an beides
 * nicht heran.
 *
 * **Der Knopf ist ein Link, kein Formular.** Was zurückkommt, ist eine Datei;
 * der Browser soll sie mit seinen eigenen Mitteln entgegennehmen. Eine Server
 * Action müsste die Bytes durch eine Antwort schleusen, die für Text gedacht
 * ist.
 *
 * **Was hier bewusst nicht steht:** ein Zeitplan und ein Knopf für die
 * Wiederherstellung. Ein eingebauter Zeitgeber liefe im Container mit, ohne dass
 * jemand ihn sieht; die Wiederherstellung überschreibt den gesamten Bestand, und
 * dafür soll niemand versehentlich einen Knopf finden. Beides bleibt beim
 * Betriebsauftrag.
 */
export default async function AdminOperationsPage(): Promise<ReactNode> {
  // Erste Anweisung: die Sitzungsprüfung — hier die der Verwaltung.
  const session = await requireAdminSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const status = await checkSystemStatus();
  const timeZone = getAppTimeZone();

  const components = [
    { label: messages.admin.operationsComponentDatabase, state: status.components.database },
    { label: messages.admin.operationsComponentRenderer, state: status.components.renderer },
  ];

  return (
    <>
      <AdminNav currentPath={ADMIN_OPERATIONS_PATH} email={session.email} csrfToken={csrfToken} />

      <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 pb-12">
        <PageHeader
          title={messages.admin.operationsHeading}
          description={messages.admin.operationsIntro}
        />

        <section className={SECTION_CLASS}>
          <h2 className="text-section font-semibold text-ink">
            {messages.admin.operationsStateHeading}
          </h2>

          {/*
            Die laufende Version steht **hier**, wo der Betreiber sie braucht:
            beim Aktualisieren und bei einer Rückfrage. Vor der Anmeldung steht
            sie bewusst nicht — eine exakte Nummer sagt einem Angreifer, welche
            Lücken er versuchen kann.
          */}
          <p className="text-small text-ink-muted">
            {messages.help.version.replace('{version}', APP_VERSION)}
          </p>

          <ul className="flex max-w-form flex-col divide-y divide-rule">
            {components.map((component) => (
              <li key={component.label} className="flex items-center justify-between gap-4 py-3">
                <span className="text-ui text-ink">{component.label}</span>
                {/*
                  Zustand nie allein durch Farbe (FA-UI-05): Was hier steht, ist
                  ein Wort. Auf einer Seite mit zwei Zeilen wäre ein Punkt daneben
                  Zierde, kein Zugewinn.
                */}
                <span
                  className={
                    component.state === 'UP'
                      ? 'text-ui text-ink-muted'
                      : 'text-ui font-semibold text-ink'
                  }
                >
                  {component.state === 'UP'
                    ? messages.admin.operationsStateUp
                    : messages.admin.operationsStateDown}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-small text-ink-muted">
            {messages.admin.operationsCheckedAt.replace(
              '{date}',
              formatDateTime(status.checkedAt, timeZone),
            )}
          </p>
          <p className="max-w-form text-small text-ink-muted">
            {messages.admin.operationsRendererNote}
          </p>
        </section>

        <section className={SECTION_CLASS}>
          <h2 className="text-section font-semibold text-ink">
            {messages.admin.operationsBackupHeading}
          </h2>
          <p className="max-w-form text-ui text-ink-muted">
            {messages.admin.operationsBackupIntro}
          </p>

          <Link href={BACKUP_DOWNLOAD_PATH} className={`${SECONDARY_BUTTON_CLASS} self-start`}>
            {messages.admin.operationsBackupSubmit}
          </Link>

          <p className="max-w-form text-small text-ink-muted">
            {messages.admin.operationsBackupNote}
          </p>
        </section>
      </main>
    </>
  );
}
