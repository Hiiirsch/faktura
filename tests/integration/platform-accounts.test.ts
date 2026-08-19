/**
 * Betreiberkonten aus der Oberfläche (M10, B1, FA-ADM-12, -13).
 *
 * **Der Kern dieser Datei ist die Aussperrsicherung**, und sie wird von zwei
 * Seiten geprüft: dass sie greift, wenn es das letzte aktive Konto träfe, und
 * dass sie sonst **nichts** behindert. Der zweite Teil ist der wichtigere — die
 * Mandantenfassung derselben Regel hat in M8 im ersten Entwurf bei jeder
 * Kontoänderung gefeuert und dabei die Anmeldung abgebrochen.
 *
 * **Der eigene Prisma-Client dieser Datei liest nur.** `resetDatabase()` tauscht
 * die Datenbankdatei aus und trennt dafür den Client der Anwendung
 * (`getPrismaClient()`) — den eines Testmoduls kennt es nicht. Ein Lesezugriff
 * übersteht den Tausch, ein **Schreibzugriff** landet in der abgehängten alten
 * Datei und scheitert mit einem Fremdschlüsselfehler auf eine Zeile, die es dort
 * nie gab. Geschrieben wird deshalb ausschließlich über die Anwendungsschicht.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { adminLogin } from '@/application/admin/admin-login';
import {
  getPlatformAuditTrail,
  setOrganizationSuspended,
} from '@/application/admin/organization-admin';
import { createAdminSession } from '@/application/admin/admin-session-service';
import {
  invitePlatformAccount,
  listPlatformAccounts,
  resetPlatformAccount,
  setPlatformAccountDisabled,
} from '@/application/admin/platform-accounts';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { hashToken } from '@/infrastructure/auth/tokens';
import { generateTotpSecret } from '@/infrastructure/auth/totp';
import {
  DEFAULT_ORGANIZATION_ID,
  organizationContextOf,
} from '@/infrastructure/repositories/organization-context';
import { platformContextOf } from '@/infrastructure/repositories/platform-context';
import { createAdminUser } from '@/infrastructure/repositories/platform-repository';

import { DATA_DATABASE_URL, resetDatabase, TEST_ACTOR_ID } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';
const CONTEXT = { ipAddress: '203.0.113.9', userAgent: 'pruefung' };
const NOW = new Date();

beforeEach(async () => {
  /*
   * **Erst trennen, dann tauschen.**
   *
   * `resetDatabase()` ersetzt die Datenbankdatei und trennt dafür den Client der
   * **Anwendung**; den eines Testmoduls kennt es nicht. Bleibt der offen, hängt
   * er an der ersetzten, abgehängten Datei: Lesezugriffe liefern dann alte oder
   * gar keine Zeilen, Schreibzugriffe scheitern an Fremdschlüsseln auf Zeilen,
   * die es dort nie gab. Beides ist hier aufgetreten, beides sah nach einem
   * Fehler in der Fachlogik aus.
   */
  await prisma.$disconnect();
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedAdmin(email: string): Promise<string> {
  const admin = await createAdminUser({
    email,
    passwordHash: await hashPassword(PASSWORD),
    totpSecret: generateTotpSecret(),
    totpEnabled: true,
  });
  return admin.id;
}

describe('FA-ADM-12 Betreiberkonten verwalten', () => {
  it('führt alle Konten mit Zustand und zweitem Faktor', async () => {
    const first = await seedAdmin('eins@example.org');
    await seedAdmin('zwei@example.org');

    const accounts = await listPlatformAccounts(platformContextOf(first));

    expect(accounts.map((account) => account.email)).toEqual([
      'eins@example.org',
      'zwei@example.org',
    ]);
    expect(accounts.every((account) => account.totpEnabled)).toBe(true);
    expect(accounts.every((account) => account.disabledAt === null)).toBe(true);
  });

  it('gibt die Liste kein Passwortfeld heraus', async () => {
    // Was eine Abfrage nicht mitbringt, kann keine Ansicht versehentlich
    // ausgeben. Die Zusage steckt in der Projektion, nicht in der Vorsicht des
    // Aufrufers.
    const id = await seedAdmin('eins@example.org');
    const [account] = await listPlatformAccounts(platformContextOf(id));

    expect(account).toBeDefined();
    expect(Object.keys(account ?? {})).not.toContain('passwordHash');
    expect(Object.keys(account ?? {})).not.toContain('totpSecret');
  });

  it('lädt ein weiteres Konto ein und gibt den Link genau einmal zurück', async () => {
    const id = await seedAdmin('eins@example.org');

    const result = await invitePlatformAccount(platformContextOf(id), 'Neu@Example.ORG ', NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = await prisma.adminInvitation.findFirst({ where: { email: 'neu@example.org' } });
    expect(stored).not.toBeNull();
    // Gespeichert liegt nur der Hash — der Token existiert nur im Rückgabewert.
    expect(stored?.tokenHash).toBe(hashToken(result.value.token));
    expect(stored?.kind).toBe('CREATE');

    // Und es entsteht noch kein Konto: Das tut erst das Einlösen.
    expect(await prisma.adminUser.count()).toBe(1);
  });

  it('weist eine belegte Adresse ab', async () => {
    const id = await seedAdmin('eins@example.org');

    const result = await invitePlatformAccount(platformContextOf(id), 'eins@example.org', NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('EMAIL_TAKEN');
  });

  it('sperrt ein Konto und beendet dabei alle seine Sitzungen', async () => {
    const actor = await seedAdmin('eins@example.org');
    const target = await seedAdmin('zwei@example.org');

    // Über die Anwendungsschicht, nicht über den Client dieser Datei — siehe
    // die Anmerkung im Kopf.
    await createAdminSession(target, CONTEXT, NOW);
    expect(await prisma.adminSession.count({ where: { adminUserId: target } })).toBe(1);

    const result = await setPlatformAccountDisabled(platformContextOf(actor), target, true, NOW);
    expect(result.ok).toBe(true);

    expect(await prisma.adminSession.count({ where: { adminUserId: target } })).toBe(0);
    const stored = await prisma.adminUser.findUnique({ where: { id: target } });
    expect(stored?.disabledAt).not.toBeNull();
  });

  it('lässt ein gesperrtes Konto nicht mehr am Passwort vorbei', async () => {
    const actor = await seedAdmin('eins@example.org');
    const target = await seedAdmin('zwei@example.org');

    await setPlatformAccountDisabled(platformContextOf(actor), target, true, NOW);

    const login = await adminLogin({ email: 'zwei@example.org', password: PASSWORD }, CONTEXT, NOW);
    expect(login.ok).toBe(false);
  });

  it('gibt ein gesperrtes Konto wieder frei', async () => {
    const actor = await seedAdmin('eins@example.org');
    const target = await seedAdmin('zwei@example.org');

    await setPlatformAccountDisabled(platformContextOf(actor), target, true, NOW);
    const result = await setPlatformAccountDisabled(platformContextOf(actor), target, false, NOW);

    expect(result.ok).toBe(true);
    const stored = await prisma.adminUser.findUnique({ where: { id: target } });
    expect(stored?.disabledAt).toBeNull();
  });

  it('stellt einem Konto neue Zugangsdaten aus, ohne ein Passwort zu vergeben', async () => {
    const actor = await seedAdmin('eins@example.org');
    const target = await seedAdmin('zwei@example.org');
    const before = await prisma.adminUser.findUnique({ where: { id: target } });

    const result = await resetPlatformAccount(platformContextOf(actor), target, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = await prisma.adminUser.findUnique({ where: { id: target } });

    // Sofort gesperrt, Zugangsdaten unverändert: Neue entstehen erst beim
    // Einlösen, im Browser des Betroffenen.
    expect(after?.disabledAt).not.toBeNull();
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(after?.totpSecret).toBe(before?.totpSecret);

    const invitation = await prisma.adminInvitation.findFirst({
      where: { email: 'zwei@example.org' },
    });
    expect(invitation?.kind).toBe('RESET');
    expect(invitation?.tokenHash).toBe(hashToken(result.value.token));
  });

  it('ändert niemand das eigene Konto', async () => {
    // Nicht weil es unmöglich wäre, sondern weil es keinen Vorgang gibt, den das
    // abbildet — dieselbe Regel wie bei den Mitgliedern.
    const id = await seedAdmin('eins@example.org');
    await seedAdmin('zwei@example.org');

    const disabled = await setPlatformAccountDisabled(platformContextOf(id), id, true, NOW);
    expect(disabled.ok).toBe(false);
    if (!disabled.ok) expect(disabled.error.kind).toBe('SELF');

    const reset = await resetPlatformAccount(platformContextOf(id), id, NOW);
    expect(reset.ok).toBe(false);
    if (!reset.ok) expect(reset.error.kind).toBe('SELF');
  });

  it('weist eine unbekannte Kennung ab', async () => {
    const id = await seedAdmin('eins@example.org');

    const result = await setPlatformAccountDisabled(
      platformContextOf(id),
      'admin_gibtesnicht',
      true,
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NOT_FOUND');
  });
});

/**
 * Die Aussperrsicherung der Verwaltung (FA-ADM-13).
 *
 * **Warum sie kein Trigger ist**, anders als ihr Gegenstück bei den Mandanten:
 * Sie ist keine Regel der Tabelle, sondern eine des Sperrvorgangs. Der erste
 * Anlauf war ein Trigger und hat vier bestehende Tests umgeworfen — `resetAdmin`
 * sperrt absichtlich und stellt im selben Zug einen Einrichtungslink aus, führt
 * in einer Anlage mit einem Betreiber also durch einen Zustand ohne aktives
 * Konto. Der Trigger hätte damit den Weg gesperrt, der seit M8 bei verlorenem
 * Authenticator hilft.
 *
 * Die letzten beiden Prüfungen halten diesen Unterschied fest. Ohne sie käme der
 * Trigger beim nächsten Umbau zurück.
 */
describe('FA-ADM-13 Die Aussperrsicherung der Verwaltung', () => {
  it('weist das Sperren des letzten aktiven Kontos ab', async () => {
    const actor = await seedAdmin('eins@example.org');
    const target = await seedAdmin('zwei@example.org');

    // Erst das eine sperren — erlaubt, es bleibt eines übrig.
    expect((await setPlatformAccountDisabled(platformContextOf(actor), target, true, NOW)).ok).toBe(
      true,
    );

    // Nun ist `actor` das letzte aktive. Ein zweiter Betreiber versucht es.
    const second = await seedAdmin('drei@example.org');
    expect((await setPlatformAccountDisabled(platformContextOf(actor), second, true, NOW)).ok).toBe(
      true,
    );

    const result = await setPlatformAccountDisabled(platformContextOf(target), actor, true, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('LAST_ADMINISTRATOR');

    // Und das Konto ist unverändert aktiv — die Transaktion ist ganz zurückgerollt.
    const stored = await prisma.adminUser.findUnique({ where: { id: actor } });
    expect(stored?.disabledAt).toBeNull();
    expect(await prisma.adminUser.count({ where: { disabledAt: null } })).toBe(1);
  });

  it('lässt das Zurücksetzen des letzten aktiven Kontos zu', async () => {
    /*
     * Der Unterschied zum Sperren, und der Grund gegen einen Trigger: Das
     * Zurücksetzen stellt den Rückweg im selben Zug aus. Ein Zustand ohne aktives
     * Betreiberkonto ist hier gewollt — er endet, sobald jemand den Link einlöst.
     */
    const actor = await seedAdmin('eins@example.org');
    const target = await seedAdmin('zwei@example.org');
    await setPlatformAccountDisabled(platformContextOf(actor), target, true, NOW);

    const result = await resetPlatformAccount(platformContextOf(target), actor, NOW);

    expect(result.ok).toBe(true);
    const stored = await prisma.adminUser.findUnique({ where: { id: actor } });
    expect(stored?.disabledAt).not.toBeNull();

    // Und der Rückweg steht: ein offener Nachweis für dieses Konto.
    const invitation = await prisma.adminInvitation.findFirst({
      where: { email: 'eins@example.org', acceptedAt: null, revokedAt: null },
    });
    expect(invitation?.kind).toBe('RESET');
  });

  it('bleibt ein Konto mit Serverzugriff immer erreichbar', async () => {
    /*
     * Die Zusage, die den Trigger unnötig macht: `npm run admin:create` lässt
     * sich mit einer **neuen** Adresse aufrufen, gleich wie viele Konten gesperrt
     * sind. Auf der Betreiberseite gibt es deshalb keine Sackgasse — anders als
     * bei den Mandanten, die keinen Server haben.
     */
    const actor = await seedAdmin('eins@example.org');
    const target = await seedAdmin('zwei@example.org');
    await setPlatformAccountDisabled(platformContextOf(actor), target, true, NOW);
    await resetPlatformAccount(platformContextOf(target), actor, NOW);

    expect(await prisma.adminUser.count({ where: { disabledAt: null } })).toBe(0);

    const rescue = await invitePlatformAccount(platformContextOf(actor), 'rettung@example.org', NOW);
    expect(rescue.ok).toBe(true);
  });

  it('behindert das Zurücksetzen des Fehlversuchszählers nicht', async () => {
    /*
     * Die Prüfung, die in M8 die Mandantenfassung gerettet hat.
     *
     * `AFTER UPDATE` ohne Spaltenliste feuerte dort bei **jeder** Änderung — auch
     * bei dieser, die nach jeder erfolgreichen Anmeldung läuft. Die Anmeldung
     * brach ab, und der Grund war an keiner Stelle sichtbar, an der jemand
     * gesucht hätte.
     */
    const id = await seedAdmin('eins@example.org');

    await prisma.adminUser.update({ where: { id }, data: { failedLogins: 3 } });
    await prisma.adminUser.update({
      where: { id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: NOW },
    });

    const stored = await prisma.adminUser.findUnique({ where: { id } });
    expect(stored?.failedLogins).toBe(0);
  });

  it('lässt ein bereits gesperrtes Konto weiter ändern', async () => {
    /*
     * Die Prüfung zählt die **anderen** aktiven Konten, nicht alle. Eine Zeile,
     * die schon gesperrt ist, nimmt niemandem einen Zugang — sie muss sich weiter
     * ändern lassen, sonst wäre eine gesperrte Zeile für immer eingefroren.
     */
    const actor = await seedAdmin('eins@example.org');
    const target = await seedAdmin('zwei@example.org');
    await setPlatformAccountDisabled(platformContextOf(actor), target, true, NOW);

    // Dieselbe Zeile ein zweites Mal sperren: Sie ist schon gesperrt, die
    // Änderung stellt den verbotenen Zustand also nicht her.
    const again = await setPlatformAccountDisabled(
      platformContextOf(actor),
      target,
      true,
      new Date(NOW.getTime() + 1_000),
    );

    expect(again.ok).toBe(true);
    const stored = await prisma.adminUser.findUnique({ where: { id: target } });
    expect(stored?.disabledAt).not.toBeNull();
  });
});

/**
 * Das Protokoll der Verwaltung (M10, B2, FA-ADM-14).
 *
 * Der zweite Test ist der, auf den es ankommt: Ein Unternehmen erzeugt einen
 * Geschäftsvorfall, und das Protokoll der Verwaltung darf ihn **nicht** zeigen.
 * Er prüft die Zusage aus FA-ADM-02 an der Stelle, an der sie am ehesten
 * aufweicht — eine Ansicht, die „nur mal eben" das Protokoll liest.
 */
describe('FA-ADM-14 Protokoll der Verwaltung', () => {
  it('führt Vorgänge an Betreiberkonten, die kein Unternehmen betreffen', async () => {
    const actor = await seedAdmin('eins@example.org');
    const target = await seedAdmin('zwei@example.org');
    const platform = platformContextOf(actor);

    await invitePlatformAccount(platform, 'neu@example.org', NOW);
    await setPlatformAccountDisabled(platform, target, true, NOW);

    const trail = await getPlatformAuditTrail(platform);

    expect(trail.map((entry) => entry.action)).toEqual(['ADMIN_DISABLED', 'ADMIN_INVITED']);
    expect(trail.every((entry) => entry.organizationId === null)).toBe(true);
    expect(trail.every((entry) => entry.actorEmail === 'eins@example.org')).toBe(true);
  });

  it('zeigt keinen Geschäftsvorfall eines Unternehmens', async () => {
    const actor = await seedAdmin('eins@example.org');
    const platform = platformContextOf(actor);

    // Ein gewöhnlicher Vorgang im Protokoll **des Unternehmens** — so, wie ihn
    // die Fachlogik schreibt.
    await recordAuditEntry(organizationContextOf(DEFAULT_ORGANIZATION_ID), {
      entityType: 'Invoice',
      entityId: 'RE-2026-0001',
      action: 'ISSUED',
      actorId: TEST_ACTOR_ID,
    });

    const trail = await getPlatformAuditTrail(platform);

    expect(trail).toEqual([]);
    // Und der Eintrag ist da, nur eben nicht hier — sonst prüfte der Test nichts.
    expect(await prisma.auditLog.count({ where: { action: 'ISSUED' } })).toBe(1);
  });

  it('steht ein Eingriff im Protokoll beider Seiten', async () => {
    /*
     * Doppelt aufgezeichnet, und beide Aufzeichnungen haben eine eigene
     * Leserschaft: Das Unternehmen sieht, dass etwas von außen kam (FA-ADM-07),
     * der Betreiber sieht, was er getan hat (FA-ADM-14).
     */
    const actor = await seedAdmin('eins@example.org');
    const platform = platformContextOf(actor);

    const result = await setOrganizationSuspended(
      platform,
      DEFAULT_ORGANIZATION_ID,
      true,
      actor,
      null,
    );
    expect(result.ok).toBe(true);

    const trail = await getPlatformAuditTrail(platform);
    expect(trail.map((entry) => entry.action)).toEqual(['SUSPENDED']);
    expect(trail[0]?.organizationId).toBe(DEFAULT_ORGANIZATION_ID);

    const tenantSide = await prisma.auditLog.findMany({ where: { action: 'SUSPENDED' } });
    expect(tenantSide).toHaveLength(1);
    expect(tenantSide[0]?.actorKind).toBe('ADMIN');
  });

  it('lässt sich ein Eintrag nicht ändern und nicht löschen', async () => {
    // Dieselbe Zusage wie beim Protokoll der Mandanten (NFA-COMP-02), von
    // denselben zwei Triggern getragen.
    const actor = await seedAdmin('eins@example.org');
    await invitePlatformAccount(platformContextOf(actor), 'neu@example.org', NOW);

    const entry = await prisma.platformAuditEntry.findFirst();
    expect(entry).not.toBeNull();
    if (entry === null) return;

    await expect(
      prisma.platformAuditEntry.update({ where: { id: entry.id }, data: { action: 'ANDERS' } }),
    ).rejects.toThrow();

    await expect(
      prisma.platformAuditEntry.delete({ where: { id: entry.id } }),
    ).rejects.toThrow();
  });
});
