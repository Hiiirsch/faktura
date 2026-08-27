import Link from 'next/link';
import type { ReactNode } from 'react';

import { HELP_TOPICS } from '@/content/hilfe';
import { messages } from '@/i18n/de';
import { helpTopicPath, HELP_PATH } from '@/routes';
import { BrandLockup } from '@/ui/components/brand';
import { FOCUS_RING, INPUT_CLASS, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';

/**
 * Der Rahmen des Handbuchs: Gliederung links, Inhalt rechts (M16.1, FA-DOC-01).
 *
 * **Kein `layout.tsx`, und das hat einen Grund.** Ein Layout bekommt den
 * aufgerufenen Pfad nicht; um den aktiven Eintrag zu markieren, bräuchte die
 * Gliederung `usePathname()` und damit eine Client-Komponente. Stattdessen
 * reicht jede Seite ihre eigene Kennung herein — zwei Aufrufstellen, dafür
 * **kein JavaScript** für etwas, das der Server längst weiß.
 *
 * **Ohne Seitenleiste auf schmalen Geräten**, dafür eine aufklappbare
 * Gliederung über dem Inhalt. `<details>` klappt ohne JavaScript, und auf einem
 * Telefon wäre eine dauerhaft sichtbare Liste von zwölf Themen der halbe
 * Bildschirm, bevor der Text beginnt.
 */
export function HelpShell({
  activeId,
  children,
}: {
  /** Das gerade gelesene Thema; `null` auf der Übersicht. */
  readonly activeId: string | null;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-8 px-8 py-12 lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 lg:sticky lg:top-12 lg:h-fit lg:w-64">
        <BrandLockup />

        {/*
          Die Suche steht **in** der Gliederung, nicht über dem Inhalt: Sie
          gehört zum Wegfinden, nicht zum Lesen. Ein `GET`-Formular — die
          Trefferliste erscheint auf der Übersicht.
        */}
        <form action={HELP_PATH} className="flex flex-col gap-2">
          <label htmlFor="handbuch-suche" className="text-ui font-medium text-ink">
            {messages.help.searchLabel}
          </label>
          <input
            id="handbuch-suche"
            type="search"
            name="suche"
            placeholder={messages.help.searchPlaceholder}
            className={INPUT_CLASS}
          />
          <button type="submit" className={`${SECONDARY_BUTTON_CLASS} w-fit`}>
            {messages.help.searchAction}
          </button>
        </form>

        <nav aria-label={messages.help.topicsHeading} className="hidden lg:block">
          <TopicList activeId={activeId} />
        </nav>

        <details className="lg:hidden">
          <summary className={`cursor-pointer text-ui font-medium text-ink ${FOCUS_RING}`}>
            {messages.help.topicsHeading}
          </summary>
          <nav aria-label={messages.help.topicsHeading} className="pt-3">
            <TopicList activeId={activeId} />
          </nav>
        </details>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-6">{children}</main>
    </div>
  );
}

/**
 * Die Gliederung.
 *
 * Der aktive Eintrag trägt `aria-current="page"` — die Auszeichnung für
 * Screenreader ist dieselbe Aussage wie die optische, und zwei Quellen für
 * dieselbe Aussage laufen auseinander. Gesetzt wird deshalb über das Attribut
 * (`aria-[current=page]:…`), nicht über eine zusätzlich vergebene Klasse.
 */
function TopicList({ activeId }: { readonly activeId: string | null }): ReactNode {
  return (
    <ol className="flex flex-col gap-1">
      {HELP_TOPICS.map((topic, index) => (
        <li key={topic.meta.id}>
          <Link
            href={helpTopicPath(topic.meta.id)}
            aria-current={topic.meta.id === activeId ? 'page' : undefined}
            className={
              'flex gap-2 rounded-control px-2 py-1.5 text-ui text-ink-muted ' +
              'hover:bg-surface-sunken hover:text-ink ' +
              'aria-[current=page]:bg-surface-sunken aria-[current=page]:font-medium ' +
              `aria-[current=page]:text-ink ${FOCUS_RING}`
            }
          >
            <span className="tabular-nums text-ink-faint">{index + 1}</span>
            <span className="min-w-0">{topic.meta.title}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
