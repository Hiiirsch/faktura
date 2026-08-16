/**
 * Umsatz je Monat über die letzten zwölf Monate (FA-DASH-05, §4.1).
 *
 * Einfarbig in `--ink`, **ohne Achsengitter, ohne Legende**; der laufende Monat
 * in `--accent`. Der Entwurf begründet das mit der Aufgabe des Diagramms: Es
 * beantwortet „läuft es besser als vorher", nicht „wie viel genau war es im
 * März". Die genaue Zahl steht daneben, sobald man einen Balken ansteuert.
 *
 * **Als Inline-SVG statt mit einer Diagrammbibliothek.** Zwölf Rechtecke und
 * zwölf Beschriftungen rechtfertigen keine Abhängigkeit, die ihre eigenen
 * Farben, Radien und Schriftgrößen mitbringt — die man anschließend
 * vollständig überschreiben müsste, um FA-UI-01 einzuhalten. Und weil die
 * Balken echte SVG-Elemente sind, tragen sie ihre Werte ohne JavaScript.
 *
 * **Ohne Werte keine Skala.** Sind alle zwölf Monate leer, wird nichts
 * gezeichnet: Ein Diagramm aus zwölf Nullbalken behauptet eine Messung, die es
 * nicht gab. Die Fläche nennt dann den Grund.
 */
import type { ReactNode } from 'react';

import { formatMoneyDe } from '@/domain/format/de';
import type { Cents } from '@/domain/money/money';
import { messages, monthAbbreviations } from '@/i18n/de';

export type ChartBar = {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly netCents: Cents;
};

/** Kürzel des Monats für die Achse — „Sep", „Okt", … */
function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return monthAbbreviations[index] ?? month;
}

export function RevenueChart({
  bars,
  currentMonth,
}: {
  readonly bars: readonly ChartBar[];
  /** `YYYY-MM` — dieser Balken wird abgesetzt. */
  readonly currentMonth: string;
}): ReactNode {
  const maximum = Math.max(...bars.map((bar) => bar.netCents), 0);

  if (maximum === 0) {
    return <p className="text-small text-ink-muted">{messages.dashboard.chartEmpty}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/*
        Die Balken als Flex-Reihe statt in einem SVG-Koordinatensystem: So
        skalieren sie mit der Spaltenbreite, ohne dass eine `viewBox`
        umgerechnet werden muss, und die Beschriftung darunter bleibt echte
        Schrift in Tokengröße.
      */}
      <div
        className="flex h-32 items-end gap-1 border-b border-rule"
        role="img"
        aria-label={messages.dashboard.chart}
      >
        {bars.map((bar) => {
          const share = Math.round((bar.netCents / maximum) * 100);

          return (
            <span
              key={bar.month}
              // Der Titel trägt den genauen Wert — ein Diagramm ohne Achse
              // muss ihn auf Nachfrage hergeben.
              title={`${monthLabel(bar.month)}: ${formatMoneyDe(bar.netCents)}`}
              className="flex h-full flex-1 items-end"
            >
              {/*
                Ein Monat ohne Umsatz bekommt **keinen** Balken. Vorher stand
                dort ein Mindestbalken von einem Prozent — ein Strich, den man
                für eine Achse hält und der behauptet, es sei etwas gewesen.
                Die Grundlinie unter der Reihe leistet, was er leisten sollte.
              */}
              {share === 0 ? null : (
                <span
                  className={
                    'w-full transition-colors duration-(--duration-state) ' +
                    (bar.month === currentMonth ? 'bg-accent' : 'bg-ink-muted')
                  }
                  // Die einzige Stelle mit einem gerechneten Maß: Die Höhe ist
                  // ein Messwert, kein Gestaltungswert, und kann deshalb nicht
                  // aus dem Tokensatz kommen.
                  style={{ height: `${String(Math.max(share, 2))}%` }}
                />
              )}
            </span>
          );
        })}
      </div>

      <div className="flex gap-1">
        {bars.map((bar) => (
          <span key={bar.month} className="flex-1 text-center text-label text-ink-muted">
            {monthLabel(bar.month)}
          </span>
        ))}
      </div>

      {/* Für Hilfstechnik: die Reihe als Text, nicht als Bild. */}
      <table className="sr-only">
        <caption>{messages.dashboard.chart}</caption>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.month}>
              <th scope="row">{bar.month}</th>
              <td>{formatMoneyDe(bar.netCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
