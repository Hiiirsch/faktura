/**
 * Formularbausteine der Oberfläche (Frontend-Entwurf §5).
 *
 * Jedes Feld verbindet Beschriftung und Eingabe fest über `id`/`htmlFor` und
 * hängt eine Fehlermeldung über `aria-describedby` an (NFA-QUAL-09). Als
 * eigene Bausteine statt wiederholter Klassenlisten, damit diese Zuordnung
 * nicht an einer von künftig vielen Stellen vergessen wird.
 *
 * Sämtliche Klassen stammen aus den Tokens in `globals.css` (FA-UI-01). Es gibt
 * keine `dark:`-Variante: Das dunkle Schema tauscht die Tokenwerte, nicht die
 * Klassen.
 */
import type { Ref, ReactNode } from 'react';

/**
 * Der Fokusring (NFA-UI-02): 2 px in `--accent` mit 2 px Abstand.
 *
 * Als echte `outline`, nicht als `box-shadow` — nur so bleibt er im
 * Kontrastmodus des Betriebssystems sichtbar. `outline: none` ohne Ersatz
 * kommt in dieser Anwendung nirgends vor.
 */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const CONTROL_BASE = `h-9 rounded-control text-ui transition-colors duration-(--duration-state) ${FOCUS_RING}`;

/**
 * Eingabefeld mit Satzmaß (§5).
 *
 * `max-w-form` steht **an der Eingabe**, nicht am Formular: Felder in einem
 * Raster sollen die Spalte ausfüllen, ein einzelnes Feld aber nicht die ganze
 * Inhaltsbreite. Vorher war ein Auswahlfeld für den Kunden 1140 px breit —
 * nichts daran war falsch geschrieben, es fehlte schlicht eine Grenze.
 */
export const INPUT_CLASS =
  `${CONTROL_BASE} w-full max-w-form border border-rule bg-surface-sunken px-3 text-ink ` +
  'placeholder:text-ink-faint disabled:text-ink-faint';

/**
 * Auswahlfeld **in einer Tabellenzelle** (M8).
 *
 * Dieselbe Optik wie `INPUT_CLASS`, aber ohne `w-full max-w-form`. Die
 * Formularbreite gilt für ein Feld unter seiner Beschriftung; in einer Zelle
 * füllte sie die Spalte und schob den Knopf daneben in die nächste Zeile — die
 * Zelle sah dann aus wie zwei.
 *
 * Als eigene Konstante und nicht als angehängtes `w-auto`: Beide Utilities
 * setzen dieselbe Eigenschaft, und welche gewinnt, entscheidet die Reihenfolge
 * im erzeugten Stylesheet, nicht die im Attribut. Das Anhängen wirkte deshalb
 * nicht — sichtbar allein im Browser.
 */
export const INLINE_SELECT_CLASS =
  `${CONTROL_BASE} border border-rule bg-surface-sunken px-3 text-ink`;

/** Mehrzeilige Eingabe: dieselbe Optik, aber ohne feste Höhe. */
export const TEXTAREA_CLASS =
  `rounded-control text-ui transition-colors duration-(--duration-state) ${FOCUS_RING} ` +
  'w-full max-w-form border border-rule bg-surface-sunken px-3 py-2 text-ink ' +
  'placeholder:text-ink-faint';

export const PRIMARY_BUTTON_CLASS =
  `${CONTROL_BASE} inline-flex items-center justify-center bg-accent px-4 font-medium ` +
  'text-surface hover:bg-accent-hover disabled:bg-ink-faint';

export const SECONDARY_BUTTON_CLASS =
  `${CONTROL_BASE} inline-flex items-center justify-center border border-rule px-4 ` +
  'text-ink hover:bg-surface-sunken disabled:text-ink-faint';

/**
 * Ein Knopf, der **nur** ein Symbol trägt (M12).
 *
 * Warum eine eigene Klasse und nicht `SECONDARY_BUTTON_CLASS` mit `px-0`
 * daneben: In CSS entscheidet nicht die Reihenfolge im Klassenstring, sondern
 * die im erzeugten Stylesheet. `px-4` und `px-0` haben dieselbe Spezifität —
 * welches gewinnt, ist nicht steuerbar. In der Vorschau gewann `px-4`, und im
 * 36 px breiten Knopf blieben 4 px für das Symbol: Es erschien als 2 px
 * schmaler Strich. Gemessen im Browser, nicht vermutet.
 *
 * Ein Symbol ohne Beschriftung gibt es nicht — der Aufrufer setzt `aria-label`.
 */
export const ICON_BUTTON_CLASS =
  `${CONTROL_BASE} inline-flex size-9 shrink-0 items-center justify-center border border-rule ` +
  'text-ink hover:bg-surface-sunken disabled:text-ink-faint';

/** Tertiäre Aktionen: nur Text, keine Fläche, keine Kontur. */
export const QUIET_BUTTON_CLASS =
  `${CONTROL_BASE} inline-flex items-center justify-center px-2 text-accent ` +
  'hover:text-accent-hover disabled:text-ink-faint';

/**
 * Destruktive Aktionen. Rot ist ausschließlich für Handlungen reserviert, die
 * Daten zerstören (§2.1) — nicht für Überfälligkeit, nicht für Fehler.
 */
export const DESTRUCTIVE_BUTTON_CLASS =
  `${CONTROL_BASE} inline-flex items-center justify-center bg-danger px-4 font-medium ` +
  'text-surface hover:bg-danger disabled:bg-ink-faint';

/**
 * Abschnittsfläche. Keine Karte, kein Schatten, kein Radius — getrennt allein
 * durch eine Haarlinie und Weißraum (§2.3). Das Blatt bleibt die einzige
 * erhabene Fläche der Anwendung (FA-UI-02).
 */
export const SECTION_CLASS = 'flex flex-col gap-4 border-t border-rule pt-6';

type BaseFieldProps = {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
  readonly required?: boolean;
  /**
   * Markiert das Feld, ohne eine eigene Meldung zu setzen (M12, FA-UI-10).
   *
   * `error` schreibt einen Satz **unter** das Feld. Wo die Erklärung schon
   * woanders steht — im Hinweis „Zum Festschreiben fehlt noch" —, wäre das eine
   * zweite Stimme für dieselbe Sache. Hier wird nur markiert; den Rest erledigt
   * die Regel auf `aria-invalid` in `globals.css`.
   */
  readonly invalid?: boolean;
};

function FieldShell({
  name,
  label,
  hint,
  error,
  required,
  children,
}: BaseFieldProps & { children: ReactNode }): ReactNode {
  const hintId = hint === undefined ? undefined : `${name}-hint`;
  const errorId = error === undefined ? undefined : `${name}-error`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-ui font-medium text-ink">
        {label}
        {required === true ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint === undefined ? null : (
        <p id={hintId} className="text-small text-ink-muted">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(name: string, hint?: string, error?: string): string | undefined {
  const ids = [
    hint === undefined ? null : `${name}-hint`,
    error === undefined ? null : `${name}-error`,
  ].filter((value): value is string => value !== null);
  return ids.length === 0 ? undefined : ids.join(' ');
}

export type TextFieldProps = BaseFieldProps & {
  readonly defaultValue?: string | null;
  readonly type?: 'text' | 'email' | 'tel' | 'url' | 'number';
  readonly autoComplete?: string;
  readonly inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url';
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: string;
  /** Beträge, Nummern und Kennungen werden monospaced gesetzt (FA-UI-03). */
  readonly numeric?: boolean;
};

export function TextField({
  defaultValue,
  type = 'text',
  autoComplete,
  inputMode,
  placeholder,
  min,
  max,
  step,
  numeric,
  ...field
}: TextFieldProps): ReactNode {
  return (
    <FieldShell {...field}>
      <input
        id={field.name}
        name={field.name}
        type={type}
        defaultValue={defaultValue ?? ''}
        required={field.required}
        aria-describedby={describedBy(field.name, field.hint, field.error)}
        aria-invalid={field.error !== undefined || field.invalid === true ? true : undefined}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className={numeric === true ? `${INPUT_CLASS} text-right font-mono` : INPUT_CLASS}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  defaultValue,
  rows = 4,
  ...field
}: BaseFieldProps & { readonly defaultValue?: string | null; readonly rows?: number }): ReactNode {
  return (
    <FieldShell {...field}>
      <textarea
        id={field.name}
        name={field.name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        required={field.required}
        aria-invalid={field.error !== undefined || field.invalid === true ? true : undefined}
        aria-describedby={describedBy(field.name, field.hint, field.error)}
        className={TEXTAREA_CLASS}
      />
    </FieldShell>
  );
}

export type SelectOption = { readonly value: string; readonly label: string };

export function SelectField({
  options,
  defaultValue,
  ...field
}: BaseFieldProps & {
  readonly options: readonly SelectOption[];
  readonly defaultValue?: string | null;
}): ReactNode {
  return (
    <FieldShell {...field}>
      <select
        id={field.name}
        name={field.name}
        defaultValue={defaultValue ?? ''}
        required={field.required}
        aria-describedby={describedBy(field.name, field.hint, field.error)}
        className={INPUT_CLASS}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly defaultChecked?: boolean;
}): ReactNode {
  const hintId = hint === undefined ? undefined : `${name}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type="checkbox"
          value="on"
          defaultChecked={defaultChecked}
          aria-describedby={hintId}
          className={`size-4 rounded-control border border-rule accent-accent ${FOCUS_RING}`}
        />
        <label htmlFor={name} className="text-ui font-medium text-ink">
          {label}
        </label>
      </div>
      {hint === undefined ? null : (
        <p id={hintId} className="text-small text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className={SECTION_CLASS}>
      <div className="flex flex-col gap-1">
        <h2 className="text-section font-semibold text-ink">{title}</h2>
        {description === undefined ? null : (
          <p className="text-small text-ink-muted">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Meldung über den Ausgang einer Handlung.
 *
 * Fehler tragen keine Fläche in `--danger`: Rot bleibt destruktiven Aktionen
 * vorbehalten (§2.1). Ein fehlgeschlagenes Speichern ist kein zerstörerischer
 * Vorgang, sondern eine Auskunft — sie steht in Ocker.
 *
 * **`note` ist die dritte Stufe** (seit M9, FA-UI-23): weder gelungen noch
 * fehlgeschlagen. Sie gibt es, weil ein Vorgang auch enden kann, ohne dass etwas
 * schiefging — wer die Gerätesperre wegdrückt, hat sich entschieden, und eine
 * ockerfarbene Meldung mit `role="alert"` behauptete dort eine Störung.
 */
export function Alert({
  tone,
  children,
  ref,
}: {
  readonly tone: 'error' | 'success' | 'note';
  readonly children: ReactNode;
  /** Zum Anfahren: Eine Meldung, die niemand sieht, ist keine (M12, FA-UI-10). */
  readonly ref?: Ref<HTMLParagraphElement>;
}): ReactNode {
  const background =
    tone === 'error' ? 'bg-ocker-wash' : tone === 'success' ? 'bg-moss-wash' : 'bg-surface-sunken';

  return (
    <p
      ref={ref}
      role={tone === 'error' ? 'alert' : 'status'}
      /*
       * Eine eindeutige Marke für die Browsertests (M12).
       *
       * `[role="alert"]` allein trifft auch den **Routenansager von Next**, der
       * den Seitentitel für Screenreader vorliest. Ein Test, der darauf zielt,
       * prüft die Sichtbarkeit eines fremden Knotens und ist grün, ohne etwas
       * zu beweisen — genau das war er, bevor es diese Marke gab.
       */
      data-alert={tone}
      // `-1`: mit der Maus nicht anfahrbar, per Programm schon.
      tabIndex={-1}
      className={`rounded-control border border-rule ${background} px-4 py-3 text-ui text-ink ${FOCUS_RING}`}
    >
      {children}
    </p>
  );
}

/**
 * Hinweis für Besucher ohne JavaScript.
 *
 * Die umfangreichen Formulare nutzen `useActionState`, um bei einem
 * Validierungsfehler die Eingaben zu erhalten. React kann für solche Formulare
 * keine serverseitige Aktionskennung ausliefern; ohne JavaScript liefe der
 * Absendeversuch ins Leere. Statt eines Fehlers bekommt der Benutzer hier eine
 * verständliche Erklärung.
 */
export function NoScriptNotice({ message }: { readonly message: string }): ReactNode {
  return (
    <noscript>
      <p className="rounded-control border border-rule bg-ocker-wash px-4 py-3 text-ui text-ink">
        {message}
      </p>
    </noscript>
  );
}
