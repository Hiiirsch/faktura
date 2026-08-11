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
}: {
  readonly columns: readonly Column<TRow>[];
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow) => string;
  readonly caption: string;
}): ReactNode {
  const visible = columns.filter((column) => column.hidden !== true);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-surface-sunken text-left">
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-rule">
              {visible.map((column) => (
                <td key={column.key} className={cellClass(column as Column<unknown>)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
