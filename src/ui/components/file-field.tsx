'use client';

import { Paperclip } from 'lucide-react';
import { useId, useState, type ChangeEvent, type ReactNode } from 'react';

import { messages } from '@/i18n/de';

import { FOCUS_RING, SECONDARY_BUTTON_CLASS } from './form';
import { ICON_STROKE } from './icon';

/**
 * Dateiauswahl in der Gestaltung der Anwendung (M12, FA-UI-01, FA-UI-05).
 *
 * **Warum überhaupt.** `<input type="file">` bringt seinen eigenen Knopf mit,
 * und der gehört dem Browser: eigene Fläche, eigene Ecken, eigene Schrift —
 * und eine Beschriftung, die je nach Browser und Systemsprache „Datei
 * auswählen", „Choose File" oder „Durchsuchen …" lautet. Auf einer Oberfläche,
 * deren Texte alle in `de.ts` stehen, war das die einzige Stelle, an der
 * jemand anderes das Wort führte.
 *
 * **Der Weg dorthin: eine Beschriftung, die wie ein Knopf aussieht.** Ein
 * `<label for>` öffnet die Dateiauswahl von sich aus — dafür braucht es kein
 * JavaScript und kein `click()` auf einem versteckten Feld. Das Feld selbst
 * bleibt im Baum und bedienbar (`sr-only`, nicht `display: none`): Ein
 * verstecktes Formularfeld sendet nichts, und ein Screenreader fände es nicht.
 * Der Fokusring wandert über `peer-focus-visible` auf die Beschriftung, damit
 * die Tastaturbedienung sichtbar bleibt.
 *
 * Der **Name** der gewählten Datei ist das einzige Stück, das JavaScript
 * braucht. Ohne JavaScript steht dort weiter „Keine Datei ausgewählt" — die
 * Auswahl selbst funktioniert trotzdem, und das Formular sendet sie. Ein
 * bekannter, hinnehmbarer Rest: Diese Formulare sind ohnehin
 * `useActionState`-Formulare und tragen einen `<NoScriptNotice>`.
 */
export function FileField({
  name,
  label,
  accept,
  hint,
  required = false,
}: {
  readonly name: string;
  readonly label: string;
  readonly accept: string;
  readonly hint?: string;
  readonly required?: boolean;
}): ReactNode {
  const id = useId();
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ui font-medium text-ink">{label}</span>

      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          name={name}
          type="file"
          accept={accept}
          required={required}
          className="peer sr-only"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setFileName(event.target.files?.[0]?.name ?? null);
          }}
        />
        <label
          htmlFor={id}
          className={`${SECONDARY_BUTTON_CLASS} cursor-pointer gap-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${FOCUS_RING}`}
        >
          <Paperclip aria-hidden="true" className="size-4" strokeWidth={ICON_STROKE} />
          {messages.common.chooseFile}
        </label>

        <span className={fileName === null ? 'text-ui text-ink-faint' : 'text-ui text-ink'}>
          {fileName ?? messages.common.noFileChosen}
        </span>
      </div>

      {hint === undefined ? null : <p className="text-small text-ink-muted">{hint}</p>}
    </div>
  );
}
