'use client';

import { useId, useRef, type ReactNode } from 'react';

import { messages } from '@/i18n/de';

import {
  DESTRUCTIVE_BUTTON_CLASS,
  FOCUS_RING,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from './form';

/**
 * Bestätigung vor einer nicht rücknehmbaren Handlung (FA-UI-17, NFA-QUAL-12).
 *
 * Vorher stand hier `window.confirm`. Das Browserfenster lässt sich nicht
 * gestalten, stellt den Namen der Anwendung in den Titel und zeigt genau eine
 * Textzeile — §8 des Entwurfs verlangt aber, dass eine Bestätigung die *Folge*
 * erklärt, nicht die Aktion wiederholt. „Wirklich?" hilft bei keiner
 * Entscheidung.
 *
 * Verwendet wird das native `<dialog>` samt `showModal()`. Fokusfalle,
 * Escape-Taste, Hintergrundsperre und die oberste Ebene kommen damit vom
 * Browser statt aus nachgebautem JavaScript — nachgebaute Modale sind die
 * verlässlichste Quelle für Tastaturfallen.
 *
 * Der bestätigende Knopf steht **im** Dialog und ist ein echter
 * `type="submit"`. Weil der Dialog innerhalb des Formulars liegt, sendet er es
 * ab; es braucht keinen Umweg über `requestSubmit()` und keinen Zustand, der
 * zwischen Knopf und Formular vermittelt.
 *
 * Ohne JavaScript öffnet sich kein Dialog. Deshalb ist der auslösende Knopf
 * dann **kein** toter Knopf, sondern sendet unmittelbar ab (`type="submit"`,
 * bis `showModal` verfügbar ist): Lieber eine Handlung ohne Rückfrage als eine
 * Oberfläche, die nicht reagiert. Die serverseitige Prüfung entscheidet
 * ohnehin, was zulässig ist.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  trigger,
  formAction,
  tone = 'default',
}: {
  readonly title: string;
  /** Nennt die Folge der Handlung, nicht die Handlung. */
  readonly message: string;
  readonly confirmLabel: string;
  /** Der auslösende Knopf, wie er in der Oberfläche steht. */
  readonly trigger: ReactNode;
  /**
   * Das Ziel des bestätigenden Knopfes, wo es vom Formular abweicht.
   *
   * Kein `name`/`value` daneben: React belegt `name` eines absendenden Knopfes
   * selbst, um die Aktionskennung zu übertragen. Was die Aktion über den
   * Gegenstand wissen muss, wird an sie gebunden.
   */
  readonly formAction?: (formData: FormData) => void | Promise<void>;
  readonly tone?: 'default' | 'danger';
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  // Eigene Kennung je Dialog: Auf der Belegseite stehen mehrere nebeneinander.
  const titleId = useId();

  return (
    <>
      <span
        onClickCapture={(event) => {
          const element = dialog.current;
          if (element === null) {
            return;
          }

          /*
           * **Erst prüfen, dann fragen** (M12).
           *
           * Ein modaler Dialog macht alles hinter sich `inert`. Ist im Formular
           * ein Pflichtfeld leer, will der Browser es beim Absenden anspringen,
           * kann es nicht — und bricht das Absenden **wortlos** ab. Für den
           * Benutzer tat der Knopf im Dialog dann gar nichts: keine Meldung,
           * keine Bewegung, nur ein Satz in der Konsole, den niemand sieht
           * („An invalid form control … is not focusable").
           *
           * Gemeldet wurde das als „der Klick auf Festschreiben geht nicht",
           * und genau so sah es aus.
           *
           * Deshalb wird **vor** dem Öffnen geprüft, solange das Formular noch
           * bedienbar ist: `reportValidity()` springt das erste ungültige Feld
           * an und sagt, was fehlt. Die Rückfrage erscheint dann gar nicht —
           * es gäbe ja nichts zu bestätigen.
           */
          const button = (event.target as HTMLElement).closest('button');
          const form = button?.form ?? null;

          if (button?.type === 'submit' && form !== null && !form.checkValidity()) {
            event.preventDefault();
            form.reportValidity();
            return;
          }

          // Mit JavaScript zuerst fragen. Ohne JavaScript läuft der Klick
          // durch und sendet unmittelbar ab — lieber eine Handlung ohne
          // Rückfrage als eine Oberfläche, die nicht reagiert.
          event.preventDefault();
          element.showModal();
        }}
      >
        {trigger}
      </span>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        /*
         * **Mittig, und zwar ausdrücklich** (M12).
         *
         * Ein `<dialog>` steht von Haus aus in der Mitte: Die Stilvorgabe des
         * Browsers setzt `margin: auto`. Genau das nimmt ihm der Preflight von
         * Tailwind, der die Ränder aller Elemente auf null setzt — der Dialog
         * klebte dadurch oben links am Rand. Ein Fall, in dem man erst den
         * Browser fragen muss, wo etwas herkommt, bevor man es „repariert":
         * Nachgebaut mit `fixed` und `translate` wäre es dieselbe Wirkung mit
         * mehr Teilen, und die Fokusfalle des Browsers hinge daran.
         */
        className={
          'm-auto w-full max-w-dialog rounded-surface border border-rule bg-surface p-6 ' +
          'text-ink shadow-raised backdrop:bg-ink/30'
        }
        onClick={(event) => {
          // Klick auf den Hintergrund schließt. Der Dialog selbst füllt seinen
          // Kasten aus, also trifft ein Klick auf ihn immer ein Kindelement —
          // `event.target === dialog` bedeutet zuverlässig „daneben".
          if (event.target === dialog.current) {
            dialog.current.close();
          }
        }}
      >
        <div className="flex flex-col gap-4">
          <h2 id={titleId} className="text-section font-semibold text-ink">
            {title}
          </h2>
          <p className="text-body text-ink-muted">{message}</p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => {
                dialog.current?.close();
              }}
            >
              {messages.common.cancel}
            </button>
            <button
              type="submit"
              formAction={formAction}
              className={`${tone === 'danger' ? DESTRUCTIVE_BUTTON_CLASS : PRIMARY_BUTTON_CLASS} ${FOCUS_RING}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
