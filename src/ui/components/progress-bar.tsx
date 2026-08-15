'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';

/**
 * Der Ladebalken (§4.4, FA-UI-08).
 *
 * Zwei Pixel hoch, am oberen Rand des Inhaltsbereichs, sichtbar solange eine
 * Handlung läuft. Keine Skelett-Platzhalter, kein Kringel im Knopf — der Knopf
 * wird deaktiviert und behält seine Beschriftung.
 *
 * **Unbestimmt aus Ehrlichkeit.** Die Anwendung weiß beim Setzen eines PDF
 * nicht, wie weit sie ist. Ein Balken, der dennoch einen Prozentsatz zeigt,
 * gäbe eine Auskunft, die nicht stimmt. Der Streifen läuft deshalb durch und
 * sagt genau das eine, was zutrifft: es wird gearbeitet. Bei
 * `prefers-reduced-motion` steht er still und bleibt als Fläche sichtbar —
 * auch dann ist die Auskunft dieselbe.
 *
 * **Warum am Formular und nicht global.** Der App Router kennt keinen
 * anwendungsweiten „es lädt"-Zustand, den eine Server-Komponente lesen könnte.
 * `useFormStatus` kennt genau einen, der tatsächlich existiert: die laufende
 * Absendung des umgebenden Formulars. Ein global erfundener wäre wieder der
 * Fortschritt, der nicht stimmt.
 */
export function PendingBar(): ReactNode {
  const { pending } = useFormStatus();

  if (!pending) {
    return null;
  }

  return (
    <div
      role="progressbar"
      aria-label={messages.common.working}
      className="pointer-events-none fixed inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-accent-wash lg:left-sidebar"
    >
      <div className="progress-sweep h-full w-1/4 bg-accent" />
    </div>
  );
}
