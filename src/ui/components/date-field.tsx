'use client';

import { CalendarDays } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { formatPlainDateDe, parsePlainDateDe } from '@/domain/format/de';
import { parsePlainDate } from '@/domain/time/plain-date';
import { messages } from '@/i18n/de';

import { FOCUS_RING, INPUT_CLASS } from './form';
import { ICON_STROKE } from './icon';

/**
 * Datumsfeld mit Direkteingabe **und** Kalenderauswahl (FA-UI-13, §5).
 *
 * Vorher stand hier ein nacktes `<input type="date">`. Dessen Anzeigeformat
 * folgt der Spracheinstellung des **Betriebssystems**, nicht der der
 * Anwendung: Auf einem englisch eingerichteten Rechner steht dort `MM/DD/YYYY`
 * — und wer `03.09.2026` tippt, hat den 9. März erfasst, ohne es zu bemerken.
 * Bei einem Rechnungsdatum ist das kein Schönheitsfehler.
 *
 * Deshalb zwei Elemente statt einem:
 *
 * - Ein Textfeld in `TT.MM.JJJJ`. Es ist das, was man liest und tippt, und es
 *   sieht in jeder Umgebung gleich aus.
 * - Ein `<input type="date">`, durchsichtig über dem Kalendersymbol. Es
 *   liefert die Kalenderauswahl des Browsers, ohne dass sein Textteil je
 *   sichtbar wird.
 *
 * Abgeschickt wird ein verstecktes Feld mit dem ISO-Wert — die Anwendung
 * rechnet durchgehend in `YYYY-MM-DD` (CLAUDE.md, Leitplanke 7), und die
 * Umrechnung gehört an den Rand, nicht in die Verarbeitung.
 *
 * **Eingabe hat Vorrang** (§5): Solange getippt wird, bleibt stehen, was
 * dasteht. Erst wenn sich daraus ein gültiger Tag lesen lässt, wandert er in
 * den ISO-Wert; beim Verlassen des Feldes wird die Schreibweise vereinheitlicht.
 * Eine Eingabe, die kein Datum ergibt, wird **nicht** stillschweigend geleert —
 * sie bleibt sichtbar stehen, damit der Tippfehler auffällt.
 */
export function DateField({
  name,
  label,
  value,
  defaultValue,
  onChange,
  hint,
  required,
}: {
  readonly name: string;
  readonly label: string;
  /** Gesetzt macht das Feld gesteuert — für Felder, die einander bedingen. */
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (isoDate: string) => void;
  readonly hint?: string;
  readonly required?: boolean;
}): ReactNode {
  const fieldId = useId();
  const hintId = hint === undefined ? undefined : `${fieldId}-hint`;

  const [ownIso, setOwnIso] = useState(defaultValue ?? '');
  const iso = value ?? ownIso;

  // Was im Textfeld steht, während getippt wird. `null` heißt: nichts
  // Abweichendes — dann gilt die deutsche Schreibweise des ISO-Werts.
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? formatPlainDateDe(iso);

  const apply = (nextIso: string): void => {
    if (value === undefined) {
      setOwnIso(nextIso);
    }
    onChange?.(nextIso);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-ui font-medium text-ink">
        {label}
        {required === true ? ' *' : ''}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={messages.common.datePlaceholder}
          aria-describedby={hintId}
          value={shown}
          onChange={(event) => {
            const next = event.target.value;
            setTyped(next);

            if (next.trim().length === 0) {
              apply('');
              return;
            }

            const candidate = parsePlainDateDe(next);
            if (candidate !== null && parsePlainDate(candidate).ok) {
              apply(candidate);
            }
          }}
          onBlur={() => {
            // Beim Verlassen die Schreibweise vereinheitlichen — aber nur,
            // wenn ein Datum dahintersteht. Sonst bliebe der Tippfehler
            // unsichtbar und das Feld wäre heimlich leer.
            setTyped(null);
          }}
          className={`${INPUT_CLASS} font-mono`}
        />

        <span className="relative flex size-9 shrink-0 items-center justify-center">
          <CalendarDays
            aria-hidden="true"
            className="size-4 text-ink-muted"
            strokeWidth={ICON_STROKE}
          />
          {/*
            Durchsichtig über dem Symbol: Der Klick trifft das echte
            Datumsfeld, und der Kalender öffnet sich dort, wo das Symbol steht.
            `showPicker()` von Hand aufzurufen wäre der andere Weg — er
            scheitert in Firefox und verlangt eine Nutzergeste, die sich nicht
            in jedem Fall nachweisen lässt.
          */}
          <input
            type="date"
            aria-label={messages.common.datePick.replace('{field}', label)}
            value={iso}
            onChange={(event) => {
              setTyped(null);
              apply(event.target.value);
            }}
            className={`absolute inset-0 cursor-pointer opacity-0 ${FOCUS_RING}`}
          />
        </span>
      </div>

      {/* Der abgeschickte Wert: die Anwendung rechnet in ISO, nicht in TT.MM. */}
      <input type="hidden" name={name} value={iso} />

      {hint === undefined ? null : (
        <span id={hintId} className="text-small text-ink-muted">
          {hint}
        </span>
      )}
    </div>
  );
}
