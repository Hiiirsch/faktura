import type { ReactNode } from 'react';

import { getLegalNotices } from '@/application/admin/legal-notices';
import {
  formatRetention,
  PRIVACY_ASSURANCES,
  STORED_DATA,
} from '@/domain/legal/privacy-notice';
import { messages } from '@/i18n/de';
import { BrandLockup } from '@/ui/components/brand';
import { LegalText } from '@/ui/components/legal-text';
import { PageHeader } from '@/ui/components/page';
import { SECTION_CLASS } from '@/ui/components/form';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.legal.privacyTitle} · ${messages.app.name}` };

/**
 * Die Datenschutzhinweise (M13, NFA-COMP-08).
 *
 * **Zweiteilig, und die Reihenfolge ist Absicht.** Zuerst steht, was die
 * Anwendung speichert — das gilt unabhängig davon, wer sie betreibt, und kommt
 * aus `domain/legal/privacy-notice.ts`, wo die Fristen **Verweise auf die
 * Konstanten** sind. Darunter steht, was der Betreiber über sich selbst sagt.
 *
 * **Diese Seite gibt es immer**, auch ohne Angaben des Betreibers: Der Teil
 * über die Software ist dann trotzdem wahr und nützlich. Das unterscheidet sie
 * vom Impressum, das ohne Inhalt gar nichts wäre.
 */
export default async function PrivacyPage(): Promise<ReactNode> {
  const notices = await getLegalNotices();

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 py-12">
      <BrandLockup />
      <PageHeader title={messages.legal.privacyHeading} />

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-medium">{messages.legal.privacySoftwareHeading}</h2>
        <p className="max-w-text text-body text-ink-muted">
          {messages.legal.privacySoftwareIntro}
        </p>

        {/*
          Eine Tabelle und keine Absätze: Angabe, Zweck und Aufbewahrung sind
          drei Spalten derselben Sache, und Art. 13 verlangt sie zusammen. Als
          Fließtext läse man sie dreimal.
        */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-ui">
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {messages.legal.privacyColumnSubject}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {messages.legal.privacyColumnPurpose}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {messages.legal.privacyColumnRetention}
                </th>
              </tr>
            </thead>
            <tbody>
              {STORED_DATA.map((datum) => (
                <tr key={datum.subject} className="border-b border-rule align-top">
                  <td className="py-3 pr-4 text-ink">{datum.subject}</td>
                  <td className="py-3 pr-4 text-ink-muted">{datum.purpose}</td>
                  <td className="py-3 text-ink-muted">
                    {datum.retentionMs === null
                      ? (datum.retentionNote ?? messages.legal.privacyRetentionOpen)
                      : `${formatRetention(datum.retentionMs)}${datum.retentionNote === undefined ? '' : ` · ${datum.retentionNote}`}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-medium">{messages.legal.privacyAssurancesHeading}</h2>
        <ul className="flex max-w-text flex-col gap-2">
          {PRIVACY_ASSURANCES.map((assurance) => (
            <li key={assurance} className="text-body text-ink-muted">
              {assurance}
            </li>
          ))}
        </ul>
      </section>

      {notices.privacyAddendum === null ? null : (
        <section className={SECTION_CLASS}>
          <h2 className="text-section font-medium">{messages.legal.privacyOperatorHeading}</h2>
          <LegalText content={notices.privacyAddendum} />
        </section>
      )}
    </main>
  );
}
