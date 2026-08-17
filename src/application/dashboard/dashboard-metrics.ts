/**
 * Die Kennzahlen der Übersicht (FA-DASH-01 bis -11).
 *
 * **Eine Funktion, ein Zeitpunkt, eine Abfrage.** FA-DASH-09 verlangt, dass
 * alle Kennzahlen aus einer einzigen Auswertungsfunktion stammen. Der Grund
 * ist nicht Ordnungsliebe: Eine zweite Stelle, die „Umsatz" ausrechnet, ist
 * eine zweite Auslegung davon, was Umsatz ist — und die Abweichung fällt erst
 * auf, wenn jemand zwei Zahlen vergleicht, die nicht zusammenpassen.
 *
 * Deshalb steht hier alles nebeneinander: Kacheln, Diagramm, Fristenlisten,
 * zuletzt bearbeitete Belege und Top-Kunden. Gerechnet wird in der Domäne
 * (`src/domain/dashboard/metrics.ts`), gelesen in einem Zug aus dem Repository
 * (`listInvoicesForMetrics`).
 *
 * **„Heute" kommt von außen.** `now` ist ein Parameter, kein `new Date()` im
 * Rumpf. Überfälligkeit, laufender Monat und die Zwölfmonatsreihe hängen alle
 * am selben Tag; würde jede Kennzahl ihren eigenen Zeitpunkt lesen, könnte
 * eine Übersicht, die um Mitternacht geladen wird, einen Beleg gleichzeitig
 * als überfällig und als heute fällig ausweisen.
 */
import type { Authorized } from '@/application/auth/authorize';
import { getAppTimeZone } from '@/application/system/display-settings';
import {
  buyerDisplayName,
} from '@/domain/invoice/buyer';
import {
  type CustomerRevenue,
  dueWithin,
  type MetricInvoice,
  monthlyRevenue,
  type MonthlyRevenue,
  netRevenueIn,
  outstandingOf,
  overdueInvoices,
  type Receivables,
  receivablesOf,
  topCustomers,
} from '@/domain/dashboard/metrics';
import { cents, type Cents } from '@/domain/money/money';
import { daysOverdue, type InvoiceStatus, isInvoiceStatus } from '@/domain/invoice/status';
import { plainDate, type PlainDate, todayIn } from '@/domain/time/plain-date';
import {
  type InvoiceMetricsRow,
  listInvoicesForMetrics,
} from '@/infrastructure/repositories/invoice-repository';

import { customerDisplayName, draftBuyerOf } from '../invoices/invoice-buyer';

/** Ein Beleg, wie ihn die Listen der Übersicht zeigen. */
export type DashboardInvoice = MetricInvoice & {
  readonly id: string;
  readonly invoiceNumber: string | null;
  readonly customerName: string;
  readonly currency: string;
  /** Tage seit der Fälligkeit; `0`, solange nichts überfällig ist. */
  readonly daysOverdue: number;
  readonly outstandingCents: Cents;
};

export type DashboardMetrics = {
  /** Der Tag, auf den sich jede Kennzahl bezieht. */
  readonly today: PlainDate;
  readonly receivables: Receivables;
  /** Nettoumsatz des laufenden Monats (FA-DASH-03, -10). */
  readonly revenueMonthCents: Cents;
  readonly revenueYearCents: Cents;
  /** Rollierende zwölf Monate, ältester zuerst (FA-DASH-05). */
  readonly monthly: readonly MonthlyRevenue[];
  /** Überfällig, längste Dauer zuerst (FA-DASH-06). */
  readonly overdue: readonly DashboardInvoice[];
  /** Fällig in den nächsten vierzehn Tagen (FA-DASH-07). */
  readonly dueSoon: readonly DashboardInvoice[];
  /** Zuletzt bearbeitet, höchstens zehn (FA-DASH-08). */
  readonly recent: readonly DashboardInvoice[];
  /** Umsatzstärkste Empfänger des laufenden Jahres (FA-DASH-11). */
  readonly topCustomers: readonly CustomerRevenue[];
  /** Ob überhaupt ein Beleg vorliegt — sonst zeigt die Seite den Leerzustand. */
  readonly hasInvoices: boolean;
};

const RECENT_LIMIT = 10;

function asStatus(value: string): InvoiceStatus {
  return isInvoiceStatus(value) ? value : 'DRAFT';
}

function asDate(value: string | null): PlainDate | null {
  return value === null ? null : plainDate(value);
}

/**
 * Die gespeicherte Zeile als Beleg der Übersicht.
 *
 * Der Name des Empfängers entsteht auf demselben Weg wie in der Rechnungsliste
 * (`buyerDisplayName`) — seit M5.7 steht er in einer von drei Quellen, und zwei
 * Auslegungen davon liefen auseinander, sobald jemand einen freien Empfänger
 * erfasst.
 */
function toDashboardInvoice(row: InvoiceMetricsRow, today: PlainDate): DashboardInvoice {
  const status = asStatus(row.status);
  const dueDate = asDate(row.dueDate);

  const invoice: MetricInvoice = {
    documentType: row.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE',
    status,
    issueDate: asDate(row.issueDate),
    dueDate,
    netTotalCents: cents(row.netTotalCents),
    grossTotalCents: cents(row.grossTotalCents),
    paidTotalCents: cents(row.paidTotalCents),
  };

  return {
    ...invoice,
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    customerName:
      buyerDisplayName(
        draftBuyerOf(row),
        row.customer === null ? null : customerDisplayName({ ...EMPTY_CUSTOMER, ...row.customer }),
      ) ?? '',
    currency: row.currency,
    daysOverdue: daysOverdue(dueDate, today),
    outstandingCents: outstandingOf(invoice),
  };
}

/**
 * Die Pflichtfelder, die `customerDisplayName` nicht liest.
 *
 * Die Projektion der Übersicht wählt aus dem Kunden nur die beiden Namen aus;
 * der gemeinsame Typ verlangt mehr. Statt eine zweite Namensfunktion zu
 * schreiben, werden die ungenutzten Felder hier aufgefüllt — die eine
 * Namensregel bleibt damit an einer Stelle.
 */
const EMPTY_CUSTOMER = {
  companyName: null,
  contactName: null,
  addressLine1: '',
  addressLine2: null,
  postalCode: '',
  city: '',
  countryCode: '',
  email: null,
  phone: null,
  vatId: null,
  customerNumber: '',
  buyerReference: null,
};

export async function getDashboardMetrics(
  context: Authorized<'invoice.read'>,
  now: Date = new Date(),
): Promise<DashboardMetrics> {
  const today = todayIn(getAppTimeZone(), now);
  const rows = await listInvoicesForMetrics(context);
  const invoices = rows.map((row) => toDashboardInvoice(row, today));

  const month = today.slice(0, 7);
  const year = today.slice(0, 4);

  return {
    today,
    receivables: receivablesOf(invoices, today),
    revenueMonthCents: netRevenueIn(invoices, month),
    revenueYearCents: netRevenueIn(invoices, year),
    monthly: monthlyRevenue(invoices, today),
    overdue: overdueInvoices(invoices, today),
    dueSoon: dueWithin(invoices, today),
    // Das Repository liefert bereits nach Bearbeitung absteigend sortiert.
    recent: invoices.slice(0, RECENT_LIMIT),
    topCustomers: topCustomers(invoices, year),
    hasInvoices: invoices.length > 0,
  };
}
