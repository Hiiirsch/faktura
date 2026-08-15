'use client';

import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { messages } from '@/i18n/de';

import { FOCUS_RING } from './form';
import { ICON_STROKE } from './icon';

/**
 * Rückmeldung nach einer Handlung ohne Seitenwechsel (FA-UI-18, §5).
 *
 * Unten links, vier Sekunden, und der Wortlaut trägt den Verbstamm des
 * auslösenden Knopfes: Wer „Als bezahlt markieren" gedrückt hat, liest
 * „Als bezahlt markiert" — nicht „Erfolg" und nicht „Gespeichert" (§8).
 *
 * **Woher die Meldung kommt.** Nicht aus einem Zustandsspeicher im Browser,
 * sondern aus der Adresse: Die Server Action leitet nach getaner Arbeit auf
 * dieselbe Seite mit `?erledigt=<schlüssel>` um. Das hat drei Folgen, die
 * zusammen den Ausschlag geben — die Seite bleibt eine Server-Komponente, die
 * Meldung übersteht das Neuladen nicht (was richtig ist: sie gilt für eine
 * Handlung, nicht für einen Zustand), und Umleiten nach einem POST ist ohnehin
 * das Verhalten, das ein doppeltes Absenden verhindert.
 *
 * Der Toast verschwindet von selbst und trägt trotzdem einen Schließen-Knopf:
 * Wer mit der Tastatur arbeitet, soll ihn wegräumen können, statt zu warten.
 */
export function Toast({ message }: { readonly message: string }): ReactNode {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, VISIBLE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      // `status` statt `alert`: Eine Bestätigung ist keine Warnung und soll den
      // Vorlesefluss nicht unterbrechen.
      role="status"
      aria-live="polite"
      className={
        'fixed bottom-6 left-6 z-10 flex items-center gap-3 rounded-surface border ' +
        'border-rule bg-surface px-4 py-3 text-ui text-ink shadow-raised ' +
        'transition-opacity duration-(--duration-toast)'
      }
    >
      <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-moss" strokeWidth={ICON_STROKE} />
      {message}
      <button
        type="button"
        onClick={() => {
          setVisible(false);
        }}
        className={`rounded-control px-1 text-small text-ink-muted hover:text-ink ${FOCUS_RING}`}
      >
        {messages.common.close}
      </button>
    </div>
  );
}

const VISIBLE_MS = 4_000;
