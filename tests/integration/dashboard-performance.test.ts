/**
 * Ladezeiten bei tausend Rechnungen (NFA-QUAL-04, NFA-QUAL-05).
 *
 * Beide Anforderungen nennen dieselbe Größenordnung: 1.000 Belege, unter einer
 * Sekunde. Für ein Einzelunternehmen ist das reichlich — bei 250 Rechnungen im
 * Jahr sind es vier Jahrgänge.
 *
 * **Warum der Test überhaupt nötig ist.** Die Übersicht rechnet ihre
 * Kennzahlen in der Anwendung statt in `SUM`-Abfragen. Das ist eine bewusste
 * Entscheidung (die Begründung steht in `src/domain/dashboard/metrics.ts`:
 * sonst stünde die Umsatzregel ein zweites Mal in SQL) — und eine, die man
 * belegen muss, statt sie zu behaupten. Wächst der Bestand über das hier
 * geprüfte Maß hinaus, ist dieser Test die Stelle, an der es auffällt.
 *
 * **Warum die Belege direkt eingefügt werden.** Tausend Belege über das
 * Festschreiben anzulegen dauert Minuten und prüft dabei den Nummernkreis
 * erneut, der anderswo geprüft ist. Was hier zählt, ist die Menge der Zeilen
 * — samt Snapshots, denn die sind das Schwergewicht der Tabelle und der Grund,
 * warum die Übersicht eine schmale Projektion liest.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getDashboardMetrics } from '@/application/dashboard/dashboard-metrics';
import { listInvoices } from '@/application/invoices/invoice-queries';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';
import { testOrganization as org } from './setup/organization';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const INVOICE_COUNT = 1_000;
const BUDGET_MS = 1_000;
const NOW = new Date('2026-08-15T10:00:00Z');

beforeEach(async () => {
  /*
   * **Erst trennen, dann tauschen** (M10).
   *
   * `resetDatabase()` ersetzt die Datenbankdatei und trennt dafür den Client der
   * **Anwendung**; den eines Testmoduls kennt es nicht. Bleibt der offen, hängt
   * er an der abgehängten alten Datei: Lesezugriffe liefern veraltete oder gar
   * keine Zeilen, Schreibzugriffe scheitern an Fremdschlüsseln auf Zeilen, die
   * es dort nie gab. Beides ist aufgetreten, und beides sah nach einem Fehler in
   * der Fachlogik aus.
   */
  await prisma.$disconnect();
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Ein Snapshot in realistischer Größe — er wandert bei jeder Zeile mit. */
function snapshot(index: number): string {
  return JSON.stringify({
    name: `Kunde ${String(index % 40)}`,
    contactName: 'Frau Beispiel',
    addressLine1: `Musterweg ${String(index)}`,
    addressLine2: null,
    postalCode: '10115',
    city: 'Berlin',
    countryCode: 'DE',
    email: 'post@beispiel.example',
    phone: '030 123456',
    vatId: null,
    customerNumber: `K-${String(index).padStart(4, '0')}`,
    buyerReference: null,
    addressBlock: null,
  });
}

/**
 * Tausend Belege über zwölf Monate, mit gemischtem Status.
 *
 * Die Mischung ist Absicht: Wären alle Belege bezahlt, fiele jede Zeile schon
 * in der ersten Bedingung heraus, und die Messung sagte nichts über den Fall,
 * auf den es ankommt.
 */
async function seedInvoices(): Promise<void> {
  const statuses = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'DRAFT'] as const;

  const rows = Array.from({ length: INVOICE_COUNT }, (_, index) => {
    const status = statuses[index % statuses.length] ?? 'ISSUED';
    const isDraft = status === 'DRAFT';
    // Über die letzten zwölf Monate verteilt, damit das Diagramm etwas zu
    // gruppieren hat.
    const month = ((index % 12) + 9) % 12;
    const year = month >= 9 ? 2025 : 2026;
    const issueDate = `${String(year)}-${String(month + 1).padStart(2, '0')}-15`;
    const grossTotalCents = 119_000 + index;

    return {
      organizationId: org.organizationId,
      documentType: 'INVOICE',
      invoiceNumber: isDraft ? null : `RE-${String(year)}-${String(index).padStart(4, '0')}`,
      status,
      buyerMode: 'FIELDS',
      buyerName: `Kunde ${String(index % 40)}`,
      buyerAddressLine1: `Musterweg ${String(index)}`,
      buyerPostalCode: '10115',
      buyerCity: 'Berlin',
      buyerCountryCode: 'DE',
      issueDate: isDraft ? null : issueDate,
      serviceDateFrom: isDraft ? null : issueDate,
      dueDate: isDraft ? null : `${String(year)}-${String(month + 1).padStart(2, '0')}-28`,
      currency: 'EUR',
      taxScheme: 'STANDARD',
      netTotalCents: 100_000 + index,
      taxTotalCents: 19_000,
      grossTotalCents,
      paidTotalCents:
        status === 'PAID' ? grossTotalCents : status === 'PARTIALLY_PAID' ? 50_000 : 0,
      snapshotBuyer: isDraft ? null : snapshot(index),
      snapshotSeller: isDraft ? null : snapshot(index),
    };
  });

  // In Blöcken: SQLite begrenzt die Zahl der Parameter je Anweisung.
  for (let start = 0; start < rows.length; start += 200) {
    await prisma.invoice.createMany({ data: rows.slice(start, start + 200) });
  }
}

/** Misst die Dauer eines Aufrufs in Millisekunden. */
async function measure(run: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await run();
  return performance.now() - started;
}

describe('NFA-QUAL-05 Übersicht bei 1.000 Rechnungen', () => {
  it('lädt alle Kennzahlen in unter einer Sekunde', async () => {
    await seedInvoices();

    // Ein erster Lauf wärmt Verbindung und Abfrageplan; gemessen wird der
    // Zustand im Betrieb, nicht der erste Zugriff nach dem Start.
    await getDashboardMetrics(org, NOW);
    const duration = await measure(() => getDashboardMetrics(org, NOW));

    expect(duration).toBeLessThan(BUDGET_MS);
  }, 120_000);

  it('rechnet dabei über den gesamten Bestand, nicht über einen Ausschnitt', async () => {
    await seedInvoices();

    const metrics = await getDashboardMetrics(org, NOW);

    // Zweihundert Belege je Status; offen sind ISSUED und PARTIALLY_PAID.
    expect(metrics.receivables.overdueCount).toBeGreaterThan(0);
    expect(metrics.recent).toHaveLength(10);
    expect(metrics.monthly).toHaveLength(12);
    expect(metrics.hasInvoices).toBe(true);

    // Der Umsatz des Jahres liegt über dem eines einzelnen Monats — sonst
    // hätte die Messung nur einen Ausschnitt gesehen.
    expect(metrics.revenueYearCents).toBeGreaterThan(metrics.revenueMonthCents);
  }, 120_000);
});

describe('NFA-QUAL-04 Rechnungsliste bei 1.000 Rechnungen', () => {
  it('lädt die ungefilterte Liste in unter einer Sekunde', async () => {
    await seedInvoices();

    await listInvoices(org, {}, NOW);
    const duration = await measure(() => listInvoices(org, {}, NOW));

    expect(duration).toBeLessThan(BUDGET_MS);
  }, 120_000);

  it('lädt auch die Volltextsuche in unter einer Sekunde', async () => {
    await seedInvoices();

    // Die Suche ist der teuerste Pfad: Sie fragt neun Spalten und die
    // Positionen ab (`OR` mit `contains`), ohne Index.
    await listInvoices(org, { search: 'Kunde 7' }, NOW);
    const duration = await measure(() => listInvoices(org, { search: 'Kunde 7' }, NOW));

    expect(duration).toBeLessThan(BUDGET_MS);
  }, 120_000);
});
