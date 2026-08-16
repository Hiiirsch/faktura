/**
 * Der Rechenkern der Übersicht (FA-DASH-01 bis -07, -10, -11).
 *
 * Die Kennzahlen einer Rechnungsanwendung sind der Ort, an dem ein Fehler
 * lange unbemerkt bleibt: Eine Summe, die um eine stornierte Rechnung zu hoch
 * ist, sieht aus wie eine Summe. Geprüft wird deshalb nicht nur, dass gerechnet
 * wird, sondern **was ausgeschlossen** wird.
 */
import { describe, expect, it } from 'vitest';

import {
  dueWithin,
  monthlyRevenue,
  netRevenueIn,
  outstandingOf,
  overdueInvoices,
  receivablesOf,
  topCustomers,
  type MetricInvoice,
} from '@/domain/dashboard/metrics';
import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';

const TODAY = plainDate('2026-08-15');

function invoice(overrides: Partial<MetricInvoice> = {}): MetricInvoice {
  return {
    documentType: 'INVOICE',
    status: 'ISSUED',
    issueDate: plainDate('2026-08-01'),
    dueDate: plainDate('2026-08-31'),
    netTotalCents: cents(100_000),
    grossTotalCents: cents(119_000),
    paidTotalCents: cents(0),
    ...overrides,
  };
}

describe('FA-DASH-01/-02 Offene Forderungen', () => {
  it('summiert den offenen Betrag über alle nicht bezahlten Belege', () => {
    const result = receivablesOf(
      [
        invoice(),
        invoice({ grossTotalCents: cents(50_000), paidTotalCents: cents(20_000) }),
      ],
      TODAY,
    );

    // 119.000 offen plus 30.000 Rest.
    expect(result.openCents).toBe(149_000);
  });

  it('weist überfällige Beträge getrennt aus und zählt sie', () => {
    const result = receivablesOf(
      [
        invoice({ dueDate: plainDate('2026-07-01') }),
        invoice({ dueDate: plainDate('2026-08-01'), grossTotalCents: cents(10_000) }),
        invoice({ dueDate: plainDate('2026-09-01') }),
      ],
      TODAY,
    );

    expect(result.overdueCents).toBe(129_000);
    expect(result.overdueCount).toBe(2);
    // Der überfällige Betrag ist ein Teil des offenen, kein zweiter Topf.
    expect(result.openCents).toBe(248_000);
  });

  it('zählt einen am Fälligkeitstag offenen Beleg noch nicht als überfällig', () => {
    const result = receivablesOf([invoice({ dueDate: TODAY })], TODAY);

    expect(result.overdueCount).toBe(0);
    expect(result.openCents).toBe(119_000);
  });

  it('lässt Entwürfe, bezahlte, stornierte und Gutschriften außen vor', () => {
    const result = receivablesOf(
      [
        invoice({ status: 'DRAFT', issueDate: null, dueDate: null }),
        invoice({ status: 'PAID', paidTotalCents: cents(119_000) }),
        invoice({ status: 'CANCELLED', dueDate: plainDate('2026-01-01') }),
        invoice({ documentType: 'CREDIT_NOTE', dueDate: plainDate('2026-01-01') }),
      ],
      TODAY,
    );

    expect(result).toEqual({ openCents: 0, overdueCents: 0, overdueCount: 0 });
  });

  it('rechnet den offenen Betrag aus Brutto minus bereits Gezahltem', () => {
    expect(
      outstandingOf(invoice({ grossTotalCents: cents(119_000), paidTotalCents: cents(19_000) })),
    ).toBe(100_000);
  });
});

describe('FA-DASH-03/-04/-10 Umsatz', () => {
  it('summiert den Nettoumsatz eines Monats und eines Jahres', () => {
    const invoices = [
      invoice({ issueDate: plainDate('2026-08-01'), netTotalCents: cents(100_000) }),
      invoice({ issueDate: plainDate('2026-08-31'), netTotalCents: cents(50_000) }),
      invoice({ issueDate: plainDate('2026-07-31'), netTotalCents: cents(70_000) }),
      invoice({ issueDate: plainDate('2025-12-31'), netTotalCents: cents(999_000) }),
    ];

    expect(netRevenueIn(invoices, '2026-08')).toBe(150_000);
    expect(netRevenueIn(invoices, '2026')).toBe(220_000);
  });

  it('rechnet netto, nicht brutto — die Umsatzsteuer ist durchlaufender Posten', () => {
    expect(netRevenueIn([invoice()], '2026-08')).toBe(100_000);
  });

  it('lässt Entwürfe und Stornos aus jeder Umsatzkennzahl heraus (FA-DASH-04)', () => {
    const invoices = [
      invoice({ status: 'DRAFT', issueDate: plainDate('2026-08-01') }),
      invoice({ status: 'CANCELLED', issueDate: plainDate('2026-08-02') }),
      invoice({ documentType: 'CREDIT_NOTE', issueDate: plainDate('2026-08-03') }),
      invoice({ status: 'PAID', issueDate: plainDate('2026-08-04'), netTotalCents: cents(7_000) }),
    ];

    // Übrig bleibt allein die bezahlte Rechnung: Umsatz entsteht mit dem
    // Festschreiben, nicht mit dem Zahlungseingang.
    expect(netRevenueIn(invoices, '2026-08')).toBe(7_000);
  });
});

describe('FA-DASH-05 Umsatz je Monat', () => {
  it('liefert genau zwölf Monate, ältester zuerst', () => {
    const series = monthlyRevenue([], TODAY);

    expect(series).toHaveLength(12);
    expect(series[0]?.month).toBe('2025-09');
    expect(series[11]?.month).toBe('2026-08');
  });

  it('trägt Monate ohne Umsatz mit Null ein statt sie wegzulassen', () => {
    const series = monthlyRevenue(
      [invoice({ issueDate: plainDate('2026-08-01'), netTotalCents: cents(30_000) })],
      TODAY,
    );

    expect(series.map((entry) => entry.netCents)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30_000,
    ]);
  });

  it('rechnet über die Jahresgrenze richtig zurück', () => {
    const series = monthlyRevenue([], plainDate('2026-01-31'), 3);

    expect(series.map((entry) => entry.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('ignoriert Belege außerhalb des Fensters', () => {
    const series = monthlyRevenue(
      [invoice({ issueDate: plainDate('2024-08-01'), netTotalCents: cents(500_000) })],
      TODAY,
    );

    expect(series.every((entry) => entry.netCents === 0)).toBe(true);
  });
});

describe('FA-DASH-06/-07 Fristenlisten', () => {
  it('sortiert überfällige Belege nach Dauer, längste zuerst', () => {
    const list = overdueInvoices(
      [
        invoice({ dueDate: plainDate('2026-08-10') }),
        invoice({ dueDate: plainDate('2026-05-01') }),
        invoice({ dueDate: plainDate('2026-07-15') }),
        invoice({ dueDate: plainDate('2026-09-01') }),
      ],
      TODAY,
    );

    expect(list.map((entry) => entry.dueDate)).toEqual([
      '2026-05-01',
      '2026-07-15',
      '2026-08-10',
    ]);
  });

  it('zeigt in den nächsten 14 Tagen fällige Belege, nächste zuerst', () => {
    const list = dueWithin(
      [
        invoice({ dueDate: plainDate('2026-08-29') }),
        invoice({ dueDate: plainDate('2026-08-20') }),
        // Genau am Rand der Frist — zählt mit.
        invoice({ dueDate: plainDate('2026-08-29') }),
        // Einen Tag darüber — zählt nicht.
        invoice({ dueDate: plainDate('2026-08-30') }),
        // Überfällig — steht in der anderen Liste.
        invoice({ dueDate: plainDate('2026-08-01') }),
      ],
      TODAY,
    );

    expect(list.map((entry) => entry.dueDate)).toEqual([
      '2026-08-20',
      '2026-08-29',
      '2026-08-29',
    ]);
  });

  it('zählt einen heute fälligen Beleg zur kommenden Frist', () => {
    // Er ist nicht überfällig und stünde sonst in keiner der beiden Listen.
    const list = dueWithin([invoice({ dueDate: TODAY })], TODAY);

    expect(list).toHaveLength(1);
  });

  it('führt weder Entwürfe noch bezahlte Belege in den Fristenlisten', () => {
    const invoices = [
      invoice({ status: 'DRAFT', dueDate: plainDate('2026-01-01') }),
      invoice({ status: 'PAID', dueDate: plainDate('2026-01-01') }),
      invoice({ status: 'CANCELLED', dueDate: plainDate('2026-08-20') }),
    ];

    expect(overdueInvoices(invoices, TODAY)).toEqual([]);
    expect(dueWithin(invoices, TODAY)).toEqual([]);
  });
});

describe('FA-DASH-11 Umsatzstärkste Kunden', () => {
  const named = (customerName: string, net: number, issueDate = '2026-05-01') => ({
    ...invoice({ issueDate: plainDate(issueDate), netTotalCents: cents(net) }),
    customerName,
  });

  it('summiert je Empfänger und sortiert absteigend', () => {
    const list = topCustomers(
      [
        named('Schulz KG', 100_000),
        named('Meier GmbH', 250_000),
        named('Schulz KG', 200_000),
        named('Bauer AG', 50_000),
      ],
      '2026',
    );

    expect(list.map((entry) => [entry.customerName, entry.netCents, entry.invoiceCount])).toEqual([
      ['Schulz KG', 300_000, 2],
      ['Meier GmbH', 250_000, 1],
      ['Bauer AG', 50_000, 1],
    ]);
  });

  it('begrenzt die Liste', () => {
    const list = topCustomers(
      ['A', 'B', 'C', 'D', 'E', 'F'].map((name, index) => named(name, (index + 1) * 1_000)),
      '2026',
      3,
    );

    expect(list.map((entry) => entry.customerName)).toEqual(['F', 'E', 'D']);
  });

  it('zählt Belege eines anderen Jahres nicht mit', () => {
    const list = topCustomers(
      [named('Schulz KG', 100_000, '2025-12-31'), named('Schulz KG', 40_000, '2026-01-01')],
      '2026',
    );

    expect(list).toEqual([{ customerName: 'Schulz KG', netCents: 40_000, invoiceCount: 1 }]);
  });
});
