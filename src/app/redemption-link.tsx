'use client';

import type { ReactNode } from 'react';

import type { Delivery } from '@/application/notifications/deliver';
import { messages } from '@/i18n/de';

/**
 * Ein Nachweis, der genau einmal zu sehen ist — samt Auskunft über die
 * Zustellung (M8, M9, M14).
 *
 * **Warum in `src/app/` und nicht in `src/ui/`.** Der Typ `Delivery` gehört der
 * Anwendungsschicht, und `ui → application` gibt es nicht (NFA-ARCH-01). Es ist
 * dieselbe Einordnung wie bei `LegalFooter` seit M13: Ein Bauteil, das die
 * Anwendungsschicht kennt, ist eine Seitenkomposition und keine Darstellung.
 *
 * **Warum überhaupt gemeinsam.** Fünf Stellen zeigen denselben Kasten:
 * Mitglied einladen, Passwort zurücksetzen, Unternehmen anlegen, Einladung
 * erneut ausstellen, Betreiberkonto einrichten. Zwei davon trugen bis M14 eine
 * wortgleiche Kopie mit dem Vermerk „wortgleich zur Fassung in der
 * Mitgliederverwaltung" — und genau diese Kopie hat die Zustellung dann nicht
 * mitbekommen.
 *
 * Der Link steht in einem `readonly`-Feld und nicht in einem Absatz: So nimmt
 * ihn ein Doppelklick vollständig auf, ohne dass beim Markieren mit der Maus
 * ein Zeichen fehlt. Ein „Kopieren"-Knopf käme ohne Clipboard-API nicht aus,
 * und die ist an eine sichere Herkunft gebunden — in einer selbstgehosteten
 * Anlage ohne Zertifikat also nicht verlässlich da.
 *
 * **Der Hinweis steht neben dem Link, nie an seiner Stelle.** Auch bei
 * `sent`: Wer die Mail nicht bekommt, ist sonst ausgesperrt (FA-MEMB-08).
 */
export function RedemptionLink({
  heading,
  hint,
  link,
  delivery,
  email,
}: {
  readonly heading: string;
  readonly hint: string;
  readonly link: string;
  /**
   * Was aus der Zustellung wurde. `undefined` heißt: Diese Stelle stellt nicht
   * zu — dann steht kein Satz darüber, und das ist etwas anderes als ein
   * Fehlschlag.
   *
   * `| undefined` ausdrücklich wegen `exactOptionalPropertyTypes`: Die
   * Aufrufer reichen das Feld eines Zustandsobjekts durch, das es nicht in
   * jedem Zweig trägt.
   */
  readonly delivery?: Delivery | undefined;
  /** Empfängeradresse für den Satz „… wurde zusätzlich an {email} geschickt". */
  readonly email?: string | undefined;
}): ReactNode {
  const note = deliveryNote(delivery, email ?? '');

  return (
    <div className="flex flex-col gap-2 rounded-control border border-rule bg-surface-sunken p-4">
      <span className="text-label font-semibold uppercase text-ink-faint">{heading}</span>
      <input
        readOnly
        value={link}
        aria-label={heading}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        className="w-full rounded-control border border-rule bg-surface px-3 py-2 font-mono text-data text-ink"
      />
      <p className="text-small text-ink-muted">{hint}</p>
      {note === null ? null : <p className="text-small text-ink-muted">{note}</p>}
    </div>
  );
}

function deliveryNote(delivery: Delivery | undefined, email: string): string | null {
  switch (delivery) {
    case 'sent':
      return messages.delivery.sent.replace('{email}', email);
    case 'failed':
      return messages.delivery.failed;
    case 'not-configured':
      return messages.delivery.notConfigured;
    default:
      return null;
  }
}
