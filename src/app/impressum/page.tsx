import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { getLegalNotices } from '@/application/admin/legal-notices';
import { messages } from '@/i18n/de';
import { BrandLockup } from '@/ui/components/brand';
import { LegalText } from '@/ui/components/legal-text';
import { PageHeader } from '@/ui/components/page';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.legal.imprintTitle} · ${messages.app.name}` };

/**
 * Das Impressum des Betreibers (M13, NFA-COMP-07).
 *
 * **Öffentlich, weil es das sein muss** (§5 DDG): Ein Impressum hinter einer
 * Anmeldung wäre keins. Der Eintrag in `src/routes.ts` trägt die Begründung,
 * und der Zugriffsschutztest liest sie.
 *
 * **Ohne hinterlegten Inhalt gibt es die Seite nicht.** Ein leeres Impressum
 * ist schlechter als keins — es sähe aus, als hätte jemand etwas hinterlegt.
 * Dieselbe Regel wie bei den Sammelaktionen aus M12: nichts anbieten, was nicht
 * tragen kann.
 */
export default async function ImprintPage(): Promise<ReactNode> {
  const notices = await getLegalNotices();

  if (notices.imprint === null) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 py-12">
      <BrandLockup />
      <PageHeader title={messages.legal.imprintHeading} />
      <LegalText content={notices.imprint} />
    </main>
  );
}
