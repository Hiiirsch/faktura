import type { MDXComponents } from 'mdx/types';
import type { ReactNode } from 'react';

import { FOCUS_RING } from '@/ui/components/form';

/**
 * Wie MDX gesetzt wird (M16, FA-DOC-01).
 *
 * **Hier steht die einzige Gestaltung des Handbuchs.** In den MDX-Dateien
 * selbst gibt es keine Klasse und keinen Farbwert — dort steht Text. Damit
 * bleiben die Wächter aus `tests/architecture/design-tokens.test.ts` gültig,
 * ohne dass die neuen Dateien eine Ausnahme brauchen, und das dunkle Schema
 * greift ohne Zutun: Es tauscht Tokenwerte, und dieses Bauteil benutzt nur
 * Tokens.
 *
 * **Die Datei liegt in `src/`**, nicht im Projektwurzelverzeichnis. Next findet
 * sie an beiden Orten; hier ist sie zusätzlich von den bestehenden
 * ESLint-Regeln erfasst (`files: ['src/**‍/*.{ts,tsx}', …]`). Im Wurzelverzeichnis
 * fehlte ihr die typgestützte Prüfung, und `npm run lint` brach mit einem
 * Ladefehler ab, statt eine Meldung zu geben.
 *
 * Ohne diese Datei arbeitet der App Router gar nicht mit MDX — `@next/mdx`
 * verlangt sie.
 *
 * Bewusst wenige Elemente: Überschriften, Absatz, Listen, Hervorhebung, Link,
 * Auszeichnungsschrift. Was ein Handbuch mehr braucht, wäre ein Hinweis darauf,
 * dass der Text zu verschachtelt ist.
 */
const components: MDXComponents = {
  h2: ({ children, id }: { children?: ReactNode; id?: string }) => (
    <h2 id={id} className="mt-8 text-section font-medium text-ink first:mt-0">
      {children}
    </h2>
  ),

  h3: ({ children, id }: { children?: ReactNode; id?: string }) => (
    <h3 id={id} className="mt-6 text-ui font-semibold text-ink">
      {children}
    </h3>
  ),

  p: ({ children }: { children?: ReactNode }) => (
    <p className="max-w-text text-body text-ink-muted">{children}</p>
  ),

  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="flex max-w-text list-disc flex-col gap-2 pl-5 text-body text-ink-muted">
      {children}
    </ul>
  ),

  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="flex max-w-text list-decimal flex-col gap-2 pl-5 text-body text-ink-muted">
      {children}
    </ol>
  ),

  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,

  /*
   * Hervorgehoben heißt hier: in der Farbe des Fließtextes, nur fetter. Eine
   * eigene Farbe für Betonung gäbe es im Tokensatz nicht, und `text-ink` ist
   * gegenüber `text-ink-muted` bereits der Kontrast.
   */
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),

  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} className={`text-accent underline underline-offset-4 ${FOCUS_RING}`}>
      {children}
    </a>
  ),

  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-control bg-surface-sunken px-1.5 py-0.5 font-mono text-data text-ink">
      {children}
    </code>
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
