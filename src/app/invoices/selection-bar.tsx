'use client';

import { CheckCheck, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { SECONDARY_BUTTON_CLASS } from '@/ui/components/form';
import { ICON_STROKE } from '@/ui/components/icon';

import { bulkDeleteDraftsAction, bulkMarkPaidAction } from './actions';

/**
 * Die Aktionsleiste der Mehrfachauswahl (FA-UI-20, §4.2).
 *
 * **Sichtbar wird sie ohne JavaScript.** Die Leiste steht im selben Formular
 * wie die Kästchen; `group-has-[input:checked]` schaltet sie in CSS ein, sobald
 * eines gesetzt ist. Kein Zustand, kein Effekt, keine Hydratation nötig — die
 * Auswahl funktioniert auch dann, wenn das Bündel nicht lädt.
 *
 * **Die Anzahl ist eine Zugabe.** Sie lässt sich in CSS nicht zählen, also
 * zählt sie hier ein Effekt. Ohne JavaScript bleibt es bei der allgemeinen
 * Beschriftung — die Leiste bleibt bedienbar, sie ist nur weniger gesprächig.
 * Das ist die richtige Richtung für eine Verbesserung: Sie darf etwas
 * hinzufügen, aber nichts tragen.
 *
 * **Stornieren fehlt hier bewusst.** Es erzeugt je Beleg eine nummerierte
 * Gutschrift und ist nicht rücknehmbar — kein Vorgang, den man versehentlich
 * für zwölf Belege auf einmal auslösen können soll. Es bleibt eine
 * Zeilenaktion.
 */
export function SelectionBar(): ReactNode {
  const anchor = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const form = anchor.current?.closest('form');
    if (form === null || form === undefined) {
      return;
    }

    const update = (): void => {
      setCount(form.querySelectorAll('input[name="invoiceIds"]:checked').length);
    };

    update();
    form.addEventListener('change', update);
    return () => {
      form.removeEventListener('change', update);
    };
  }, []);

  return (
    <div
      ref={anchor}
      className={
        'hidden items-center gap-4 rounded-surface border border-rule bg-surface px-4 py-3 ' +
        'shadow-raised group-has-[input:checked]:flex'
      }
    >
      <span aria-live="polite" className="text-ui font-medium text-ink">
        {count === 0
          ? messages.invoices.selectionAny
          : count === 1
            ? messages.invoices.selectionCountOne
            : messages.invoices.selectionCount.replace('{count}', String(count))}
      </span>

      <span className="flex flex-wrap gap-2">
        <button type="submit" formAction={bulkMarkPaidAction} className={SECONDARY_BUTTON_CLASS}>
          <CheckCheck aria-hidden="true" className="mr-2 size-4" strokeWidth={ICON_STROKE} />
          {messages.invoices.bulkMarkPaid}
        </button>
        <button
          type="submit"
          formAction={bulkDeleteDraftsAction}
          className={SECONDARY_BUTTON_CLASS}
        >
          <Trash2 aria-hidden="true" className="mr-2 size-4" strokeWidth={ICON_STROKE} />
          {messages.invoices.bulkDeleteDrafts}
        </button>
      </span>
    </div>
  );
}
