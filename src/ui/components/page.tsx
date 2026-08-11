/**
 * Seitenkopf und Leerzustand (Frontend-Entwurf §3, §4.4).
 *
 * Der Seitenkopf ist klebrig, trägt den Titel links und **höchstens zwei**
 * Aktionen rechts. Die Begrenzung ist keine Stilfrage: Eine Werkzeugleiste, in
 * die alles hineinwandert, was irgendwo gebraucht wird, verliert genau die
 * Eigenschaft, wegen der sie oben steht.
 */
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  readonly title: string;
  readonly description?: string;
  /** Höchstens zwei — sekundär zuerst, primär rechts außen. */
  readonly actions?: ReactNode;
}): ReactNode {
  return (
    <header className="sticky top-0 z-10 -mx-8 border-b border-rule bg-surface px-8 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-semibold text-ink">{title}</h1>
        {actions === undefined ? null : (
          <div className="flex items-center gap-3">{actions}</div>
        )}
      </div>
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
