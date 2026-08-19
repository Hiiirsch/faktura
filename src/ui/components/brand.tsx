/**
 * Die Marke (FA-UI-25, FA-UI-26).
 *
 * **Ein Pfad, keine Datei.** Die Bildmarke steht als Inline-SVG im Bauteil und
 * nicht als `<img src="…">`: Sie ist zwölf Zeichen Geometrie, und eine eigene
 * Anfrage dafür wäre mehr Aufwand als der Inhalt. Wichtiger noch — als Inline-SVG
 * kann sie `currentColor` tragen und damit dem Farbschema folgen. Ein Bild kann
 * das nicht; es bliebe nachts in demselben Blau stehen, das auf dunklem Grund
 * nicht mehr lesbar ist.
 *
 * **Die Wortmarke ist Text, kein Pfad.** Die Vorlage aus `faktura-logo-g`
 * enthält sie als `<text>`-Element in Fira Sans 600 — dieselbe Schrift, die die
 * Anwendung ohnehin ausliefert. Also wird sie hier als gewöhnliche Überschrift
 * gesetzt: vorlesbar, auswählbar, durchsuchbar. Ein Logo, dessen Name nur als
 * Kurve existiert, ist für einen Screenreader ein leeres Bild.
 *
 * Geometrie nach `faktura-logo-g/LIESMICH.txt`: 24 × 32 Einheiten, ein Pfad mit
 * `fill-rule="evenodd"`, Abstand Marke → Wortmarke ein halbes Markenmaß.
 *
 * **Eine bewusste Abweichung vom Logoblatt.** Dort stehen vier feste Fassungen
 * und der Satz „nicht umfärben". Im dunklen Schema trägt die Marke trotzdem den
 * aufgehellten Akzent statt `#2A3EA0`: Das Verbot soll willkürliches Einfärben
 * verhindern, nicht eine Marke erzwingen, die auf ihrem Grund unter 3:1 fällt
 * (NFA-UI-01). Gelöst wird das nicht im Bauteil, sondern durch `currentColor` —
 * der Wert kommt aus demselben Token wie jede andere Akzentfläche.
 */
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';

/**
 * Die Bildmarke allein.
 *
 * Ohne Beschriftung erscheint sie nie (CLAUDE.md, Symbole): Sie steht immer
 * neben der Wortmarke und ist deshalb `aria-hidden` — ein Screenreader liest den
 * Namen, nicht das Piktogramm.
 *
 * `height` in Pixeln, die Breite folgt dem Seitenverhältnis 3 : 4. Unter 16 px
 * wird sie nicht gesetzt; die Aussparung läge dann unter 1,5 px.
 */
export function BrandMark({ height = 20 }: { readonly height?: number }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 32"
      height={height}
      width={(height * 24) / 32}
      fill="currentColor"
      className="shrink-0"
    >
      <path fillRule="evenodd" d="M0 0H24V32H0Z M14.6 0H19.2L9.4 32H4.8Z" />
    </svg>
  );
}

/**
 * Marke und Wortmarke nebeneinander — die Sperrung des Logoblatts.
 *
 * `level` entscheidet nur über die Auszeichnung, nicht über die Größe: Auf einer
 * eigenständigen Seite (Anmeldung, Einladung) ist die Marke die Überschrift der
 * Seite, in der Seitenleiste ist sie eine Beschriftung neben der Navigation.
 */
export function BrandLockup({
  as = 'span',
  size = 'sidebar',
}: {
  readonly as?: 'h1' | 'span';
  readonly size?: 'sidebar' | 'page';
}): ReactNode {
  const Text = as;
  const isPage = size === 'page';

  return (
    <span className={`flex items-center text-accent ${isPage ? 'gap-3' : 'gap-2'}`}>
      <BrandMark height={isPage ? 32 : 20} />
      <Text
        className={`brand-wordmark font-semibold text-ink ${isPage ? 'text-title' : 'text-ui'}`}
      >
        {messages.app.name}
      </Text>
    </span>
  );
}
