/**
 * Seitenkopf und Leerzustand (Frontend-Entwurf §3, §4.4).
 *
 * Der Seitenkopf ist klebrig, trägt den Titel links und **höchstens zwei**
 * Aktionen rechts. Die Begrenzung ist keine Stilfrage: Eine Werkzeugleiste, in
 * die alles hineinwandert, was irgendwo gebraucht wird, verliert genau die
 * Eigenschaft, wegen der sie oben steht.
 */
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { FOCUS_RING } from './form';
import { ICON_STROKE } from './icon';

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
  meta,
  titleClassName,
}: {
  readonly title: string;
  /** Zusatzklasse am Titel — für den Stempel beim Festschreiben (FA-UI-07). */
  readonly titleClassName?: string;
  readonly description?: string;
  /** Höchstens zwei — sekundär zuerst, primär rechts außen. */
  readonly actions?: ReactNode;
  /**
   * Rückweg auf die übergeordnete Liste.
   *
   * Er gehört in den Seitenkopf und nicht als erste Zeile in den Inhalt: Dort
   * stand er auf der Belegseite bisher, klebte an der Fensterkante und
   * verschob alles darunter um eine Zeile.
   */
  readonly backHref?: string;
  readonly backLabel?: string;
  /** Eine Zeile unter dem Titel — auf der Belegseite das Statusfeld. */
  readonly meta?: ReactNode;
}): ReactNode {
  return (
    <header className="sticky top-0 z-10 -mx-8 border-b border-rule bg-surface px-8 pt-6 pb-4">
      {backHref === undefined ? null : (
        <Link
          href={backHref}
          className={`mb-2 -ml-1 inline-flex items-center gap-1 rounded-control text-small text-ink-muted hover:text-ink ${FOCUS_RING}`}
        >
          <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={ICON_STROKE} />
          {backLabel ?? ''}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={`text-title font-semibold text-ink ${titleClassName ?? ''}`}>{title}</h1>
        {actions === undefined ? null : (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        )}
      </div>
      {meta === undefined ? null : <div className="pt-3">{meta}</div>}
      {description === undefined ? null : (
        <p className="pt-2 text-small text-ink-muted">{description}</p>
      )}
    </header>
  );
}

/**
 * Leerzustand (FA-UI-09).
 *
 * Eine Zeile, darunter die Handlung. Keine Illustration, kein Icon: Der Satz
 * nennt die nächste Handlung konkret, und daneben steht der Knopf, der sie
 * auslöst. Alles Weitere wäre Ausschmückung einer Stelle, an der jemand etwas
 * vorhat.
 */
export function EmptyState({
  message,
  action,
}: {
  readonly message: string;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <p className="text-body text-ink-muted">{message}</p>
      {action}
    </div>
  );
}
