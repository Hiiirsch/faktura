/**
 * Der Bestand an Triggern und handgeschriebenen Indizes (M8, B0).
 *
 * **Warum dieser Test vor allen Migrationen von M8 steht.** SQLite kennt kein
 * `ALTER TABLE ADD CONSTRAINT`. Jede Migration, die eine Tabelle **neu
 * aufbaut**, verliert deshalb alle handgeschriebenen CHECK-Bedingungen und
 * **alle Trigger** — auch die auf anderen Tabellen, die die neu gebaute nur
 * lesen. Prisma erzeugt so eine Migration schon für eine hinzugefügte
 * Relationsspalte, ohne dass im Diff der `schema.prisma` etwas darauf hindeutet.
 *
 * Der Verlust ist doppelt unsichtbar: Die Anwendung läuft weiter, die Tests
 * laufen weiter — nur die Unveränderbarkeit festgeschriebener Belege
 * (FA-NUM-08) und die Mandantengrenze (M5.5a) sind still weg. Genau das würde
 * man erst bemerken, wenn jemand einen Beleg ändert, den niemand mehr ändern
 * können sollte.
 *
 * Dieser Test ist die Stelle, die es laut sagt. Er prüft nicht, **was** die
 * Trigger tun — das tun die Tests der jeweiligen Anforderung —, sondern nur,
 * **dass** sie da sind. Wer einen entfernt, muss diese Liste anfassen, und das
 * sieht man im Diff.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Die Trigger, die es geben muss — Stand M7.
 *
 * Gruppiert nach ihrem Zweck, damit beim Lesen auffällt, wenn eine ganze
 * Gruppe fehlt statt eines einzelnen Eintrags.
 */
const EXPECTED_TRIGGERS = [
  // Unveränderbarkeit des Protokolls (NFA-COMP-02)
  'AuditLog_no_delete',
  'AuditLog_no_update',
  // Unveränderbarkeit festgeschriebener Belege (FA-NUM-08, FA-RECH-11, FA-TPL-09)
  'InvoiceArtifact_no_update',
  'InvoiceLine_immutable_after_issue',
  'InvoiceLine_no_delete_after_issue',
  'Invoice_immutable_after_issue',
  'Invoice_no_delete_after_issue',
  // Mandantengrenze (M5.5a) — jeder Verweis bleibt innerhalb einer Organisation
  'CompanyProfile_organization_matches_insert',
  'CompanyProfile_organization_matches_update',
  'InvoiceArtifact_organization_matches_insert',
  'InvoiceLine_organization_matches_insert',
  'InvoiceLine_organization_matches_update',
  'Invoice_organization_matches_insert',
  'Invoice_organization_matches_update',
  'Payment_organization_matches_insert',
  'Payment_organization_matches_update',
] as const;

/**
 * Handgeschriebene Indizes, die Prisma nicht aus dem Schema erzeugt.
 *
 * `Template_one_default_per_organization` ist ein **partieller** eindeutiger
 * Index (`WHERE isDefault = 1`) — genau eine Standardvorlage je Organisation
 * (FA-TPL-02). Partielle Indizes kennt Prisma nicht; er lebt nur in der
 * Migration und geht bei einem Neuaufbau mit den Triggern verloren.
 */
const EXPECTED_PARTIAL_INDEXES = ['Template_one_default_per_organization'] as const;

type SqliteObject = { readonly name: string };

async function namesOf(type: 'trigger' | 'index', extra = ''): Promise<readonly string[]> {
  const rows = await prisma.$queryRawUnsafe<SqliteObject[]>(
    `SELECT name FROM sqlite_master WHERE type = ? ${extra} ORDER BY name`,
    type,
  );
  return rows.map((row) => row.name);
}

describe('Der Bestand an Triggern', () => {
  it('führt genau die erwarteten Trigger', async () => {
    await resetDatabase();

    const actual = await namesOf('trigger');

    // Als Menge verglichen, nicht als Liste: Die Reihenfolge in der Datenbank
    // hängt von der Reihenfolge der Migrationen ab und sagt nichts aus.
    expect([...actual].sort()).toEqual([...EXPECTED_TRIGGERS].sort());
  });

  it('führt den partiellen Index, den Prisma nicht kennt', async () => {
    await resetDatabase();

    const actual = await namesOf('index', "AND sql LIKE '%WHERE%'");

    expect([...actual].sort()).toEqual([...EXPECTED_PARTIAL_INDEXES].sort());
  });

  /**
   * Die Mandantengrenze im Einzelnen.
   *
   * Ein eigener Fall, weil diese Gruppe bei einem Neuaufbau von `Invoice` als
   * Ganzes verschwindet: Trigger, die `Invoice` lesen, lassen
   * `ALTER TABLE … RENAME` scheitern und werden deshalb vorher verworfen. Wer
   * sie danach nicht neu anlegt, hat eine Anwendung ohne Mandantengrenze.
   */
  it('sichert jede Verweiskante über die Mandantengrenze', async () => {
    await resetDatabase();
    const actual = new Set(await namesOf('trigger'));

    for (const table of ['Invoice', 'InvoiceLine', 'Payment', 'CompanyProfile']) {
      expect(actual.has(`${table}_organization_matches_insert`), `${table}: INSERT`).toBe(true);
    }

    // `InvoiceArtifact` kennt kein UPDATE — es ist ohnehin unveränderlich.
    for (const table of ['Invoice', 'InvoiceLine', 'Payment', 'CompanyProfile']) {
      expect(actual.has(`${table}_organization_matches_update`), `${table}: UPDATE`).toBe(true);
    }
  });
});
