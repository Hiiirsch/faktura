/**
 * Formularbausteine der Oberfläche.
 *
 * Jedes Feld verbindet Beschriftung und Eingabe fest über `id`/`htmlFor` und
 * hängt eine Fehlermeldung über `aria-describedby` an (NFA-QUAL-09). Als
 * eigene Bausteine statt wiederholter Klassenlisten, damit diese Zuordnung
 * nicht an einer von künftig vielen Stellen vergessen wird.
 */
import type { ReactNode } from 'react';

export const INPUT_CLASS =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 ' +
  'focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 ' +
  'disabled:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ' +
  'dark:disabled:bg-neutral-800';

export const PRIMARY_BUTTON_CLASS =
  'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 ' +
  'focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:bg-neutral-100 ' +
  'dark:text-neutral-900 dark:hover:bg-neutral-300';

export const SECONDARY_BUTTON_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 ' +
  'dark:hover:bg-neutral-800';

export const CARD_CLASS =
  'flex flex-col gap-4 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800';

type BaseFieldProps = {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
  readonly required?: boolean;
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {required === true ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint === undefined ? null : (
        <p id={hintId} className="text-sm text-neutral-600 dark:text-neutral-400">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-red-700 dark:text-red-300">
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
        aria-invalid={field.error === undefined ? undefined : true}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className={INPUT_CLASS}
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
        aria-describedby={describedBy(field.name, field.hint, field.error)}
        className={INPUT_CLASS}
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type="checkbox"
          value="on"
          defaultChecked={defaultChecked}
          aria-describedby={hintId}
          className="size-4 rounded border-neutral-300 dark:border-neutral-700"
        />
        <label htmlFor={name} className="text-sm font-medium">
          {label}
        </label>
      </div>
      {hint === undefined ? null : (
        <p id={hintId} className="text-sm text-neutral-600 dark:text-neutral-400">
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
    <section className={CARD_CLASS}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">{title}</h2>
        {description === undefined ? null : (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Alert({
  tone,
  children,
}: {
  readonly tone: 'error' | 'success';
  readonly children: ReactNode;
}): ReactNode {
  const className =
    tone === 'error'
      ? 'rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
      : 'rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200';

  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={className}>
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
      <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        {message}
      </p>
    </noscript>
  );
}
