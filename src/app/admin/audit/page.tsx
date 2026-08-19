import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { getPlatformAuditTrail } from '@/application/admin/organization-admin';
import { requireAdminSession } from '@/application/admin/require-admin-session';
import { getAppTimeZone } from '@/application/system/display-settings';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { ADMIN_AUDIT_PATH } from '@/routes';
import { EmptyState, PageHeader } from '@/ui/components/page';
import { DataTable } from '@/ui/components/table';
import { formatDateTime } from '@/ui/format';

import { AdminNav } from '../admin-nav';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.admin.auditTitle} · ${messages.app.name}` };

/**
 * Das Protokoll der Verwaltung (M10, B2, FA-ADM-14).
 *
 * **Wozu die Seite da ist.** Seit M9 kann der Betreiber einen
 * Zurücksetzungsnachweis für ein Mandantenkonto ausstellen — und ihn im
 * Grenzfall selbst einlösen. Das ließ sich nicht verhindern, ohne den Weg aus
 * der Sackgasse wieder zuzumauern; der bewusst in Kauf genommene Preis war, dass
 * es **sichtbar** ist. Bisher war es das nur im Protokoll des betroffenen
 * Unternehmens. Hier steht es auch dort, wo der Betreiber es selbst sieht.
 *
 * **Kein Geschäftsvorfall, und zwar nicht durch einen Filter.** Gelesen wird
 * `PlatformAuditEntry`, eine Tabelle, die ausschließlich aus Handlungen der
 * Verwaltung entsteht. Ein `AuditLog WHERE actorKind = 'ADMIN'` hätte dasselbe
 * gezeigt, solange niemand das `where` vergisst — die getrennte Tabelle enthält
 * die fremden Zeilen gar nicht erst. Der Architekturtest hält fest, dass die
 * Verwaltung im Protokoll der Mandanten nur schreibt.
 *
 * **Ungefiltert und ohne Suche.** Ein Protokoll mit 200 jüngsten Zeilen liest
 * man von oben; eine Filterleiste wäre Bedienung für einen Bestand, den es noch
 * nicht gibt. Vollständig steht es in der Sicherung.
 */
export default async function AdminAuditPage(): Promise<ReactNode> {
  // Erste Anweisung: die Sitzungsprüfung — hier die der Verwaltung.
  const session = await requireAdminSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const entries = await getPlatformAuditTrail(session.platform);
  const timeZone = getAppTimeZone();

  return (
    <>
      <AdminNav currentPath={ADMIN_AUDIT_PATH} email={session.email} csrfToken={csrfToken} />

      <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 pb-12">
        <PageHeader title={messages.admin.auditHeading} description={messages.admin.auditIntro} />

        {entries.length === 0 ? (
          <EmptyState message={messages.admin.auditEmpty} />
        ) : (
          <section className="flex flex-col gap-4">
            <DataTable
              caption={messages.admin.auditHeading}
              rows={entries}
              rowKey={(entry) => entry.id}
              columns={[
                {
                  key: 'when',
                  header: messages.admin.auditColumnWhen,
                  fit: true,
                  cell: (entry) => (
                    <span className="font-mono text-data text-ink-muted">
                      {formatDateTime(entry.createdAt, timeZone)}
                    </span>
                  ),
                },
                {
                  key: 'actor',
                  header: messages.admin.auditColumnActor,
                  cell: (entry) => (
                    <span className="font-mono text-data text-ink">
                      {/*
                        Ein Betreiberkonto wird nie gelöscht, nur gesperrt — die
                        Kennung sollte sich immer auflösen lassen. „Konto
                        entfernt" ist der Fall, den es nicht geben darf, und
                        deshalb steht er da: Ein Protokoll, das bei einer
                        unauflösbaren Kennung eine leere Zelle zeigt, verschweigt
                        genau die Zeile, die jemanden interessieren würde.
                      */}
                      {entry.actorEmail ?? messages.admin.auditUnknownActor}
                    </span>
                  ),
                },
                {
                  key: 'organization',
                  header: messages.admin.auditColumnOrganization,
                  cell: (entry) => (
                    <span className={entry.organizationName === null ? 'text-ink-faint' : 'text-ink'}>
                      {entry.organizationName ?? messages.admin.auditNoOrganization}
                    </span>
                  ),
                },
                {
                  key: 'action',
                  header: messages.admin.auditColumnAction,
                  cell: (entry) => (
                    // Unbekannte Aktionen zeigen ihren Schlüssel, statt zu
                    // verschwinden: Ein Eintrag ohne Übersetzung ist immer noch
                    // ein Eintrag.
                    <span className="text-ink">
                      {messages.admin.auditAction[entry.action] ?? entry.action}
                    </span>
                  ),
                },
                {
                  key: 'subject',
                  header: messages.admin.auditColumnSubject,
                  cell: (entry) => (
                    <span className="font-mono text-data text-ink-muted">
                      {entry.entityType} · {entry.entityId}
                    </span>
                  ),
                },
              ]}
            />

            <p className="max-w-form text-small text-ink-muted">
              {messages.admin.auditRetentionNote}
            </p>
          </section>
        )}
      </main>
    </>
  );
}
