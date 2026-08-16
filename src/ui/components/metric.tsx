/**
 * Die Kennzahlenfläche der Übersicht (Frontend-Entwurf §1, §4.1).
 *
 * Das zweite tragende Prinzip des Entwurfs: **Die Zahl ist die Überschrift.**
 * Die größte Schrift der Anwendung ist keine Headline, sondern ein monospacer
 * Betrag — wer die Anwendung öffnet, liest zuerst eine Zahl, nicht das Wort
 * „Übersicht".
 *
 * `--text-metric` gab es seit M5.5b im Tokensatz und kam im gesamten Quelltext
 * nicht ein einziges Mal vor: Die Übersicht zeigte einen Datenbank-Healthcheck.
 * Damit war die These des Entwurfs nie zu sehen und also auch nicht zu
 * beurteilen.
 *
 * Kein Rahmen um die einzelne Zahl, keine vier Karten nebeneinander — nur
 * Weißraum, das kleine Label darüber und eine Haarlinie unter der Reihe (§4.1).
 * Die Fläche als Ganzes ist die einzige gehobene der Übersicht; sie liegt über
 * dem Inhalt, weil sie das erste ist, was gelesen wird.
 *
 * **Gesetzt in Fira Sans, nicht in Fira Mono** (Änderung gegenüber §2.2, seit
 * M6.1). Der Grund für Monospace ist Vergleichbarkeit in einer Spalte:
 * Dezimaltrennzeichen sollen untereinander stehen. Vier Beträge nebeneinander
 * bilden aber keine Spalte — hier wirkt nur noch die Nebenwirkung, die feste
 * Dickte, und `312,38 €` liest sich in 40 px wie eine Terminalausgabe. Was von
 * Monospace gebraucht wird, leisten `tabular-nums` in der Grotesk ebenso;
 * gesetzt wird das in `globals.css` unter `.metric-figure`.
 */
import type { ReactNode } from 'react';

export type Metric = {
  readonly label: string;
  /** Bereits formatiert — die Anzeigeschicht rechnet nicht. */
  readonly value: string;
  /** Eine Zeile Einordnung darunter: „netto", „3 Rechnungen". */
  readonly note?: string;
};

export function MetricRow({ metrics }: { readonly metrics: readonly Metric[] }): ReactNode {
  return (
    <section className="rounded-surface border border-rule bg-surface px-6 py-6 shadow-raised">
      <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex flex-col gap-2">
            <dt className="text-label font-semibold uppercase text-ink-muted">{metric.label}</dt>
            <dd className="flex flex-col gap-1">
              <span className="metric-figure text-metric font-semibold text-ink">
                {metric.value}
              </span>
              {metric.note === undefined ? null : (
                <span className="text-small text-ink-muted">{metric.note}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
