'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { messages } from '@/i18n/de';

import { FOCUS_RING, INPUT_CLASS } from './form';
import { ICON_STROKE } from './icon';

/**
 * Ein Passwortfeld, dessen Inhalt sich ansehen lässt (M13.1, FA-UI-10).
 *
 * **Ohne JavaScript gibt es den Knopf nicht**, und das ist der Kern dieses
 * Bauteils. Das Umschalten braucht JavaScript; ein Knopf, den es gibt und der
 * dann nichts tut, wäre schlechter als keiner. Die Anmeldung ist die eine
 * Stelle, an der Bedienbarkeit ohne JavaScript zugesagt ist (NFA-UI-06) —
 * dieselbe Regel wie beim Passkey-Knopf, der dort ebenfalls fehlt, wo er nicht
 * tragen kann.
 *
 * Versteckt wird über `js-only` und eine Regel im `<noscript>` des Layouts:
 * kein Zustand, kein Effekt, kein Flackern beim ersten Anstrich.
 *
 * Das Feld selbst ist ein gewöhnliches `<input>` und bleibt es: Ohne JavaScript
 * ist es ein Passwortfeld, mit JavaScript kommt ein Knopf daneben. Umgeschaltet
 * wird allein der `type` — der Wert wandert nirgendwohin.
 *
 * `aria-pressed` sagt einem Screenreader, ob das Passwort gerade sichtbar ist;
 * ohne das wäre der Knopf eine Handlung ohne erkennbaren Zustand.
 */
export function PasswordField({
  name,
  label,
  autoComplete,
  required = false,
  minLength,
  hint,
}: {
  readonly name: string;
  readonly label: string;
  readonly autoComplete?: 'current-password' | 'new-password';
  readonly required?: boolean;
  /** Mindestlänge nach `MIN_PASSWORD_LENGTH`, wo ein Passwort gesetzt wird. */
  readonly minLength?: number;
  readonly hint?: string;
}): ReactNode {
  const [visible, setVisible] = useState(false);

  const hintId = hint === undefined ? undefined : `${name}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-ui font-medium text-ink">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          aria-describedby={hintId}
          className={INPUT_CLASS}
        />

        <button
            type="button"
            onClick={() => {
              setVisible((current) => !current);
            }}
            aria-pressed={visible}
            aria-label={visible ? messages.common.passwordHide : messages.common.passwordShow}
            title={visible ? messages.common.passwordHide : messages.common.passwordShow}
            className={
              'js-only inline-flex size-9 shrink-0 items-center justify-center rounded-control ' +
              `text-ink-muted hover:text-ink ${FOCUS_RING}`
            }
          >
            {visible ? (
              <EyeOff aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
            ) : (
              <Eye aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
            )}
          </button>
      </div>

      {hint === undefined ? null : (
        <span id={hintId} className="text-small text-ink-muted">
          {hint}
        </span>
      )}
    </div>
  );
}
