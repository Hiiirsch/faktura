import Link from 'next/link';
import type { ReactNode } from 'react';

import { HELP_TOPICS } from '@/content/hilfe';
import { searchHelp } from '@/domain/docs/search';
import { HELP_INDEX } from '@/domain/docs/search-index.generated';
import { messages } from '@/i18n/de';
import { helpTopicPath, HELP_PATH } from '@/routes';
import { BrandLockup } from '@/ui/components/brand';
import { FOCUS_RING, INPUT_CLASS, SECONDARY_BUTTON_CLASS, SECTION_CLASS } from '@/ui/components/form';
import { PageHeader } from '@/ui/components/page';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${messages.help.title} · ${messages.app.name}` };

/**
 * Die Übersicht des Handbuchs samt Suche (M16, FA-DOC-01, -03).
 *
 * **Die Suche ist ein `GET`-Formular ohne JavaScript.** Sie schickt `?suche=`,
 * die Seite filtert den erzeugten Index und setzt die Treffer. Kein Suchindex
 * im Browser, kein zusätzliches Bündel, keine Änderung an der
 * Content-Security-Policy — und die Adresse einer Suche lässt sich weitergeben.
 *
 * **Ohne Anmeldung erreichbar.** Diese Seite liest keine Datenbank; sie kennt
 * weder Mandant noch Sitzung. Dieselbe Einordnung wie `/datenschutz`: Was die
 * Software beschreibt, gilt unabhängig davon, wer sie benutzt.
 */
export default async function HelpPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const raw = params['suche'];
  const query = (typeof raw === 'string' ? raw : '').trim();

  const results = query.length === 0 ? [] : searchHelp(HELP_INDEX, query);

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 py-12">
      <BrandLockup />
      <PageHeader title={messages.help.heading} description={messages.help.intro} />

      <form action={HELP_PATH} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-ui font-medium text-ink">{messages.help.searchLabel}</span>
          <input
            type="search"
            name="suche"
            defaultValue={query}
            placeholder={messages.help.searchPlaceholder}
            className={INPUT_CLASS}
          />
        </label>
        <button type="submit" className={SECONDARY_BUTTON_CLASS}>
          {messages.help.searchAction}
        </button>
      </form>

      {query.length === 0 ? null : (
        <section className={SECTION_CLASS}>
          <h2 className="text-section font-medium text-ink">
            {messages.help.resultsHeading.replace('{query}', query)}
          </h2>

          {results.length === 0 ? (
            <p className="max-w-text text-body text-ink-muted">{messages.help.resultsNone}</p>
          ) : (
            <>
              <p className="text-small text-ink-muted">
                {results.length === 1
                  ? messages.help.resultsOne
                  : messages.help.resultsMany.replace('{count}', String(results.length))}
              </p>

              <ul className="flex flex-col divide-y divide-rule">
                {results.map((result) => (
                  <li key={`${result.topicId}-${result.heading}`} className="py-3">
                    {/*
                      Der Link führt zum Thema, nicht zum Absatz: Ein Anker je
                      Überschrift wäre eine zweite Kennung neben der Überschrift
                      selbst — und die erste, die nach einer Umformulierung ins
                      Leere zeigt.
                    */}
                    <Link
                      href={helpTopicPath(result.topicId)}
                      className={`text-ui font-medium text-accent underline underline-offset-4 ${FOCUS_RING}`}
                    >
                      {result.topicTitle} › {result.heading}
                    </Link>
                    <p className="mt-1 max-w-text text-ui text-ink-muted">{result.excerpt}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div>
            <Link href={HELP_PATH} className={SECONDARY_BUTTON_CLASS}>
              {messages.help.searchReset}
            </Link>
          </div>
        </section>
      )}

      <section className={SECTION_CLASS}>
        <h2 className="text-section font-medium text-ink">{messages.help.topicsHeading}</h2>

        <ul className="flex flex-col divide-y divide-rule">
          {HELP_TOPICS.map((topic) => (
            <li key={topic.meta.id} className="py-3">
              <Link
                href={helpTopicPath(topic.meta.id)}
                className={`text-ui font-medium text-accent underline underline-offset-4 ${FOCUS_RING}`}
              >
                {topic.meta.title}
              </Link>
              <p className="mt-1 max-w-text text-ui text-ink-muted">{topic.meta.summary}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
