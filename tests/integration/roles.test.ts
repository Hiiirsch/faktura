/**
 * Rollen, Sperren und die Aussperrsicherung (M8, FA-ROLE-02, -04, -05,
 * FA-MEMB-06, FA-ORG-03).
 *
 * Der Rechenkern von `can()` ist in `tests/unit/domain/policy.test.ts` geprüft.
 * Hier geht es um das, was zwischen Datenbank und Sitzung liegt — und das sind
 * fast ausschließlich Zusagen, die still brechen können:
 *
 * - Eine geänderte Rolle wirkt **ohne** erneute Anmeldung. Würde die
 *   Berechtigungsmenge irgendwann zwischengespeichert, arbeitete ein entzogenes
 *   Recht noch stundenlang weiter, und kein Typ würde es melden.
 * - Ein gesperrtes Konto verliert seine Sitzung **sofort**, nicht mit ihrem
 *   Ablauf.
 * - Ein Unternehmen kann sich die Rechteverwaltung nicht selbst entziehen. Vier
 *   Wege führen dorthin, und jeder wird von der Datenbank abgewiesen — auch
 *   dann, wenn jemand an der Anwendung vorbei schreibt.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { login } from '@/application/auth/login';
import { resolveSession } from '@/application/auth/session-service';
import { ALL_PERMISSION_KEYS, BASE_PERMISSIONS } from '@/domain/policy/can';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { createUser } from '@/infrastructure/repositories/auth-repository';
import { DEFAULT_ORGANIZATION_ID } from '@/infrastructure/repositories/organization-context';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';
const CONTEXT = { ipAddress: '203.0.113.11', userAgent: 'pruefung' };
const NOW = new Date();
const OWNER_ROLE_ID = `role_owner_${DEFAULT_ORGANIZATION_ID}`;

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

/** Ein Konto mit einer frisch angelegten Rolle und genau diesen Rechten. */
async function seedMember(
  email: string,
  permissions: readonly string[],
  roleName = 'Buchhaltung',
): Promise<{ userId: string; roleId: string }> {
  const role = await prisma.role.create({
    data: { organizationId: DEFAULT_ORGANIZATION_ID, name: roleName },
  });

  await prisma.rolePermission.createMany({
    data: permissions.map((permissionKey) => ({
      organizationId: DEFAULT_ORGANIZATION_ID,
      roleId: role.id,
      permissionKey,
    })),
  });

  const user = await createUser({
    email,
    passwordHash: await hashPassword(PASSWORD),
    organizationId: DEFAULT_ORGANIZATION_ID,
    roleId: role.id,
  });

  return { userId: user.id, roleId: role.id };
}

/** Meldet an und gibt das Sitzungstoken zurück. */
async function sessionTokenFor(email: string): Promise<string> {
  const result = await login({ email, password: PASSWORD }, CONTEXT, NOW);
  expect(result.ok).toBe(true);
  if (!result.ok || result.value.kind !== 'SESSION') throw new Error('keine Sitzung');
  return result.value.session.token;
}

describe('FA-ROLE-02 Die Rolle trägt die Berechtigungen', () => {
  it('führt die Sitzung die Rechte der Rolle plus die Grundrechte', async () => {
    await seedMember('buchhaltung@example.org', ['invoice.read', 'invoice.create']);
    const token = await sessionTokenFor('buchhaltung@example.org');

    const session = await resolveSession(token, NOW);
    expect(session).not.toBeNull();

    const permissions = [...(session?.actor.permissions ?? [])].sort();
    expect(permissions).toEqual(
      [...new Set([...BASE_PERMISSIONS, 'invoice.read', 'invoice.create'])].sort(),
    );
    expect(session?.roleName).toBe('Buchhaltung');
  });

  it('trägt ein Konto ohne Rolle nur die Grundrechte', async () => {
    await createUser({
      email: 'ohnerolle@example.org',
      passwordHash: await hashPassword(PASSWORD),
      organizationId: DEFAULT_ORGANIZATION_ID,
    });

    const session = await resolveSession(await sessionTokenFor('ohnerolle@example.org'), NOW);

    expect([...(session?.actor.permissions ?? [])].sort()).toEqual([...BASE_PERMISSIONS].sort());
    expect(session?.roleName).toBeNull();
  });

  it('weist die Datenbank eine Rolle aus einem anderen Unternehmen ab', async () => {
    await prisma.organization.create({ data: { id: 'org_fremd', name: 'Fremd' } });
    const foreignRole = await prisma.role.create({
      data: { organizationId: 'org_fremd', name: 'Fremde Rolle' },
    });

    // Der Trigger `User_role_matches_organization_insert` greift auch dann,
    // wenn jemand an der Anwendung vorbei schreibt.
    await expect(
      prisma.user.create({
        data: {
          email: 'falsch@example.org',
          passwordHash: 'h',
          organizationId: DEFAULT_ORGANIZATION_ID,
          roleId: foreignRole.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('weist eine Berechtigung für eine fremde Rolle ab', async () => {
    await prisma.organization.create({ data: { id: 'org_fremd', name: 'Fremd' } });
    const role = await prisma.role.create({
      data: { organizationId: DEFAULT_ORGANIZATION_ID, name: 'Eigene' },
    });

    await expect(
      prisma.rolePermission.create({
        data: { organizationId: 'org_fremd', roleId: role.id, permissionKey: 'invoice.read' },
      }),
    ).rejects.toThrow();
  });
});

describe('FA-ROLE-05 Eine Rechteänderung wirkt ohne neue Anmeldung', () => {
  it('nimmt ein entzogenes Recht beim nächsten Aufruf weg', async () => {
    const { roleId } = await seedMember('buchhaltung@example.org', [
      'invoice.read',
      'invoice.issue',
    ]);
    const token = await sessionTokenFor('buchhaltung@example.org');

    expect((await resolveSession(token, NOW))?.actor.permissions.has('invoice.issue')).toBe(true);

    await prisma.rolePermission.deleteMany({ where: { roleId, permissionKey: 'invoice.issue' } });

    // Dieselbe Sitzung, dasselbe Token — die Rechte werden bei jeder Anfrage
    // frisch gelesen (NFA-SEC-25).
    expect((await resolveSession(token, NOW))?.actor.permissions.has('invoice.issue')).toBe(false);
    expect((await resolveSession(token, NOW))?.actor.permissions.has('invoice.read')).toBe(true);
  });

  it('gibt ein erteiltes Recht ebenso sofort frei', async () => {
    const { roleId } = await seedMember('buchhaltung@example.org', ['invoice.read']);
    const token = await sessionTokenFor('buchhaltung@example.org');

    await prisma.rolePermission.create({
      data: { organizationId: DEFAULT_ORGANIZATION_ID, roleId, permissionKey: 'invoice.cancel' },
    });

    expect((await resolveSession(token, NOW))?.actor.permissions.has('invoice.cancel')).toBe(true);
  });
});

describe('FA-MEMB-06 / FA-ORG-03 Sperren beendet die Sitzung sofort', () => {
  it('verliert ein gesperrtes Konto seine laufende Sitzung', async () => {
    const { userId } = await seedMember('buchhaltung@example.org', ['invoice.read']);
    const token = await sessionTokenFor('buchhaltung@example.org');
    expect(await resolveSession(token, NOW)).not.toBeNull();

    await prisma.user.update({ where: { id: userId }, data: { disabledAt: NOW } });

    // Nicht erst mit dem Ablauf: Wer gesperrt wird, ist beim nächsten Klick
    // draußen — und die Sitzung wird dabei entfernt.
    expect(await resolveSession(token, NOW)).toBeNull();
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  it('weist die Anmeldung eines gesperrten Kontos wie ein unbekanntes ab', async () => {
    const { userId } = await seedMember('buchhaltung@example.org', ['invoice.read']);
    await prisma.user.update({ where: { id: userId }, data: { disabledAt: NOW } });

    const result = await login(
      { email: 'buchhaltung@example.org', password: PASSWORD },
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Dieselbe Antwort wie bei unbekanntem Konto — keine Auskunft darüber, dass
    // es diese Adresse gibt.
    expect(result.error.kind).toBe('INVALID_CREDENTIALS');
  });

  it('beendet die Stilllegung eines Unternehmens alle Sitzungen', async () => {
    await seedMember('buchhaltung@example.org', ['invoice.read']);
    const token = await sessionTokenFor('buchhaltung@example.org');

    await prisma.organization.update({
      where: { id: DEFAULT_ORGANIZATION_ID },
      data: { suspendedAt: NOW },
    });

    expect(await resolveSession(token, NOW)).toBeNull();
  });

  it('weist die Anmeldung in ein stillgelegtes Unternehmen ab', async () => {
    await seedMember('buchhaltung@example.org', ['invoice.read']);
    await prisma.organization.update({
      where: { id: DEFAULT_ORGANIZATION_ID },
      data: { suspendedAt: NOW },
    });

    const result = await login(
      { email: 'buchhaltung@example.org', password: PASSWORD },
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);
  });
});

describe('FA-ROLE-04 Die Aussperrsicherung', () => {
  /** Ein Konto mit allen Rechten — die Rolle aus der Datenmigration. */
  async function seedOwner(email = 'inhaber@example.org'): Promise<string> {
    const user = await createUser({
      email,
      passwordHash: await hashPassword(PASSWORD),
      organizationId: DEFAULT_ORGANIZATION_ID,
      roleId: OWNER_ROLE_ID,
    });
    return user.id;
  }

  it('legt die Migration eine Rolle mit allen Berechtigungen an', async () => {
    const permissions = await prisma.rolePermission.findMany({
      where: { roleId: OWNER_ROLE_ID },
      select: { permissionKey: true },
    });

    // Die Migration trägt die Schlüssel wörtlich; hier wird geprüft, dass ihre
    // Momentaufnahme noch zum Katalog der Domäne passt.
    expect(permissions.map((entry) => entry.permissionKey).sort()).toEqual(
      [...ALL_PERMISSION_KEYS].sort(),
    );
  });

  it('lässt die letzte Rechteverwaltung nicht entziehen', async () => {
    const userId = await seedOwner();

    await expect(
      prisma.user.update({ where: { id: userId }, data: { roleId: null } }),
    ).rejects.toThrow();
  });

  it('lässt das letzte Konto mit Rechteverwaltung nicht sperren', async () => {
    const userId = await seedOwner();

    await expect(
      prisma.user.update({ where: { id: userId }, data: { disabledAt: NOW } }),
    ).rejects.toThrow();
  });

  it('lässt das Recht nicht aus der letzten Rolle entfernen', async () => {
    await seedOwner();

    await expect(
      prisma.rolePermission.deleteMany({
        where: { roleId: OWNER_ROLE_ID, permissionKey: 'organization.administer' },
      }),
    ).rejects.toThrow();
  });

  it('lässt die letzte Rolle nicht löschen', async () => {
    await seedOwner();

    // `onDelete: Restrict` greift hier zuerst — beides ist richtig, und beides
    // führt dazu, dass die Rolle bleibt.
    await expect(prisma.role.delete({ where: { id: OWNER_ROLE_ID } })).rejects.toThrow();
  });

  it('erlaubt das Sperren, sobald ein zweites Konto die Verwaltung hält', async () => {
    const first = await seedOwner('inhaber@example.org');
    await seedOwner('zweiter@example.org');

    // Mit zwei Trägern ist der Vorgang unbedenklich.
    await prisma.user.update({ where: { id: first }, data: { disabledAt: NOW } });

    const remaining = await prisma.user.count({
      where: { organizationId: DEFAULT_ORGANIZATION_ID, disabledAt: null, roleId: OWNER_ROLE_ID },
    });
    expect(remaining).toBe(1);
  });

  it('stört nicht bei Änderungen, die die Verwaltung nicht berühren', async () => {
    const userId = await seedOwner();

    // Der erste Entwurf des Triggers feuerte bei **jeder** Kontoänderung und
    // machte damit schon das Zurücksetzen des Fehlversuchszählers nach einer
    // erfolgreichen Anmeldung unmöglich.
    await prisma.user.update({
      where: { id: userId },
      data: { failedLogins: 0, lastLoginAt: NOW, name: 'Tim' },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.name).toBe('Tim');
  });
});
