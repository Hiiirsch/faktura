import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requirePermission } from '@/application/auth/authorize';
import { can } from '@/domain/policy/can';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { COMPANY_SETTINGS_PATH, INVOICES_PATH } from '@/routes';
import { Alert, NoScriptNotice, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { AppShell } from '../../app-shell';
import { loadEditorContext } from '../editor-data';
import { InvoiceEditor } from '../invoice-editor';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.invoices.createHeading} · ${messages.app.name}` };

export default async function NewInvoicePage(): Promise<ReactNode> {
  const session = await requirePermission(
    'invoice.create',
    'companyProfile.read',
    'customer.read',
    'catalogItem.read',
    'template.read',
  );
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  const context = await loadEditorContext(session.organization);

  return (
    <AppShell session={session} csrfToken={csrfToken} currentPath={INVOICES_PATH}>
      <PageHeader
        title={messages.invoices.createHeading}
        actions={
          <Link href={INVOICES_PATH} className={SECONDARY_BUTTON_CLASS}>
            {messages.common.back}
          </Link>
        }
      />

        {!context.hasCompanyProfile ? (
          <Alert tone="error">
            <span className="flex flex-wrap items-center gap-3">
              {messages.invoices.noCompanyProfile}
              <Link href={COMPANY_SETTINGS_PATH} className={SECONDARY_BUTTON_CLASS}>
                {messages.company.heading}
              </Link>
            </span>
          </Alert>
        ) : null}

        {/*
          Ohne Kunden ist der Editor **nicht** gesperrt (M5.7): Der Empfänger
          lässt sich am Beleg selbst erfassen. Die Stammdaten bleiben der
          bequemere Weg, aber nicht mehr der einzige.
        */}
        <NoScriptNotice message={messages.common.noScript} />
        {/*
          `canIssue` ist hier ohne Wirkung: Ein Beleg ohne Kennung lässt sich
          nicht festschreiben, der Knopf erscheint erst nach dem ersten
          Speichern. Der Wert steht trotzdem, damit die Sichtbarkeitsregel nicht
          davon abhängt, über welche Seite der Editor gerendert wird.
        */}
        <InvoiceEditor
          canIssue={can(session.actor, 'issue', 'invoice')}
          initial={{
            invoiceId: null,
            buyer: context.initialBuyer,
            templateId: '',
            taxScheme: context.suggestedTaxScheme,
            currency: context.defaultCurrency,
            issueDate: context.today,
            serviceDateFrom: context.today,
            serviceDateTo: '',
            dueDate: context.suggestedDueDate,
            introText: '',
            outroText: '',
            purchaseOrderRef: '',
            // Die erste Position legt der Editor selbst an — `emptyLine`
            // lebt in der Client-Komponente und ist vom Server nicht
            // aufrufbar.
            lines: [],
          }}
          customers={context.customers}
          catalog={context.catalog}
          templates={context.templates}
          defaultTaxRatePercent={context.defaultTaxRatePercent}
        sellerIsSmallBusiness={context.sellerIsSmallBusiness}
        seller={context.seller}
          defaultPaymentTerms={context.defaultPaymentTerms}
          csrfToken={csrfToken}
        />
    </AppShell>
  );
}
