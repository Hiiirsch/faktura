import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { getLegalNotices } from '@/application/admin/legal-notices';
import { requireAdminSession } from '@/application/admin/require-admin-session';
import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { ADMIN_LEGAL_PATH } from '@/routes';
import { Alert } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

import { AdminNav } from '../admin-nav';
import { LegalForm } from './legal-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.legal.adminTitle} · ${messages.app.name}` };

/**
 * Impressum und Datenschutzzusatz pflegen (M13, NFA-COMP-07, -08).
 *
 * **Hier und nicht in den Firmendaten eines Mandanten.** Das Telemedium bietet
 * an, wer die Installation betreibt; bei drei Unternehmen gäbe es sonst keine
 * Antwort auf die Frage, wessen Impressum unter `/impressum` steht. Es ist die
 * Umkehrung der Regel für Logo und Briefpapier, die dem Mandanten gehören, weil
 * der Beleg sein Dokument ist.
 *
 * Der Hinweis über dem Formular ist kein Beiwerk: Wer hier etwas hinterlegt,
 * soll nicht glauben, Faktura habe es geprüft.
 */
export default async function AdminLegalPage(): Promise<ReactNode> {
  const session = await requireAdminSession();
  const csrfToken = (await headers()).get(CSRF_HEADER_NAME) ?? '';
  const notices = await getLegalNotices();

  return (
    <>
      <AdminNav currentPath={ADMIN_LEGAL_PATH} email={session.email} csrfToken={csrfToken} />

      <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 pb-12">
        <PageHeader title={messages.legal.adminHeading} description={messages.legal.adminIntro} />

        <Alert tone="note">{messages.legal.adminDisclaimer}</Alert>

        <LegalForm
          imprint={notices.imprint ?? ''}
          privacyAddendum={notices.privacyAddendum ?? ''}
          csrfToken={csrfToken}
        />
      </main>
    </>
  );
}
