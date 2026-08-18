/**
 * Die Auswertung der Übersicht gegen echte Daten (FA-DASH-01 bis -11,
 * NFA-QUAL-05).
 *
 * Der Rechenkern ist bereits in `tests/unit/domain/dashboard-metrics.test.ts`
 * geprüft — hier geht es um das, was zwischen Datenbank und Kennzahl liegt:
 *
 * - Die Projektion liest die richtigen Spalten. Ein vergessenes Feld im
 *   `select` fällt im Typsystem nicht auf, wenn es `null`-fähig ist; es ergibt
 *   eine Kennzahl, die still zu niedrig ist.
 * - Der Empfänger entsteht auf demselben Weg wie in der Rechnungsliste, auch
 *   ohne Kundendatensatz (M5.7).
 * - Der Mandantenkontext greift: Belege einer anderen Organisation erscheinen
 *   in keiner Kennzahl.
 * - Der Zeitpunkt kommt von außen, sodass sich Fristen prüfen lassen, ohne die
 *   Systemuhr zu stellen.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EMPTY_COMPANY_PROFILE,
  saveCompanyProfile,
} from '@/application/company/company-profile';
import { getDashboardMetrics } from '@/application/dashboard/dashboard-metrics';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import {
  createDraftInvoice,
  type DraftInvoiceData,
} from '@/application/invoices/invoice-service';
import { addPayment, markAsFullyPaid } from '@/application/invoices/payments';
import { cancelInvoice } from '@/application/invoices/cancel-invoice';
import { cents } from '@/domain/money/money';
import type { DraftBuyer } from '@/domain/invoice/buyer';
import { plainDate } from '@/domain/time/plain-date';
import { fullyAuthorized } from '@/application/auth/authorize';
import { organizationContextOf } from '@/infrastructure/repositories/organization-context';

import { customerBuyer, fieldsBuyer, freeBuyer } from '../support/buyer';

import { DATA_DATABASE_URL, resetDatabase, TEST_ACTOR_ID } from './setup/database';
import { testOrganization as org } from './setup/organization';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const ACTOR = TEST_ACTOR_ID;

/** Der Bezugszeitpunkt aller Prüfungen — die Uhr bleibt unangetastet. */
const NOW = new Date('2026-08-15T10:00:00Z');
const TODAY = '2026-08-15';

const COMPANY = {
  ...EMPTY_COMPANY_PROFILE,
  legalName: 'Musterbetrieb Tim',
  addressLine1: 'Hauptstr. 1',
  postalCode: '89518',
  city: 'Heidenheim',
  countryCode: 'DE',
  taxNumber: '12/345/67890',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  bankAccountHolder: 'Tim Musterbetrieb',
};

beforeEach(async () => {
  await resetDatabase();
  await saveCompanyProfile(org, COMPANY, ACTOR, null);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function draft(
  buyer: DraftBuyer,
  netCents: number,
  issueDate: string,
  dueDate: string,
): DraftInvoiceData {
  return {
    buyer,
    taxScheme: 'STANDARD',
    currency: 'EUR',
    issueDate,
    serviceDateFrom: issueDate,
    serviceDateTo: null,
    dueDate,
    introText: null,
    outroText: null,
    purchaseOrderRef: null,
    templateId: null,
    lines: [
      {
        position: 1,
        name: 'Beratung',
        description: null,
        // Menge 1, damit der Nettobetrag genau dem Einzelpreis entspricht.
        quantityScaled: 10_000,
        unitCode: 'HUR',
        unitPriceCents: netCents,
        taxRateBasisPoints: 1_900,
        taxCategory: 'S',
        discountBasisPoints: 0,
      },
    ],
  };
}

/** Legt einen festgeschriebenen Beleg an und gibt seine Kennung zurück. */
async function issued(
  buyer: DraftBuyer,
  netCents: number,
  issueDate: string,
  dueDate: string,
): Promise<string> {
  const created = await createDraftInvoice(org, draft(buyer, netCents, issueDate, dueDate), ACTOR, null);
  const result = await issueInvoice(org, created.id, ACTOR, null);
  expect(result.ok, 'Der Beleg muss sich festschreiben lassen').toBe(true);
  return created.id;
}

const RECIPIENT = fieldsBuyer({
  name: 'Schulz KG',
  addressLine1: 'Musterweg 1',
  postalCode: '10115',
  city: 'Berlin',
  countryCode: 'DE',
});

describe('FA-DASH-01 bis -04 Kennzahlen', () => {
  it('summiert offene Forderungen, Überfälligkeit und Umsatz aus einer Quelle', async () => {
    // Überfällig: Fälligkeit lag vor dem Bezugstag.
    await issued(RECIPIENT, 100_000, '2026-06-01', '2026-06-15');
    // Offen, noch nicht fällig.
    await issued(RECIPIENT, 50_000, '2026-08-01', '2026-08-31');
    // Bezahlt: zählt zum Umsatz, nicht zu den Forderungen.
    const paid = await issued(RECIPIENT, 30_000, '2026-08-05', '2026-08-20');
    await markAsFullyPaid(org, paid, plainDate(TODAY), null, ACTOR, null);

    const metrics = await getDashboardMetrics(org, NOW);

    expect(metrics.today).toBe(TODAY);
    // 119.000 + 59.500 brutto stehen offen.
    expect(metrics.receivables.openCents).toBe(178_500);
    expect(metrics.receivables.overdueCents).toBe(119_000);
    expect(metrics.receivables.overdueCount).toBe(1);
    // Netto, nicht brutto (FA-DASH-10).
    expect(metrics.revenueMonthCents).toBe(80_000);
    expect(metrics.revenueYearCents).toBe(180_000);
  });

  it('berücksichtigt Teilzahlungen im offenen Betrag', async () => {
    const id = await issued(RECIPIENT, 100_000, '2026-08-01', '2026-08-31');
    await addPayment(org, id, {
      amountCents: cents(19_000),
      paidAt: plainDate('2026-08-10'),
      method: null,
      note: null,
    }, ACTOR, null);

    const metrics = await getDashboardMetrics(org, NOW);

    expect(metrics.receivables.openCents).toBe(100_000);
    // Der Umsatz ändert sich durch eine Zahlung nicht.
    expect(metrics.revenueMonthCents).toBe(100_000);
  });

  it('lässt Entwürfe und stornierte Belege aus jeder Kennzahl heraus (FA-DASH-04)', async () => {
    await createDraftInvoice(org, draft(RECIPIENT, 500_000, '2026-08-01', '2026-08-31'), ACTOR, null);
    const toCancel = await issued(RECIPIENT, 700_000, '2026-08-02', '2026-08-31');
    const cancelled = await cancelInvoice(org, toCancel, null, ACTOR, null);
    expect(cancelled.ok).toBe(true);

    const metrics = await getDashboardMetrics(org, NOW);

    expect(metrics.receivables.openCents).toBe(0);
    expect(metrics.revenueMonthCents).toBe(0);
    expect(metrics.revenueYearCents).toBe(0);
    // Die Gutschrift zählt ebenfalls nicht mit — sonst fehlte der Betrag
    // zweimal.
    expect(metrics.monthly.every((entry) => entry.netCents === 0)).toBe(true);
  });
});

describe('FA-DASH-05 bis -08 Diagramm und Listen', () => {
  it('verteilt den Umsatz auf die rollierenden zwölf Monate', async () => {
    // Aufsteigend angelegt: Das Festschreiben weist eine Rückdatierung vor
    // eine bereits vergebene Nummer desselben Bereichs ab (FA-NUM-07).
    // Außerhalb des Fensters — dreizehn Monate zurück.
    await issued(RECIPIENT, 90_000, '2025-07-01', '2025-07-31');
    await issued(RECIPIENT, 20_000, '2026-07-01', '2026-07-31');
    await issued(RECIPIENT, 10_000, '2026-08-01', '2026-08-31');

    const metrics = await getDashboardMetrics(org, NOW);
    const byMonth = new Map(metrics.monthly.map((entry) => [entry.month, entry.netCents]));

    expect(metrics.monthly).toHaveLength(12);
    expect(byMonth.get('2026-08')).toBe(10_000);
    expect(byMonth.get('2026-07')).toBe(20_000);
    expect(byMonth.has('2025-07')).toBe(false);
  });

  it('sortiert die Überfälligkeitsliste nach Dauer und nennt die Tage', async () => {
    await issued(RECIPIENT, 10_000, '2026-05-01', '2026-05-15');
    await issued(RECIPIENT, 20_000, '2026-07-01', '2026-07-15');

    const metrics = await getDashboardMetrics(org, NOW);

    expect(metrics.overdue).toHaveLength(2);
    expect(metrics.overdue[0]?.daysOverdue).toBe(92);
    expect(metrics.overdue[1]?.daysOverdue).toBe(31);
  });

  it('führt die in vierzehn Tagen fälligen Belege getrennt', async () => {
    // Überfällig — steht in der anderen Liste.
    await issued(RECIPIENT, 30_000, '2026-06-01', '2026-06-30');
    await issued(RECIPIENT, 10_000, '2026-08-01', '2026-08-20');
    // Einen Tag jenseits der Frist.
    await issued(RECIPIENT, 20_000, '2026-08-01', '2026-08-30');

    const metrics = await getDashboardMetrics(org, NOW);

    expect(metrics.dueSoon.map((entry) => entry.dueDate)).toEqual(['2026-08-20']);
    expect(metrics.overdue.map((entry) => entry.dueDate)).toEqual(['2026-06-30']);
  });

  it('zeigt die zuletzt bearbeiteten Belege mit Status, höchstens zehn', async () => {
    for (let index = 0; index < 12; index += 1) {
      await issued(RECIPIENT, 1_000 * (index + 1), '2026-08-01', '2026-08-31');
    }

    const metrics = await getDashboardMetrics(org, NOW);

    expect(metrics.recent).toHaveLength(10);
    expect(metrics.recent.every((entry) => entry.status === 'ISSUED')).toBe(true);
    expect(metrics.recent.every((entry) => entry.invoiceNumber !== null)).toBe(true);
  });
});

describe('FA-DASH-11 Umsatzstärkste Kunden', () => {
  it('gruppiert über den Empfänger, auch ohne Kundendatensatz', async () => {
    const customer = await prisma.customer.create({
      data: {
        organizationId: org.organizationId,
        customerNumber: 'K-0001',
        companyName: 'Meier GmbH',
        addressLine1: 'Weg 1',
        postalCode: '10115',
        city: 'Berlin',
        countryCode: 'DE',
      },
    });

    await issued(customerBuyer(customer.id), 300_000, '2026-03-01', '2026-03-31');
    await issued(RECIPIENT, 100_000, '2026-04-01', '2026-04-30');
    await issued(RECIPIENT, 150_000, '2026-05-01', '2026-05-31');
    await issued(freeBuyer('Landratsamt Heidenheim\nFelsenstraße 36\n89518 Heidenheim'), 90_000, '2026-06-01', '2026-06-30');

    const metrics = await getDashboardMetrics(org, NOW);

    expect(
      metrics.topCustomers.map((entry) => [entry.customerName, entry.netCents, entry.invoiceCount]),
    ).toEqual([
      ['Meier GmbH', 300_000, 1],
      ['Schulz KG', 250_000, 2],
      // Der freie Empfänger erscheint mit der ersten Zeile seines Blocks
      // (M5.7) — ohne Kundendatensatz fiele er sonst aus der Auswertung.
      ['Landratsamt Heidenheim', 90_000, 1],
    ]);
  });
});

describe('Mandantengrenze', () => {
  it('zählt keinen Beleg einer anderen Organisation mit', async () => {
    await issued(RECIPIENT, 100_000, '2026-08-01', '2026-08-31');

    const second = fullyAuthorized(organizationContextOf('org_zweite'));
    await prisma.organization.create({ data: { id: 'org_zweite', name: 'Zweite' } });
    await prisma.invoice.create({
      data: {
        organizationId: second.organizationId,
        buyerMode: 'FIELDS',
        buyerName: 'Fremd GmbH',
        documentType: 'INVOICE',
        status: 'ISSUED',
        invoiceNumber: 'RE-2026-9999',
        issueDate: '2026-08-01',
        dueDate: '2026-08-31',
        netTotalCents: 999_999,
        grossTotalCents: 1_189_999,
        paidTotalCents: 0,
      },
    });

    const metrics = await getDashboardMetrics(org, NOW);

    expect(metrics.revenueMonthCents).toBe(100_000);
    expect(metrics.recent).toHaveLength(1);
    expect(metrics.topCustomers.map((entry) => entry.customerName)).toEqual(['Schulz KG']);

    // Und aus der Sicht der anderen Organisation genau umgekehrt.
    const other = await getDashboardMetrics(second, NOW);
    expect(other.revenueMonthCents).toBe(999_999);
    expect(other.topCustomers.map((entry) => entry.customerName)).toEqual(['Fremd GmbH']);
  });
});

describe('Leerzustand', () => {
  it('meldet einen leeren Bestand statt Nullen zu erfinden', async () => {
    const metrics = await getDashboardMetrics(org, NOW);

    expect(metrics.hasInvoices).toBe(false);
    expect(metrics.receivables).toEqual({ openCents: 0, overdueCents: 0, overdueCount: 0 });
    expect(metrics.overdue).toEqual([]);
    expect(metrics.dueSoon).toEqual([]);
    expect(metrics.recent).toEqual([]);
    expect(metrics.topCustomers).toEqual([]);
    // Die Zeitachse steht trotzdem — sie hängt am Kalender, nicht am Bestand.
    expect(metrics.monthly).toHaveLength(12);
  });
});
