/**
 * Tabelle (Frontend-Entwurf §5).
 *
 * Kopf in `--surface-sunken` und `--type-label`, Zeilen getrennt durch
 * `--rule`, **keine Zebrastreifen**. Beträge und Nummern stehen rechtsbündig
 * und monospaced, damit Dezimaltrennzeichen exakt untereinander liegen
 * (FA-UI-03) — das ist der eigentliche Zweck des monospacen Schnitts.
 *
 * Die Spalten sind Daten, keine Auszeichnung. Nur so lässt sich die Spalte
 * „Erstellt von" für den späteren Mehrbenutzerbetrieb schon jetzt festlegen und
 * zugleich ausblenden (FA-UI-16), ohne dass irgendwo ein auskommentiertes
 * `<th>` liegen bleibt.
 */
import type { ReactNode } from 'react';

import { FOCUS_RING } from './form';

/**
 * Mehrfachauswahl **ohne Client-Zustand** (FA-UI-20).
 *
 * Je Zeile ein Kästchen mit demselben Namen; die Auswahlleiste über der
 * Tabelle erscheint über `:has(:checked)` in CSS. Damit bleibt die Seite eine
 * Server-Komponente und die Auswahl funktioniert ohne JavaScript — ein
 * `useState` über die gewählten Kennungen hätte beides gekostet.
 */
export type Selection<TRow> = {
  /** Feldname; alle Kästchen teilen ihn, der Server liest `getAll`. */
  readonly name: string;
  readonly label: string;
  /** Ein Beleg, den keine Sammelaktion trifft, bekommt kein Kästchen. */
  readonly selectable?: (row: TRow) => boolean;
};

export type Column<TRow> = {
  readonly key: string;
  readonly header: string;
  /** Zahlenspalten stehen rechts und monospaced. */
  readonly numeric?: boolean;
  /**
   * Im Schema festgelegt, aber nicht ausgeliefert. Für Spalten, die erst mit
   * einer späteren Ausbaustufe sichtbar werden (§7).
   */
  readonly hidden?: boolean;
  readonly cell: (row: TRow) => ReactNode;
};

function cellClass(column: Column<unknown>): string {
  return column.numeric === true
    ? 'py-3 pr-4 text-right font-mono text-data'
    : 'py-3 pr-4 text-ui';
}

export function DataTable<TRow>({
  columns,
  rows,
  rowKey,
  caption,
  selection,
  actions,
  actionsLabel,
}: {
  readonly columns: readonly Column<TRow>[];
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow) => string;
  readonly caption: string;
  /** Fehlt, wo es nichts auszuwählen gibt. */
  readonly selection?: Selection<TRow>;
  /**
   * Aktionen am rechten Rand einer Zeile. Sie erscheinen bei Hover **und** bei
   * Tastaturfokus innerhalb der Zeile — `group-focus-within` ist der Teil, den
   * man beim Bauen vergisst und der die Aktionen für alle unerreichbar macht,
   * die nicht mit der Maus arbeiten.
   */
  readonly actions?: (row: TRow) => ReactNode;
  readonly actionsLabel?: string;
}): ReactNode {
  const visible = columns.filter((column) => column.hidden !== true);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-surface-sunken text-left">
            {selection === undefined ? null : (
              <th scope="col" className="w-8 px-2 py-2">
                <span className="sr-only">{selection.label}</span>
              </th>
            )}
            {visible.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={
                  'px-0 py-2 text-label font-semibold uppercase text-ink-muted ' +
                  (column.numeric === true ? 'pr-4 text-right' : 'pr-4')
                }
              >
                {column.header}
              </th>
            ))}
            {actions === undefined ? null : (
              <th scope="col" className="w-px py-2 text-right">
                <span className="sr-only">{actionsLabel ?? ''}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const selectable = selection?.selectable?.(row) ?? true;

            return (
              <tr
                key={key}
                className="group border-b border-rule transition-colors duration-(--duration-state) hover:bg-surface-sunken"
              >
                {selection === undefined ? null : (
                  <td className="px-2 py-3">
                    {selectable ? (
                      <input
                        type="checkbox"
                        name={selection.name}
                        value={key}
                        aria-label={selection.label}
                        className={`size-4 accent-accent ${FOCUS_RING}`}
                      />
                    ) : null}
                  </td>
                )}
                {visible.map((column) => (
                  <td key={column.key} className={cellClass(column as Column<unknown>)}>
                    {column.cell(row)}
                  </td>
                ))}
                {actions === undefined ? null : (
                  <td className="py-3 text-right">
                    <span
                      className={
                        'flex justify-end gap-1 opacity-0 transition-opacity ' +
                        'duration-(--duration-dialog) group-hover:opacity-100 ' +
                        'group-focus-within:opacity-100'
                      }
                    >
                      {actions(row)}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
