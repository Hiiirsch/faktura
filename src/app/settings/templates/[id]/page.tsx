import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { requirePermission } from '@/application/auth/authorize';
import { listInvoices } from '@/application/invoices/invoice-queries';
import { getTemplate } from '@/application/templates/template-service';
import { formatPlainDateDe } from '@/domain/format/de';
import {
  TEMPLATE_VARIABLES,
  type TemplateVariableGroup,
} from '@/domain/rendering/template-variables';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { TEMPLATE_SETTINGS_PATH } from '@/routes';
import { SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { AppShell } from '../../../app-shell';

import { TemplateEditorForm } from '../template-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.templates.editHeading} · ${messages.app.name}` };

/** Die Reihenfolge, in der die Variablengruppen dokumentiert werden. */
const GROUPS: readonly { readonly group: TemplateVariableGroup; readonly title: string }[] = [
  { group: 'seller', title: messages.templates.variableGroupSeller },
  { group: 'buyer', title: messages.templates.variableGroupBuyer },
  { group: 'invoice', title: messages.templates.variableGroupInvoice },
  { group: 'lines', title: messages.templates.variableGroupLines },
  { group: 'taxBreakdown', title: messages.templates.variableGroupTax },
  { group: 'totals', title: messages.templates.variableGroupTotals },
  { group: 'notices', title: messages.templates.variableGroupNotices },
  { group: 'filters', title: messages.templates.variableGroupFilters },
];

/** FA-TPL-06: Die Variablenreferenz steht in der Oberfläche, nicht nur im Wiki. */
function VariableReference(): ReactNode {
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-section font-semibold text-ink">
          {messages.templates.sectionVariables}
        </h2>
        <p className="text-small text-ink-muted">{messages.templates.sectionVariablesHint}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map(({ group, title }) => (
          <div key={group} className="flex flex-col gap-2">
            <h3 className="text-label font-semibold uppercase text-ink-muted">{title}</h3>
            <dl className="flex flex-col gap-1">
              {TEMPLATE_VARIABLES.filter((variable) => variable.group === group).map(
                (variable) => (
                  <div key={variable.expression} className="flex flex-col">
                    <dt className="font-mono text-small text-ink">{variable.expression}</dt>
                    <dd className="text-small text-ink-muted">{variable.description}</dd>
                  </div>
                ),
              )}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const session = await requirePermission('template.read', 'invoice.read');
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';

  const { id } = await params;
  const template = await getTemplate(session.organization, id);

  if (template === null) {
    notFound();
  }

  // Für die Vorschau: die zuletzt angelegten Belege. Ohne einen Beleg gibt es
  // nichts zu setzen — die Vorlage allein ergibt kein Dokument.
  const invoices = await listInvoices(session.organization, {
    sort: 'issueDate',
    direction: 'desc',
  });

  const previewInvoices = invoices.slice(0, 20).map((invoice) => ({
    id: invoice.id,
    label:
      `${invoice.invoiceNumber ?? messages.invoices.statusDRAFT} · ${invoice.customerName}` +
      ` · ${formatPlainDateDe(invoice.issueDate)}`,
  }));

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={TEMPLATE_SETTINGS_PATH}>
      <PageHeader
        title={template.name}
        description={template.description ?? messages.templates.editHeading}
        actions={
          <Link href={TEMPLATE_SETTINGS_PATH} className={SECONDARY_BUTTON_CLASS}>
            {messages.common.back}
          </Link>
        }
      />

      <TemplateEditorForm
        csrfToken={csrfToken}
        template={template}
        previewInvoices={previewInvoices}
      />

      <VariableReference />
    </AppShell>
  );
}
