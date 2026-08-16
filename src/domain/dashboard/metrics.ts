/**
 * Der Rechenkern der Übersicht (FA-DASH-01 bis -11).
 *
 * FA-DASH-09 verlangt, dass alle Kennzahlen aus **einer** Auswertungsfunktion
 * stammen. Diese Datei ist ihr Kern: reine Rechnung über eine Liste von
 * Belegen, ohne Datenbank, ohne Zeitzone, ohne Framework. Die
 * Anwendungsschicht besorgt die Belege und setzt das Ergebnis zusammen
 * (`src/application/dashboard/dashboard-metrics.ts`).
 *
 * **Was hier bewusst nicht entschieden wird.** Drei Regeln liegen schon
 * woanders und werden von hier benutzt, nicht wiederholt:
 *
 * - Welcher Beleg als Umsatz zählt und welcher als offene Forderung —
 *   `invoice/revenue.ts`. Gutschriften bleiben außen vor; die Neutralisierung
 *   geschieht dadurch, dass das Original auf `CANCELLED` wechselt.
 * - Ob ein Beleg überfällig ist — `invoice/status.ts`. Überfälligkeit ist ein
 *   abgeleiteter Zustand und wird nie gespeichert (FA-STAT-02).
 * - Was offen ist — `outstandingAmount()` aus derselben Datei.
 *
 * Damit ist FA-DASH-04 keine eigene Prüfung in dieser Datei, sondern eine
 * Folge: Entwürfe und Stornos fallen schon durch `countsTowardRevenue()`
 * heraus.
 *
 * **Warum über einer Liste statt über Aggregaten der Datenbank.** Eine
 * `SUM`-Abfrage müsste ihre Auswahl im `WHERE` wiederholen — und damit die
 * Umsatzregel ein zweites Mal formulieren, in einer anderen Sprache. Genau das
 * verbietet FA-DASH-09 dem Sinn nach. Die Belegköpfe tragen ihre Summen
 * denormalisiert (Spec §4), sodass hier nichts über Positionen aggregiert
 * werden muss; für den Bestand, den diese Anwendung führt, ist das schnell
 * genug — nachgewiesen mit 1.000 Belegen in
 * `tests/integration/dashboard-performance.test.ts` (NFA-QUAL-05).
 */
import { addCents, type Cents, subtractCents, sumCents, ZERO_CENTS } from '../money/money';
import type { DocumentType } from '../document/document-type';
import {
  countsTowardReceivables,
  countsTowardRevenue,
} from '../invoice/revenue';
import {
  daysOverdue,
  type InvoiceStatus,
  isOverdue,
  outstandingAmount,
} from '../invoice/status';
import { type PlainDate, addDays, comparePlainDates, isPlainDateAfter, yearMonthOf } from '../time/plain-date';

/**
 * Ein Beleg, soweit die Auswertung ihn braucht.
 *
 * Absichtlich schmaler als die Belegzeile der Liste: Was die Übersicht rechnet,
 * hängt an sieben Feldern. Ein breiterer Typ lüde zur Rechnung mit Angaben ein,
 * die zufällig danebenliegen.
 */
export type MetricInvoice = {
  readonly documentType: DocumentType;
  readonly status: InvoiceStatus;
  /** Ein Entwurf hat keines; er zählt ohnehin nirgends mit. */
  readonly issueDate: PlainDate | null;
  readonly dueDate: PlainDate | null;
  readonly netTotalCents: Cents;
  readonly grossTotalCents: Cents;
  readonly paidTotalCents: Cents;
};

/** Der noch offene Betrag eines Belegs. */
export function outstandingOf(invoice: MetricInvoice): Cents {
  return outstandingAmount(invoice.grossTotalCents, invoice.paidTotalCents);
}

export type Receivables = {
  /** Offen gesamt (FA-DASH-01). */
  readonly openCents: Cents;
  /** Davon überfällig (FA-DASH-02). */
  readonly overdueCents: Cents;
  readonly overdueCount: number;
};

export function receivablesOf(
  invoices: readonly MetricInvoice[],
  today: PlainDate,
): Receivables {
  let openCents = ZERO_CENTS;
  let overdueCents = ZERO_CENTS;
  let overdueCount = 0;

  for (const invoice of invoices) {
    if (!countsTowardReceivables(invoice)) {
      continue;
    }

    const outstanding = outstandingOf(invoice);
    openCents = addCents(openCents, outstanding);

    if (isOverdue(invoice.status, invoice.dueDate, today)) {
      overdueCents = addCents(overdueCents, outstanding);
      overdueCount += 1;
    }
  }

  return { openCents, overdueCents, overdueCount };
}

/**
 * Nettoumsatz in einem Zeitraum, benannt über sein Präfix (FA-DASH-03, -10).
 *
 * `2026` für ein Jahr, `2026-08` für einen Monat. Der Vergleich läuft über den
 * Kalendertag als Zeichenkette — er ist dafür gebaut: `YYYY-MM-DD` sortiert
 * und gruppiert lexikografisch genau wie chronologisch, und es entsteht kein
 * `Date`, das an einer Zeitzonengrenze in den Nachbarmonat kippt.
 *
 * **Netto**, nicht brutto: Die Umsatzsteuer ist durchlaufender Posten, kein
 * Umsatz. Die Oberfläche beschriftet die Bezugsgröße (FA-DASH-10).
 */
export function netRevenueIn(invoices: readonly MetricInvoice[], prefix: string): Cents {
  return sumCents(
    invoices
      .filter(
        (invoice) =>
          countsTowardRevenue(invoice) && (invoice.issueDate?.startsWith(prefix) ?? false),
      )
      .map((invoice) => invoice.netTotalCents),
  );
}

export type MonthlyRevenue = {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly netCents: Cents;
};

/**
 * Die rollierenden letzten `count` Monate, ältester zuerst (FA-DASH-05).
 *
 * Monate ohne Umsatz erscheinen mit Null statt zu fehlen — ein Diagramm mit
 * Lücken behauptet einen anderen Verlauf als einen mit Nullen, und die
 * Zeitachse wäre nicht mehr gleichmäßig.
 */
export function monthlyRevenue(
  invoices: readonly MetricInvoice[],
  today: PlainDate,
  count = 12,
): readonly MonthlyRevenue[] {
  const buckets = new Map<string, Cents>();

  for (const month of lastMonths(today, count)) {
    buckets.set(month, ZERO_CENTS);
  }

  for (const invoice of invoices) {
    if (!countsTowardRevenue(invoice) || invoice.issueDate === null) {
      continue;
    }

    const month = yearMonthOf(invoice.issueDate);
    const current = buckets.get(month);
    if (current !== undefined) {
      buckets.set(month, addCents(current, invoice.netTotalCents));
    }
  }

  return [...buckets].map(([month, netCents]) => ({ month, netCents }));
}

/**
 * Die letzten `count` Monatsnamen, ältester zuerst.
 *
 * Gerechnet auf Jahr und Monat als Zahlen, nicht über `Date`: Der 31. um einen
 * Monat zurückgesetzt ergibt in JavaScript den 3. März, und die Reihe hätte
 * dann einen Monat doppelt und einen gar nicht.
 */
function lastMonths(today: PlainDate, count: number): readonly string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const months: string[] = [];

  for (let back = count - 1; back >= 0; back -= 1) {
    // Nullbasiert rechnen, damit der Übertrag über die Jahresgrenze stimmt.
    const index = year * 12 + (month - 1) - back;
    const label = `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
    months.push(label);
  }

  return months;
}

/** Offene Forderungen, deren Fälligkeit vorbei ist — längste zuerst (FA-DASH-06). */
export function overdueInvoices<T extends MetricInvoice>(
  invoices: readonly T[],
  today: PlainDate,
): readonly T[] {
  return invoices
    .filter(
      (invoice) =>
        countsTowardReceivables(invoice) && isOverdue(invoice.status, invoice.dueDate, today),
    )
    .sort((a, b) => daysOverdue(b.dueDate, today) - daysOverdue(a.dueDate, today));
}

/**
 * Offene Forderungen, die in den nächsten `days` Tagen fällig werden — die
 * nächste zuerst (FA-DASH-07).
 *
 * Heute fällige zählen mit: Sie sind noch nicht überfällig und stünden sonst in
 * keiner der beiden Listen.
 */
export function dueWithin<T extends MetricInvoice>(
  invoices: readonly T[],
  today: PlainDate,
  days = 14,
): readonly T[] {
  const limit = addDays(today, days);

  return invoices
    .filter((invoice) => {
      if (!countsTowardReceivables(invoice) || invoice.dueDate === null) {
        return false;
      }
      // Nicht überfällig und nicht jenseits der Frist.
      return (
        !isOverdue(invoice.status, invoice.dueDate, today) &&
        !isPlainDateAfter(invoice.dueDate, limit)
      );
    })
    .sort((a, b) => comparePlainDates(a.dueDate ?? limit, b.dueDate ?? limit));
}

export type CustomerRevenue = {
  readonly customerName: string;
  readonly netCents: Cents;
  readonly invoiceCount: number;
};

/**
 * Die umsatzstärksten Empfänger eines Zeitraums (FA-DASH-11, KANN).
 *
 * Gruppiert wird über den **Anzeigenamen**, nicht über die Kundenkennung: Seit
 * M5.7 trägt ein Beleg seinen Empfänger auch ohne Stammdatensatz, und ein
 * Kunde ohne Kennung fiele sonst aus der Auswertung, obwohl er Umsatz gebracht
 * hat.
 */
export function topCustomers(
  invoices: readonly (MetricInvoice & { readonly customerName: string })[],
  prefix: string,
  limit = 5,
): readonly CustomerRevenue[] {
  const totals = new Map<string, CustomerRevenue>();

  for (const invoice of invoices) {
    if (!countsTowardRevenue(invoice) || !(invoice.issueDate?.startsWith(prefix) ?? false)) {
      continue;
    }

    const previous = totals.get(invoice.customerName);
    totals.set(invoice.customerName, {
      customerName: invoice.customerName,
      netCents: addCents(previous?.netCents ?? ZERO_CENTS, invoice.netTotalCents),
      invoiceCount: (previous?.invoiceCount ?? 0) + 1,
    });
  }

  return [...totals.values()]
    .sort((a, b) => subtractCents(b.netCents, a.netCents))
    .slice(0, limit);
}
