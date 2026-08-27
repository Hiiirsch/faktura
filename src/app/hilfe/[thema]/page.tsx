import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { findHelpTopic, HELP_TOPICS } from '@/content/hilfe';
import { messages } from '@/i18n/de';
import { helpTopicPath } from '@/routes';
import { FOCUS_RING } from '@/ui/components/form';

import { HelpShell } from '../help-shell';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ thema: string }>;
}): Promise<{ title: string }> {
  const { thema } = await params;
  const topic = findHelpTopic(thema);

  return {
    title: `${topic?.meta.title ?? messages.help.title} · ${messages.app.name}`,
  };
}

/**
 * Ein Thema des Handbuchs (M16, FA-DOC-01).
 *
 * Der Inhalt kommt als übersetzte MDX-Komponente; gesetzt wird er von
 * `src/mdx-components.tsx` mit den Tokens der Anwendung. In der MDX-Datei selbst
 * steht keine Klasse — deshalb folgt das Handbuch dem dunklen Schema, ohne
 * davon zu wissen.
 *
 * **Ein unbekanntes Thema führt zu 404**, nicht zur Übersicht: Eine Umleitung
 * verschleierte den Tippfehler in der Adresse.
 */
export default async function HelpTopicPage({
  params,
}: {
  readonly params: Promise<{ thema: string }>;
}): Promise<ReactNode> {
  const { thema } = await params;
  const topic = findHelpTopic(thema);

  if (topic === null) {
    notFound();
  }

  const { Content } = topic;
  const index = HELP_TOPICS.findIndex((entry) => entry.meta.id === topic.meta.id);
  const previous = index > 0 ? HELP_TOPICS[index - 1] : undefined;
  const next = index < HELP_TOPICS.length - 1 ? HELP_TOPICS[index + 1] : undefined;

  return (
    <HelpShell activeId={topic.meta.id}>
      <article className="flex flex-col gap-4">
        <Content />
      </article>

      {/*
        Vor und zurück in der Reihenfolge des Handbuchs.

        Die Gliederung steht links und beantwortet „wo bin ich"; diese beiden
        Links beantworten „was kommt als Nächstes". Wer eine Seite zu Ende liest,
        soll nicht in die Seitenleiste zurückgreifen müssen — und auf einem
        Telefon ist sie ohnehin zugeklappt.
      */}
      <nav className="flex flex-wrap justify-between gap-4 border-t border-rule pt-6">
        <div className="min-w-0">
          {previous === undefined ? null : (
            <Link
              href={helpTopicPath(previous.meta.id)}
              className={`text-ui text-accent underline underline-offset-4 ${FOCUS_RING}`}
            >
              ‹ {previous.meta.title}
            </Link>
          )}
        </div>
        <div className="min-w-0 text-right">
          {next === undefined ? null : (
            <Link
              href={helpTopicPath(next.meta.id)}
              className={`text-ui text-accent underline underline-offset-4 ${FOCUS_RING}`}
            >
              {next.meta.title} ›
            </Link>
          )}
        </div>
      </nav>
    </HelpShell>
  );
}
