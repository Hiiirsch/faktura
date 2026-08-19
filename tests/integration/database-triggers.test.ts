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
 * Die Trigger, die es geben muss — Stand M8, B3a.
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
  // Mandantengrenze der Rollen (M8) — ein Konto trägt keine fremde Rolle
  'RolePermission_organization_matches_insert',
  'RolePermission_organization_matches_update',
  'User_role_matches_organization_insert',
  'User_role_matches_organization_update',
  // Mandantengrenze der Einladung (M8) — eine Einladung bringt keine fremde Rolle
  'Invitation_role_matches_organization_insert',
  'Invitation_role_matches_organization_update',
  // Aussperrsicherung (M8, FA-ROLE-04) — drei Wege in den verbotenen Zustand.
  // Der vierte, das Löschen einer Rolle, braucht keinen: `User.roleId` trägt
  // `ON DELETE RESTRICT`, und eine Rolle, die niemand trägt, kann niemandem ein
  // Recht nehmen.
  'Organization_keeps_administrator_on_user_update',
  'Organization_keeps_administrator_on_user_delete',
  // Protokoll der Verwaltung (M10, FA-ADM-14) — unveränderlich wie das der
  // Mandanten. Ein Protokoll, das sich nachträglich ändern lässt, ist keines.
  'PlatformAuditEntry_no_update',
  'PlatformAuditEntry_no_delete',
  'Organization_keeps_administrator_on_permission_delete',
] as const;

/**
 * Handgeschriebene Indizes, die Prisma nicht aus dem Schema erzeugt.
 *
 * `Template_one_default_per_organization` ist ein **partieller** eindeutiger
 * Index (`WHERE isDefault = 1`) — genau eine Standardvorlage je Organisation
 * (FA-TPL-02). Partielle Indizes kennt Prisma nicht; er lebt nur in der
 * Migration und geht bei einem Neuaufbau mit den Triggern verloren.
 */
/**
 * `Invitation_one_open_per_email` ist der zweite (M8, FA-MEMB-07): genau eine
 * offene Einladung je Adresse, global und nicht je Unternehmen — eine Adresse
 * gehört zu genau einem Unternehmen.
 */
const EXPECTED_PARTIAL_INDEXES = [
  'Template_one_default_per_organization',
  'Invitation_one_open_per_email',
  // Und der dritte: ein offener Einrichtungsnachweis je Betreiberadresse.
  'AdminInvitation_one_open_per_email',
] as const;

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
   * Das Protokoll bleibt unveränderlich — auch nach einem Tabellenneuaufbau.
   *
   * Die Migration `roles_and_permissions` baut `AuditLog` neu auf, weil die
   * Spalte `actorKind` hinzukommt, und `DROP TABLE` nimmt dabei beide Trigger
   * mit. Genau dieser Fall ist eingetreten, und genau dieser Test hat ihn
   * gemeldet.
   */
  it('behält die Trigger des Protokolls über Neuaufbauten hinweg', async () => {
    await resetDatabase();
    const actual = new Set(await namesOf('trigger'));

    expect(actual.has('AuditLog_no_update')).toBe(true);
    expect(actual.has('AuditLog_no_delete')).toBe(true);
  });

  /**
   * Die gefährlichste Migration und was sie **nicht** getan hat (M8, B6).
   *
   * `invoice_created_by` fügt `Invoice` eine Spalte mit Fremdschlüssel hinzu.
   * Prisma erzeugt dafür unter SQLite eine `RedefineTables`-Migration —
   * `DROP TABLE "Invoice"` inbegriffen —, und die hätte **elf** Trigger
   * mitgenommen: die vier auf `Invoice` und sieben weitere auf `InvoiceLine`,
   * `Payment` und `InvoiceArtifact`, die `Invoice` nur lesen.
   *
   * Die Migration wurde deshalb von Hand auf ein `ALTER TABLE ADD COLUMN`
   * zurückgeführt. Dieser Test ist der Beleg, dass es geblieben ist.
   */
  it('behält alle Trigger rund um den Beleg', async () => {
    await resetDatabase();
    const actual = new Set(await namesOf('trigger'));

    for (const trigger of [
      'Invoice_immutable_after_issue',
      'Invoice_no_delete_after_issue',
      'Invoice_organization_matches_insert',
      'Invoice_organization_matches_update',
      'InvoiceLine_immutable_after_issue',
      'InvoiceLine_no_delete_after_issue',
      'InvoiceLine_organization_matches_insert',
      'InvoiceLine_organization_matches_update',
      'InvoiceArtifact_organization_matches_insert',
      'Payment_organization_matches_insert',
      'Payment_organization_matches_update',
    ]) {
      expect(actual.has(trigger), trigger).toBe(true);
    }
  });

  /**
   * Und die neue Spalte ist von der Unveränderbarkeit erfasst (FA-NUM-08).
   *
   * Eine Spalte hinzuzufügen, ohne den Trigger zu erweitern, ist der leise Weg
   * zu einem Feld, das sich an einem festgeschriebenen Beleg noch ändern lässt.
   * Bei der Urheberangabe wäre das besonders schlecht: Sie ließe sich
   * nachträglich umschreiben, und das ist das Gegenteil dessen, wofür sie da
   * ist.
   */
  it('kennt der Unveränderbarkeitstrigger die Urheberspalte', async () => {
    await resetDatabase();

    const rows = await prisma.$queryRawUnsafe<{ readonly sql: string }[]>(
      "SELECT sql FROM sqlite_master WHERE name = 'Invoice_immutable_after_issue'",
    );

    expect(rows[0]?.sql).toContain('createdById');
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

    for (const table of [
      'Invoice',
      'InvoiceLine',
      'Payment',
      'CompanyProfile',
      'RolePermission',
    ]) {
      expect(actual.has(`${table}_organization_matches_insert`), `${table}: INSERT`).toBe(true);
    }

    // `User` und `Invitation` prüfen nicht ihre eigene Spalte, sondern die
    // Zugehörigkeit ihrer **Rolle** — daher der abweichende Name.
    for (const table of ['User', 'Invitation']) {
      expect(actual.has(`${table}_role_matches_organization_insert`), `${table}: INSERT`).toBe(true);
      expect(actual.has(`${table}_role_matches_organization_update`), `${table}: UPDATE`).toBe(true);
    }

    // `InvoiceArtifact` kennt kein UPDATE — es ist ohnehin unveränderlich.
    for (const table of [
      'Invoice',
      'InvoiceLine',
      'Payment',
      'CompanyProfile',
      'RolePermission',
    ]) {
      expect(actual.has(`${table}_organization_matches_update`), `${table}: UPDATE`).toBe(true);
    }
  });
});
