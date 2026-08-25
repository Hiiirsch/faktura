import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { findHelpTopic, HELP_TOPICS } from '@/content/hilfe';
import { messages } from '@/i18n/de';
import { helpTopicPath, HELP_PATH } from '@/routes';
import { BrandLockup } from '@/ui/components/brand';
import { FOCUS_RING, SECONDARY_BUTTON_CLASS, SECTION_CLASS } from '@/ui/components/form';

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
 * `mdx-components.tsx` mit den Tokens der Anwendung. In der MDX-Datei selbst
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

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-8 py-12">
      <BrandLockup />

      <div>
        <Link href={HELP_PATH} className={SECONDARY_BUTTON_CLASS}>
          {messages.help.back}
        </Link>
      </div>

      <article className="flex flex-col gap-4">
        <Content />
      </article>

      {/*
        Weiterlesen: Die übrigen Themen in der Reihenfolge des Handbuchs. Wer
        unten ankommt, soll nicht zurückspringen müssen, um weiterzukommen.
      */}
      <section className={SECTION_CLASS}>
        <h2 className="text-section font-medium text-ink">{messages.help.topicsHeading}</h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {HELP_TOPICS.filter((entry) => entry.meta.id !== topic.meta.id).map((entry) => (
            <li key={entry.meta.id}>
              <Link
                href={helpTopicPath(entry.meta.id)}
                className={`text-ui text-accent underline underline-offset-4 ${FOCUS_RING}`}
              >
                {entry.meta.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
