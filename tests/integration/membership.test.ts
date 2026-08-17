/**
 * Mitglieder, Rollen, Einladungen, Passwortzurücksetzung (M8, B4).
 *
 * Was hier geprüft wird, sind die Zusagen, die **still** brechen können:
 *
 * - Eine Einladung ist **einmal** einlösbar. Wäre sie es zweimal, entstünde beim
 *   zweiten Mal ein Fehler an der Adresseindeutigkeit — irgendwann, irgendwo,
 *   nicht als Ablehnung.
 * - Unbekannt, abgelaufen, zurückgezogen und angenommen antworten **gleich**
 *   (FA-MEMB-05). Jede Abweichung wäre eine Auskunft darüber, wer eingeladen
 *   wurde.
 * - Das Passwort setzt der Eingeladene, und **kein anderes Konto kennt es je**
 *   (FA-MEMB-03). Das lässt sich negativ prüfen: Die Einladung trägt kein Feld
 *   dafür, und nach dem Annehmen stimmt der Hash mit dem selbst gewählten
 *   Passwort.
 * - Eine Zurücksetzung beendet **alle** Sitzungen. Sonst hätte der Wechsel
 *   nichts bewirkt — und genau das fällt niemandem auf.
 * - Der Rollenumbau läuft in der Reihenfolge „erst gewähren, dann entziehen".
 *   Andernfalls bricht die Aussperrsicherung mitten in einer Transaktion ab, die
 *   am Ende in Ordnung gewesen wäre.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { fullyAuthorized } from '@/application/auth/authorize';
import { login } from '@/application/auth/login';
import { resolveSession } from '@/application/auth/session-service';
import { inviteMember, withdrawInvitation } from '@/application/members/invitation-service';
import {
  changeMemberRole,
  getMembers,
  setMemberDisabled,
  startPasswordReset,
} from '@/application/members/member-service';
import {
  acceptInvitation,
  completePasswordReset,
  loadInvitation,
  loadPasswordReset,
} from '@/application/members/redeem';
import { addRole, getRoles, removeRole, saveRole } from '@/application/roles/role-service';
import { INVITATION_TTL_MS } from '@/domain/auth/invitation-policy';
import { PASSWORD_RESET_TTL_MS } from '@/domain/auth/password-reset-policy';
import { ALL_PERMISSION_KEYS, type PermissionKey } from '@/domain/policy/can';
import { verifyPassword } from '@/infrastructure/auth/password-hasher';
import { DEFAULT_ORGANIZATION_ID } from '@/infrastructure/repositories/organization-context';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';
import { testOrganization } from './setup/organization';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const OWNER_ROLE_ID = `role_owner_${DEFAULT_ORGANIZATION_ID}`;
const OWNER = 'inhaber@example.org';
const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';
const NEW_PASSWORD = 'Quittenbrot-am-Sonntagmorgen-3';
const CONTEXT = { ipAddress: '203.0.113.20', userAgent: 'pruefung' };
const NOW = new Date();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Ein Konto mit der Rolle „Inhaber", die die Migration je Organisation anlegt. */
async function seedOwner(email = OWNER): Promise<string> {
  const { hashPassword } = await import('@/infrastructure/auth/password-hasher');
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      organizationId: DEFAULT_ORGANIZATION_ID,
      roleId: OWNER_ROLE_ID,
    },
  });
  return user.id;
}

/** Eine Rolle mit genau diesen Rechten. */
async function seedRole(name: string, permissions: readonly PermissionKey[]): Promise<string> {
  const role = await prisma.role.create({
    data: { organizationId: DEFAULT_ORGANIZATION_ID, name },
  });
  await prisma.rolePermission.createMany({
    data: permissions.map((permissionKey) => ({
      organizationId: DEFAULT_ORGANIZATION_ID,
      roleId: role.id,
      permissionKey,
    })),
  });
  return role.id;
}

describe('FA-MEMB-01..03 Ein Konto entsteht nur per Einladung', () => {
  it('legt die Einladung nur den Hash ab und liefert den Token einmal', async () => {
    const actorId = await seedOwner();
    const roleId = await seedRole('Buchhaltung', ['invoice.read']);

    const result = await inviteMember(
      testOrganization,
      { email: 'Neu@Example.ORG', roleId },
      actorId,
      null,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = await prisma.invitation.findFirstOrThrow();

    // Die Adresse ist kleingeschrieben abgelegt — sonst gäbe es zwei Konten für
    // dieselbe Adresse in unterschiedlicher Schreibweise.
    expect(stored.email).toBe('neu@example.org');
    // Der Token selbst steht nirgends in der Datenbank.
    expect(JSON.stringify(stored)).not.toContain(result.value.token);
    expect(stored.tokenHash).toHaveLength(64);
    // Und es gibt kein Feld für ein Passwort (FA-MEMB-03).
    expect(Object.keys(stored)).not.toContain('passwordHash');
  });

  it('richtet das Konto mit selbst gesetztem Passwort ein', async () => {
    const actorId = await seedOwner();
    const roleId = await seedRole('Buchhaltung', ['invoice.read', 'invoice.create']);

    const invited = await inviteMember(
      testOrganization,
      { email: 'neu@example.org', roleId },
      actorId,
      null,
      NOW,
    );
    if (!invited.ok) throw new Error('keine Einladung');

    const offer = await loadInvitation(invited.value.token, NOW);
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    expect(offer.value.roleName).toBe('Buchhaltung');
    // Ohne erfasste Firmendaten trägt die Einladung den Namen der Organisation.
    expect(offer.value.organizationName).toBe('Meine Organisation');

    const accepted = await acceptInvitation(
      invited.value.token,
      { name: 'Bea Buchhalter', password: NEW_PASSWORD },
      null,
      NOW,
    );
    expect(accepted.ok).toBe(true);

    const created = await prisma.user.findUniqueOrThrow({ where: { email: 'neu@example.org' } });
    expect(created.name).toBe('Bea Buchhalter');
    expect(created.roleId).toBe(roleId);
    // Genau das Passwort, das der Eingeladene gewählt hat — und nur er kennt es.
    expect(await verifyPassword(created.passwordHash, NEW_PASSWORD)).toBe(true);

    // Die Rechte der Rolle wirken bei der ersten Anmeldung.
    const signedIn = await login({ email: 'neu@example.org', password: NEW_PASSWORD }, CONTEXT, NOW);
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok || signedIn.value.kind !== 'SESSION') return;

    const session = await resolveSession(signedIn.value.session.token, NOW);
    expect(session?.actor.permissions.has('invoice.create')).toBe(true);
    expect(session?.actor.permissions.has('invoice.issue')).toBe(false);
  });

  it('weist ein zu kurzes und ein geleaktes Passwort ab', async () => {
    const actorId = await seedOwner();
    const roleId = await seedRole('Buchhaltung', ['invoice.read']);
    const invited = await inviteMember(
      testOrganization,
      { email: 'neu@example.org', roleId },
      actorId,
      null,
      NOW,
    );
    if (!invited.ok) throw new Error('keine Einladung');

    const tooShort = await acceptInvitation(invited.value.token, { name: '', password: 'kurz' }, null, NOW);
    expect(tooShort.ok).toBe(false);
    if (tooShort.ok) return;
    expect(tooShort.error.kind).toBe('PASSWORD');

    const leaked = await acceptInvitation(
      invited.value.token,
      { name: '', password: 'passwordpassword' },
      null,
      NOW,
    );
    expect(leaked.ok).toBe(false);

    // Nach zwei Fehlversuchen ist die Einladung **nicht** verbraucht.
    expect((await prisma.invitation.findFirstOrThrow()).acceptedAt).toBeNull();
  });

  it('weist eine Adresse ab, die schon zu einem Konto gehört', async () => {
    const actorId = await seedOwner();
    const roleId = await seedRole('Buchhaltung', ['invoice.read']);

    const result = await inviteMember(testOrganization, { email: OWNER, roleId }, actorId, null, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('EMAIL_TAKEN');
  });
});

describe('FA-MEMB-05 Alle Ablehnungen sehen gleich aus', () => {
  async function invitationFor(email = 'neu@example.org'): Promise<string> {
    const actorId = await seedOwner();
    const roleId = await seedRole('Buchhaltung', ['invoice.read']);
    const invited = await inviteMember(testOrganization, { email, roleId }, actorId, null, NOW);
    if (!invited.ok) throw new Error('keine Einladung');
    return invited.value.token;
  }

  it('antwortet auf einen unbekannten Token wie auf einen abgelaufenen', async () => {
    const token = await invitationFor();
    const tooLate = new Date(NOW.getTime() + INVITATION_TTL_MS + 1_000);

    const unknown = await loadInvitation('voelligErfunden', NOW);
    const expired = await loadInvitation(token, tooLate);

    expect(unknown.ok).toBe(false);
    expect(expired.ok).toBe(false);
    if (unknown.ok || expired.ok) return;
    expect(unknown.error).toEqual(expired.error);
  });

  it('antwortet auf eine zurückgezogene Einladung ebenso', async () => {
    const token = await invitationFor();
    const invitation = await prisma.invitation.findFirstOrThrow();
    const actorId = (await prisma.user.findUniqueOrThrow({ where: { email: OWNER } })).id;

    const withdrawn = await withdrawInvitation(testOrganization, invitation.id, actorId, null, NOW);
    expect(withdrawn.ok).toBe(true);

    const result = await loadInvitation(token, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('INVALID');
  });

  it('lässt sich eine Einladung nur einmal einlösen', async () => {
    const token = await invitationFor();

    const first = await acceptInvitation(token, { name: 'A', password: NEW_PASSWORD }, null, NOW);
    expect(first.ok).toBe(true);

    const second = await acceptInvitation(token, { name: 'B', password: NEW_PASSWORD }, null, NOW);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    // Und zwar mit derselben Antwort wie ein unbekannter Token — nicht mit
    // einem Fehler an der Adresseindeutigkeit.
    expect(second.error.kind).toBe('INVALID');
    expect(await prisma.user.count({ where: { email: 'neu@example.org' } })).toBe(1);
  });

  it('lässt sich eine abgelaufene Einladung nicht einlösen', async () => {
    const token = await invitationFor();
    const tooLate = new Date(NOW.getTime() + INVITATION_TTL_MS + 1_000);

    const result = await acceptInvitation(token, { name: '', password: NEW_PASSWORD }, null, tooLate);

    expect(result.ok).toBe(false);
    expect(await prisma.user.count({ where: { email: 'neu@example.org' } })).toBe(0);
  });
});

describe('FA-MEMB-07 Eine offene Einladung je Adresse', () => {
  it('entwertet eine erneute Einladung den alten Link', async () => {
    const actorId = await seedOwner();
    const roleId = await seedRole('Buchhaltung', ['invoice.read']);

    const first = await inviteMember(
      testOrganization,
      { email: 'neu@example.org', roleId },
      actorId,
      null,
      NOW,
    );
    const second = await inviteMember(
      testOrganization,
      { email: 'neu@example.org', roleId },
      actorId,
      null,
      NOW,
    );

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // Der alte Link ist zurückgezogen, der neue gilt.
    expect((await loadInvitation(first.value.token, NOW)).ok).toBe(false);
    expect((await loadInvitation(second.value.token, NOW)).ok).toBe(true);

    // Genau eine offene Einladung — der partielle Index hält das fest.
    expect(
      await prisma.invitation.count({
        where: { email: 'neu@example.org', acceptedAt: null, revokedAt: null },
      }),
    ).toBe(1);
  });

  /**
   * Die Mandantengrenze der Einladung.
   *
   * Über die Anwendung findet eine fremde Rollenkennung nichts, weil `findRole`
   * mit dem Kontext sucht. Der Trigger ist die Ebene darunter: Er greift auch
   * dann, wenn jemand an der Anwendung vorbei schreibt.
   */
  it('weist die Datenbank eine Einladung mit fremder Rolle ab', async () => {
    await seedOwner();
    await prisma.organization.create({ data: { id: 'org_zweite', name: 'Zweite GmbH' } });
    const foreign = await prisma.role.create({
      data: { organizationId: 'org_zweite', name: 'Fremd' },
    });

    await expect(
      prisma.invitation.create({
        data: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          email: 'fremd@example.org',
          roleId: foreign.id,
          tokenHash: 'a'.repeat(64),
          expiresAt: new Date(NOW.getTime() + INVITATION_TTL_MS),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('FA-MEMB-04 Passwortzurücksetzung', () => {
  async function memberWithSession(): Promise<{
    readonly actorId: string;
    readonly memberId: string;
    readonly token: string;
  }> {
    const actorId = await seedOwner();
    const roleId = await seedRole('Buchhaltung', ['invoice.read']);
    const invited = await inviteMember(
      testOrganization,
      { email: 'neu@example.org', roleId },
      actorId,
      null,
      NOW,
    );
    if (!invited.ok) throw new Error('keine Einladung');
    await acceptInvitation(invited.value.token, { name: 'Bea', password: NEW_PASSWORD }, null, NOW);

    const member = await prisma.user.findUniqueOrThrow({ where: { email: 'neu@example.org' } });
    const signedIn = await login({ email: 'neu@example.org', password: NEW_PASSWORD }, CONTEXT, NOW);
    if (!signedIn.ok || signedIn.value.kind !== 'SESSION') throw new Error('keine Sitzung');

    return { actorId, memberId: member.id, token: signedIn.value.session.token };
  }

  it('setzt kein Passwort, sondern berechtigt dazu', async () => {
    const { actorId, memberId } = await memberWithSession();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });

    const result = await startPasswordReset(testOrganization, memberId, actorId, null, NOW);
    expect(result.ok).toBe(true);

    // Das Passwort ist unverändert: Die Rechteverwaltung vergibt keines.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    expect(after.passwordHash).toBe(before.passwordHash);

    const stored = await prisma.passwordReset.findFirstOrThrow();
    if (!result.ok) return;
    expect(JSON.stringify(stored)).not.toContain(result.value.token);
  });

  it('beendet das Einlösen alle Sitzungen des Kontos', async () => {
    const { actorId, memberId, token: sessionToken } = await memberWithSession();
    expect(await resolveSession(sessionToken, NOW)).not.toBeNull();

    const reset = await startPasswordReset(testOrganization, memberId, actorId, null, NOW);
    if (!reset.ok) throw new Error('kein Nachweis');

    const done = await completePasswordReset(reset.value.token, PASSWORD, null, NOW);
    expect(done.ok).toBe(true);

    // Der eigentliche Punkt: Wer sein Passwort wechselt, weil jemand es kannte,
    // hätte nichts erreicht, wenn eine Sitzung offen bliebe.
    expect(await resolveSession(sessionToken, NOW)).toBeNull();
    expect(await prisma.session.count({ where: { userId: memberId } })).toBe(0);

    // Das neue Passwort gilt, das alte nicht mehr.
    expect((await login({ email: 'neu@example.org', password: PASSWORD }, CONTEXT, NOW)).ok).toBe(
      true,
    );
  });

  it('lässt sich ein Nachweis nur einmal einlösen', async () => {
    const { actorId, memberId } = await memberWithSession();
    const reset = await startPasswordReset(testOrganization, memberId, actorId, null, NOW);
    if (!reset.ok) throw new Error('kein Nachweis');

    expect((await completePasswordReset(reset.value.token, PASSWORD, null, NOW)).ok).toBe(true);

    const again = await completePasswordReset(reset.value.token, NEW_PASSWORD, null, NOW);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.kind).toBe('INVALID');
  });

  it('läuft ein Nachweis nach 24 Stunden ab', async () => {
    const { actorId, memberId } = await memberWithSession();
    const reset = await startPasswordReset(testOrganization, memberId, actorId, null, NOW);
    if (!reset.ok) throw new Error('kein Nachweis');

    const tooLate = new Date(NOW.getTime() + PASSWORD_RESET_TTL_MS + 1_000);

    expect((await loadPasswordReset(reset.value.token, tooLate)).ok).toBe(false);
    expect((await completePasswordReset(reset.value.token, PASSWORD, null, tooLate)).ok).toBe(false);
  });

  it('verwirft ein neuer Nachweis den älteren', async () => {
    const { actorId, memberId } = await memberWithSession();

    const first = await startPasswordReset(testOrganization, memberId, actorId, null, NOW);
    const second = await startPasswordReset(testOrganization, memberId, actorId, null, NOW);
    if (!first.ok || !second.ok) throw new Error('kein Nachweis');

    expect((await loadPasswordReset(first.value.token, NOW)).ok).toBe(false);
    expect((await loadPasswordReset(second.value.token, NOW)).ok).toBe(true);
  });

  it('gilt kein Nachweis für ein gesperrtes Konto', async () => {
    const { actorId, memberId } = await memberWithSession();
    const reset = await startPasswordReset(testOrganization, memberId, actorId, null, NOW);
    if (!reset.ok) throw new Error('kein Nachweis');

    await setMemberDisabled(testOrganization, memberId, true, actorId, null, NOW);

    expect((await loadPasswordReset(reset.value.token, NOW)).ok).toBe(false);
  });
});

describe('FA-MEMB-06 Sperren statt löschen', () => {
  it('beendet das Sperren die Sitzungen und hält das Konto fest', async () => {
    const actorId = await seedOwner();
    const roleId = await seedRole('Buchhaltung', ['invoice.read']);
    const invited = await inviteMember(
      testOrganization,
      { email: 'neu@example.org', roleId },
      actorId,
      null,
      NOW,
    );
    if (!invited.ok) throw new Error('keine Einladung');
    await acceptInvitation(invited.value.token, { name: 'Bea', password: NEW_PASSWORD }, null, NOW);

    const member = await prisma.user.findUniqueOrThrow({ where: { email: 'neu@example.org' } });
    const signedIn = await login({ email: 'neu@example.org', password: NEW_PASSWORD }, CONTEXT, NOW);
    if (!signedIn.ok || signedIn.value.kind !== 'SESSION') throw new Error('keine Sitzung');

    const result = await setMemberDisabled(testOrganization, member.id, true, actorId, null, NOW);
    expect(result.ok).toBe(true);

    expect(await resolveSession(signedIn.value.session.token, NOW)).toBeNull();
    // Das Konto ist da — nur gesperrt. Der Beleg behält seinen Urheber.
    const stillThere = await prisma.user.findUnique({ where: { id: member.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.disabledAt).not.toBeNull();

    // Und es erscheint weiter in der Mitgliederliste.
    const members = await getMembers(testOrganization);
    expect(members.map((entry) => entry.email)).toContain('neu@example.org');
  });

  it('sperrt niemand sein eigenes Konto', async () => {
    const actorId = await seedOwner();

    const result = await setMemberDisabled(testOrganization, actorId, true, actorId, null, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('SELF');
  });
});

describe('FA-ROLE-04 Die Aussperrsicherung in der Anwendungsschicht', () => {
  /**
   * Die Anwendung erklärt, bevor die Datenbank abbricht.
   *
   * Beides ist nötig: Der Trigger ist die Zusage, aber ein abgebrochener
   * Schreibvorgang ist keine Erklärung. Geprüft wird deshalb, dass die
   * Anwendungsschicht einen benannten Fehler liefert — und nicht, dass irgendwo
   * eine Ausnahme fliegt.
   */
  it('nimmt sie dem letzten Konto die Rechteverwaltung nicht weg', async () => {
    const actorId = await seedOwner();
    const other = await seedRole('Ohne Verwaltung', ['invoice.read']);

    const result = await changeMemberRole(testOrganization, actorId, other, actorId, null);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('LAST_ADMINISTRATOR');
  });

  it('erlaubt den Wechsel, sobald ein zweites Konto sie hält', async () => {
    const first = await seedOwner();
    await seedOwner('zweiter@example.org');
    const other = await seedRole('Ohne Verwaltung', ['invoice.read']);

    const result = await changeMemberRole(testOrganization, first, other, first, null);

    expect(result.ok).toBe(true);
  });

  it('entzieht sie der Rolle das Recht nicht, wenn sie die letzte ist', async () => {
    const actorId = await seedOwner();

    const result = await saveRole(
      testOrganization,
      OWNER_ROLE_ID,
      {
        name: 'Inhaber',
        description: null,
        permissionKeys: ALL_PERMISSION_KEYS.filter((key) => key !== 'organization.administer'),
      },
      actorId,
      null,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('LAST_ADMINISTRATOR');
  });
});

describe('FA-ROLE-01 Rollen anlegen, umbauen, löschen', () => {
  it('legt eine Rolle mit genau den gewählten Rechten an', async () => {
    const actorId = await seedOwner();

    const result = await addRole(
      testOrganization,
      {
        name: 'Vertrieb',
        description: 'Belege schreiben, nicht festschreiben',
        permissionKeys: ['invoice.read', 'invoice.create', 'customer.read'],
      },
      actorId,
      null,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.permissions.map((entry) => entry.permissionKey).sort()).toEqual([
      'customer.read',
      'invoice.create',
      'invoice.read',
    ]);
  });

  it('weist einen doppelten Namen ab', async () => {
    const actorId = await seedOwner();
    await addRole(testOrganization, { name: 'Vertrieb', description: null, permissionKeys: [] }, actorId, null);

    const again = await addRole(
      testOrganization,
      { name: 'Vertrieb', description: null, permissionKeys: [] },
      actorId,
      null,
    );

    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.kind).toBe('NAME_TAKEN');
  });

  /**
   * **Der Umbau, der die Reihenfolge beweist** (FA-ROLE-04, H8 der Planung).
   *
   * Die Rechteverwaltung wandert von der Rolle „Inhaber" auf eine zweite Rolle.
   * Würde `saveRole` zuerst entziehen, entstünde mitten in der Transaktion ein
   * Zustand ohne Rechteverwaltung — der Trigger sieht das Ende nicht und bricht
   * ab. Dieser Test fährt genau diesen Umbau und ist damit die Prüfung auf die
   * Reihenfolge, nicht auf ihr Ergebnis.
   */
  it('lässt die Rechteverwaltung von einer Rolle auf eine andere wandern', async () => {
    const actorId = await seedOwner();
    const second = await seedOwner('zweiter@example.org');
    const target = await seedRole('Verwaltung', ['invoice.read']);

    // Das zweite Konto trägt die neue Rolle — noch ohne Verwaltungsrecht.
    await changeMemberRole(testOrganization, second, target, actorId, null);

    // Erst gewähren: die neue Rolle bekommt das Recht.
    const granted = await saveRole(
      testOrganization,
      target,
      {
        name: 'Verwaltung',
        description: null,
        permissionKeys: ['invoice.read', 'organization.administer'],
      },
      actorId,
      null,
    );
    expect(granted.ok).toBe(true);

    // Dann entziehen: der Rolle „Inhaber" wird es genommen.
    const revoked = await saveRole(
      testOrganization,
      OWNER_ROLE_ID,
      {
        name: 'Inhaber',
        description: null,
        permissionKeys: ALL_PERMISSION_KEYS.filter((key) => key !== 'organization.administer'),
      },
      actorId,
      null,
    );

    expect(revoked.ok).toBe(true);

    const roles = await getRoles(testOrganization);
    const holders = roles.filter((role) =>
      role.permissions.some((entry) => entry.permissionKey === 'organization.administer'),
    );
    expect(holders.map((role) => role.name)).toEqual(['Verwaltung']);
  });

  it('löscht keine Rolle, die noch jemand trägt', async () => {
    const actorId = await seedOwner();

    const result = await removeRole(testOrganization, OWNER_ROLE_ID, actorId, null);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('IN_USE');
  });

  it('löscht eine Rolle, die niemand trägt', async () => {
    const actorId = await seedOwner();
    const unused = await seedRole('Unbenutzt', ['invoice.read']);

    const result = await removeRole(testOrganization, unused, actorId, null);

    expect(result.ok).toBe(true);
    expect(await prisma.role.count({ where: { id: unused } })).toBe(0);
    // Die Berechtigungen verschwinden mit ihr (`onDelete: Cascade`).
    expect(await prisma.rolePermission.count({ where: { roleId: unused } })).toBe(0);
  });

  /** Ein unbekannter Schlüssel landet nicht in der Datenbank (FA-ROLE-06). */
  it('speichert einen erfundenen Schlüssel nicht', async () => {
    const actorId = await seedOwner();
    const { readPermissionKeys } = await import('@/application/roles/role-service');

    const result = await addRole(
      testOrganization,
      {
        name: 'Erfunden',
        description: null,
        permissionKeys: readPermissionKeys(['invoice.read', 'invoice.destroy', 'alles']),
      },
      actorId,
      null,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.permissions.map((entry) => entry.permissionKey)).toEqual(['invoice.read']);
  });
});

describe('Das Protokoll hält die Vorgänge fest (NFA-COMP-01)', () => {
  it('nennt Einladung, Annahme, Rollenwechsel und Sperre', async () => {
    const actorId = await seedOwner();
    const roleId = await seedRole('Buchhaltung', ['invoice.read']);

    const invited = await inviteMember(
      testOrganization,
      { email: 'neu@example.org', roleId },
      actorId,
      null,
      NOW,
    );
    if (!invited.ok) throw new Error('keine Einladung');
    await acceptInvitation(invited.value.token, { name: 'Bea', password: NEW_PASSWORD }, null, NOW);

    const member = await prisma.user.findUniqueOrThrow({ where: { email: 'neu@example.org' } });
    await startPasswordReset(testOrganization, member.id, actorId, null, NOW);
    await setMemberDisabled(testOrganization, member.id, true, actorId, null, NOW);

    const actions = (
      await prisma.auditLog.findMany({ select: { action: true } })
    ).map((entry) => entry.action);

    expect(actions).toContain('INVITED');
    expect(actions).toContain('INVITATION_ACCEPTED');
    expect(actions).toContain('PASSWORD_RESET_REQUESTED');
    expect(actions).toContain('DISABLED');

    // Kein Token im Protokoll (NFA-BETR-10). Die Einzelheiten liegen als
    // `diffJson`; geprüft wird der ganze Eintrag, nicht nur ein Feld davon.
    const entries = await prisma.auditLog.findMany();
    expect(JSON.stringify(entries)).not.toContain(invited.value.token);
  });
});

/** Der Nachweis, dass `testOrganization` hier wirklich alles darf. */
it('arbeitet dieser Test mit einem Nachweis über alle Rechte', () => {
  expect(fullyAuthorized(testOrganization)).toBe(testOrganization);
});
