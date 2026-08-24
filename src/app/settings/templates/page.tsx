import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requirePermission } from '@/application/auth/authorize';
import { listTemplates, STARTER_TEMPLATE } from '@/application/templates/template-service';
import { can } from '@/domain/policy/can';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME, CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { TEMPLATE_SETTINGS_PATH, templatePath } from '@/routes';
import { ConfirmDialog } from '@/ui/components/dialog';
import { FOCUS_RING, QUIET_BUTTON_CLASS } from '@/ui/components/form';
import { EmptyState, PageHeader } from '@/ui/components/page';
import { DataTable, type Column } from '@/ui/components/table';

import { AppShell } from '../../app-shell';

import { deleteTemplateAction, makeDefaultAction } from './actions';
import { NewTemplateForm } from './template-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.templates.title} · ${messages.app.name}` };

type Row = Awaited<ReturnType<typeof listTemplates>>[number];

export default async function TemplateSettingsPage(): Promise<ReactNode> {
  const session = await requirePermission('template.read');
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const templates = await listTemplates(session.organization);

  const columns: readonly Column<Row>[] = [
    {
      key: 'name',
      header: messages.templates.name,
      cell: (template) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link href={templatePath(template.id)} className={`text-accent ${FOCUS_RING}`}>
            {template.name}
          </Link>
          {template.isDefault ? (
            <span className="rounded-control bg-accent-wash px-2 py-1 text-label uppercase text-accent">
              {messages.templates.defaultMarker}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'description',
      header: messages.templates.description,
      cell: (template) => template.description ?? messages.common.none,
    },
    {
      key: 'margins',
      header: messages.templates.sectionGeometry,
      numeric: true,
      cell: (template) =>
        `${String(template.marginTopMm)}/${String(template.marginRightMm)}/` +
        `${String(template.marginBottomMm)}/${String(template.marginLeftMm)} mm`,
    },
    {
      key: 'actions',
      header: '',
      cell: (template) => (
        <span className="flex flex-wrap justify-end gap-2">
          {template.isDefault || !can(session.actor, 'update', 'template') ? null : (
            <form action={makeDefaultAction}>
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <input type="hidden" name="templateId" value={template.id} />
              <button type="submit" className={QUIET_BUTTON_CLASS}>
                {messages.templates.makeDefault}
              </button>
            </form>
          )}
          {/*
            Die Standardvorlage lässt sich nicht löschen — **und** es braucht
            das Recht dazu (M12, FA-UI-14). Die Rechteprüfung fehlte hier: Wer
            Vorlagen nur ändern durfte, sah einen Knopf, der ihn auf eine
            Fehlerseite führte.
          */}
          {template.isDefault || !can(session.actor, 'delete', 'template') ? null : (
            <form action={deleteTemplateAction}>
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <input type="hidden" name="templateId" value={template.id} />
              <ConfirmDialog
                title={messages.templates.removeConfirmTitle}
                message={messages.templates.removeConfirm}
                confirmLabel={messages.templates.remove}
                tone="danger"
                trigger={
                  <button type="submit" className={QUIET_BUTTON_CLASS}>
                    {messages.templates.remove}
                  </button>
                }
              />
            </form>
          )}
        </span>
      ),
    },
  ];

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={TEMPLATE_SETTINGS_PATH}>
      <PageHeader title={messages.templates.heading} description={messages.templates.intro} />

      {templates.length === 0 ? (
        <EmptyState message={messages.templates.empty} />
      ) : (
        <DataTable
          columns={columns}
          rows={templates}
          rowKey={(template) => template.id}
          caption={messages.templates.heading}
        />
      )}

      <NewTemplateForm csrfToken={csrfToken} starter={STARTER_TEMPLATE} />
    </AppShell>
  );
}
