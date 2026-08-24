/**
 * „Passwort vergessen" als Selbstbedienung (M14, B3 — FA-MEMB-08).
 *
 * **Bis M14 gab es diesen Anfang nicht.** Nachweis, Frist und Einlöseseite
 * existieren seit M8; ausstellen konnte ihn allein ein Konto mit
 * `organization.administer`. Wer sein Passwort vergaß, musste jemanden anrufen.
 *
 * Geprüft werden die drei Zusagen, die diesen Weg tragen:
 *
 * 1. **Die Antwort ist ununterscheidbar** — fünf Fälle, ein Ausgang. Geprüft
 *    wird das an der **Wirkung**: Wo kein Nachweis entstehen darf, entsteht
 *    keiner, und die Funktion verrät durch nichts, welcher Fall vorlag.
 * 2. **Die Bremse** greift, ohne dass es eine neue Tabelle bräuchte.
 * 3. **Der Vorgang steht im Protokoll** des Unternehmens — mit dem Konto selbst
 *    als Akteur, denn niemand sonst darf ihn auslösen.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { fullyAuthorized } from '@/application/auth/authorize';
import { inviteMember } from '@/application/members/invitation-service';
import { acceptInvitation, requestPasswordReset } from '@/application/members/redeem';
import { addRole } from '@/application/roles/role-service';
import { RESET_REQUEST_INTERVAL_MS } from '@/domain/auth/password-reset-policy';

import { DATA_DATABASE_URL, resetDatabase, TEST_ACTOR_ID } from './setup/database';
import { testOrganization } from './setup/organization';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const NOW = new Date('2026-03-01T09:00:00.000Z');
const EMAIL = 'vergesslich@example.org';

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.$disconnect();
  await resetDatabase();
});

/** Legt ein Konto an — über den echten Weg: einladen und einlösen. */
async function seedMember(): Promise<string> {
  const role = await addRole(
    testOrganization,
    { name: 'Buchhaltung', description: null, permissionKeys: ['invoice.read'] },
    TEST_ACTOR_ID,
    null,
  );
  if (!role.ok) throw new Error('keine Rolle');

  const invited = await inviteMember(
    testOrganization,
    { email: EMAIL, roleId: role.value.id },
    TEST_ACTOR_ID,
    null,
    NOW,
  );
  if (!invited.ok) throw new Error('keine Einladung');

  const accepted = await acceptInvitation(
    invited.value.token,
    { name: 'Vergesslich', password: 'ein-hinreichend-langes-passwort' },
    null,
    NOW,
  );
  if (!accepted.ok) throw new Error('nicht eingelöst');

  const user = await prisma.user.findFirstOrThrow({ where: { email: EMAIL } });
  return user.id;
}

describe('FA-MEMB-08 Die Antwort ist in allen Fällen dieselbe', () => {
  it('legt für ein bekanntes Konto einen Nachweis an', async () => {
    const userId = await seedMember();

    await requestPasswordReset(EMAIL, '::1', NOW);

    const nachweise = await prisma.passwordReset.findMany({ where: { userId } });
    expect(nachweise).toHaveLength(1);
    // Nur der Hash liegt in der Datenbank — der Token ging hinaus.
    expect(nachweise[0]?.tokenHash).toHaveLength(64);
  });

  it('tut bei einer unbekannten Adresse nichts — und sagt nichts', async () => {
    await seedMember();

    // Kein Rückgabewert, an dem sich der Fall ablesen ließe.
    await expect(requestPasswordReset('gibtsnicht@example.org', '::1', NOW)).resolves.toBeUndefined();
    expect(await prisma.passwordReset.count()).toBe(0);
  });

  it('tut bei einem gesperrten Konto nichts', async () => {
    const userId = await seedMember();
    await prisma.user.update({ where: { id: userId }, data: { disabledAt: NOW } });

    await requestPasswordReset(EMAIL, '::1', NOW);

    expect(await prisma.passwordReset.count()).toBe(0);
  });

  it('tut bei einem stillgelegten Unternehmen nichts', async () => {
    await seedMember();
    const context = fullyAuthorized(testOrganization);
    await prisma.organization.update({
      where: { id: context.organizationId },
      data: { suspendedAt: NOW },
    });

    await requestPasswordReset(EMAIL, '::1', NOW);

    expect(await prisma.passwordReset.count()).toBe(0);
  });

  it('nimmt die Adresse ohne Rücksicht auf Schreibweise und Leerraum', async () => {
    const userId = await seedMember();

    await requestPasswordReset('  Vergesslich@Example.ORG  ', '::1', NOW);

    expect(await prisma.passwordReset.count({ where: { userId } })).toBe(1);
  });
});

describe('FA-MEMB-08 Die Bremse', () => {
  it('stellt binnen fünf Minuten keinen zweiten Nachweis aus', async () => {
    /*
     * Ohne sie wäre das Formular ein Versandknopf für jeden, der eine fremde
     * Adresse kennt — die Nachrichten bekäme der Inhaber des Postfachs.
     */
    const userId = await seedMember();

    await requestPasswordReset(EMAIL, '::1', NOW);
    const ersterNachweis = await prisma.passwordReset.findFirstOrThrow({ where: { userId } });

    await requestPasswordReset(EMAIL, '::1', new Date(NOW.getTime() + 60_000));

    const nachweise = await prisma.passwordReset.findMany({ where: { userId } });
    expect(nachweise).toHaveLength(1);
    // Und es ist derselbe: Der erste Link gilt weiter.
    expect(nachweise[0]?.tokenHash).toBe(ersterNachweis.tokenHash);
  });

  it('lässt nach Ablauf des Abstands wieder einen zu — und entwertet den alten', async () => {
    const userId = await seedMember();

    await requestPasswordReset(EMAIL, '::1', NOW);
    const erster = await prisma.passwordReset.findFirstOrThrow({ where: { userId } });

    await requestPasswordReset(EMAIL, '::1', new Date(NOW.getTime() + RESET_REQUEST_INTERVAL_MS + 1));

    const nachweise = await prisma.passwordReset.findMany({ where: { userId } });
    expect(nachweise).toHaveLength(1);
    expect(nachweise[0]?.tokenHash).not.toBe(erster.tokenHash);
  });
});

describe('NFA-COMP-01 Der Vorgang steht im Protokoll', () => {
  it('nennt das Konto selbst als Akteur', async () => {
    const userId = await seedMember();

    await requestPasswordReset(EMAIL, '::1', NOW);

    const eintrag = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: userId, action: 'PASSWORD_RESET_REQUESTED' },
    });

    // Angefordert hat es das Konto — niemand sonst darf es können.
    expect(eintrag.actorId).toBe(userId);
    expect(eintrag.ipAddress).toBe('::1');
  });
});
