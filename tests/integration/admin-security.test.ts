/**
 * Die eigene Sicherheit eines Betreiberkontos (M14.1 — FA-ADM-18, -19).
 *
 * Drei Zusagen, und jede kann **still** brechen:
 *
 * - Das bisherige Passwort wird verlangt. Ohne diese Prüfung genügte ein
 *   übernommener Bildschirm, um das Konto zu übernehmen — die Sitzung ist der
 *   einzige Nachweis, den ein Angreifer an dieser Stelle mitbringt.
 * - Alle **anderen** Sitzungen enden, die aufrufende nicht. Bliebe eine fremde
 *   bestehen, hätte der Wechsel nichts bewirkt; endete die eigene mit, bestrafte
 *   jeder Wechsel den, der ihn vornimmt.
 * - Eine Sitzung beendet nur, wem sie gehört. `deleteMany` mit `adminUserId`
 *   statt `delete` mit der Kennung allein: Sonst beendete eine untergeschobene
 *   fremde Kennung die Sitzung eines anderen Betreibers.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  changeAdminPassword,
  getAdminSecurityOverview,
  revokeAdminSession,
  revokeOtherAdminSessions,
} from '@/application/admin/admin-security';
import { createAdminSession, resolveAdminSession } from '@/application/admin/admin-session-service';
import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { generateTotpSecret } from '@/infrastructure/auth/totp';
import { hashPassword, verifyPassword } from '@/infrastructure/auth/password-hasher';
import { platformContextOf } from '@/infrastructure/repositories/platform-context';
import { createAdminUser } from '@/infrastructure/repositories/platform-repository';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';
const NEW_PASSWORD = 'Quittenbrot-am-Sonntagmorgen-3';
const CONTEXT = { ipAddress: '203.0.113.9', userAgent: 'pruefung' };
const NOW = new Date();

beforeEach(async () => {
  // Erst trennen, dann tauschen — siehe CLAUDE.md, „Ein Fallstrick der
  // Integrationstests".
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

/** Legt eine Sitzung an und gibt ihre Kennung zurück. */
async function seedSession(adminUserId: string, userAgent: string): Promise<string> {
  const issued = await createAdminSession(adminUserId, { ...CONTEXT, userAgent }, NOW);
  const session = await resolveAdminSession(issued.token);
  if (session === null) throw new Error('Sitzung ließ sich nicht auflösen');
  return session.sessionId;
}

describe('FA-ADM-18 Das eigene Passwort wechseln', () => {
  it('weist ein falsches bisheriges Passwort ab und ändert nichts', async () => {
    const id = await seedAdmin('betreiber@example.org');
    const sessionId = await seedSession(id, 'dieses Gerät');

    const result = await changeAdminPassword(
      platformContextOf(id),
      sessionId,
      { currentPassword: 'das-war-es-nicht-ganz', newPassword: NEW_PASSWORD },
      CONTEXT.ipAddress,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('WRONG_PASSWORD');

    // Das alte Passwort gilt weiterhin — die Prüfung ist keine Formalie.
    const account = await prisma.adminUser.findUniqueOrThrow({ where: { id } });
    expect(await verifyPassword(account.passwordHash, PASSWORD)).toBe(true);
  });

  it('weist ein zu kurzes neues Passwort ab', async () => {
    const id = await seedAdmin('betreiber@example.org');
    const sessionId = await seedSession(id, 'dieses Gerät');

    const result = await changeAdminPassword(
      platformContextOf(id),
      sessionId,
      { currentPassword: PASSWORD, newPassword: 'x'.repeat(MIN_PASSWORD_LENGTH - 1) },
      CONTEXT.ipAddress,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('PASSWORD');
    if (result.error.kind !== 'PASSWORD') return;
    expect(result.error.violations[0]?.kind).toBe('TOO_SHORT');
  });

  it('wechselt es, beendet die anderen Sitzungen und behält die eigene', async () => {
    const id = await seedAdmin('betreiber@example.org');
    const eigene = await seedSession(id, 'dieses Gerät');
    await seedSession(id, 'fremdes Notebook');
    await seedSession(id, 'altes Telefon');

    const result = await changeAdminPassword(
      platformContextOf(id),
      eigene,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      CONTEXT.ipAddress,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.endedSessions).toBe(2);

    const account = await prisma.adminUser.findUniqueOrThrow({ where: { id } });
    expect(await verifyPassword(account.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(account.passwordHash, PASSWORD)).toBe(false);

    const übrig = await prisma.adminSession.findMany({ where: { adminUserId: id } });
    expect(übrig.map((entry) => entry.id)).toEqual([eigene]);
  });

  it('schreibt den Wechsel ins Protokoll der Anlage — als Handlung, nicht als Eingriff', async () => {
    const id = await seedAdmin('betreiber@example.org');
    const sessionId = await seedSession(id, 'dieses Gerät');

    await changeAdminPassword(
      platformContextOf(id),
      sessionId,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      CONTEXT.ipAddress,
    );

    const eintrag = await prisma.platformAuditEntry.findFirstOrThrow({
      where: { action: 'ADMIN_PASSWORD_CHANGED' },
    });

    // Der Akteur ist das Konto selbst — das unterscheidet den Wechsel von
    // `ADMIN_RESET`, wo jemand anders am Werk war.
    expect(eintrag.actorId).toBe(id);
    expect(eintrag.entityId).toBe(id);
    // Das Passwort steht selbstverständlich nicht darin (NFA-BETR-10).
    expect(eintrag.detailsJson ?? '').not.toContain(NEW_PASSWORD);
  });
});

describe('FA-ADM-19 Angemeldete Geräte', () => {
  it('führt die eigenen Sitzungen und markiert die aufrufende', async () => {
    const id = await seedAdmin('betreiber@example.org');
    const eigene = await seedSession(id, 'dieses Gerät');
    await seedSession(id, 'fremdes Notebook');

    const overview = await getAdminSecurityOverview(platformContextOf(id), eigene);

    expect(overview.sessions).toHaveLength(2);
    expect(overview.sessions.filter((entry) => entry.isCurrent)).toHaveLength(1);
    expect(overview.sessions.find((entry) => entry.isCurrent)?.id).toBe(eigene);
    expect(overview.passkeys).toHaveLength(0);
  });

  it('zeigt die Sitzungen eines anderen Betreibers nicht', async () => {
    const eigen = await seedAdmin('eins@example.org');
    const fremd = await seedAdmin('zwei@example.org');
    const eigeneSitzung = await seedSession(eigen, 'dieses Gerät');
    await seedSession(fremd, 'Gerät des anderen');

    const overview = await getAdminSecurityOverview(platformContextOf(eigen), eigeneSitzung);

    expect(overview.sessions.map((entry) => entry.id)).toEqual([eigeneSitzung]);
  });

  it('beendet keine fremde Sitzung, auch wenn ihre Kennung bekannt ist', async () => {
    const eigen = await seedAdmin('eins@example.org');
    const fremd = await seedAdmin('zwei@example.org');
    await seedSession(eigen, 'dieses Gerät');
    const fremdeSitzung = await seedSession(fremd, 'Gerät des anderen');

    // Das ist der Angriff: eine untergeschobene Kennung aus einem fremden Konto.
    const beendet = await revokeAdminSession(platformContextOf(eigen), fremdeSitzung);

    expect(beendet).toBe(false);
    expect(await prisma.adminSession.count({ where: { id: fremdeSitzung } })).toBe(1);
  });

  it('beendet alle anderen eigenen Sitzungen und rührt fremde nicht an', async () => {
    const eigen = await seedAdmin('eins@example.org');
    const fremd = await seedAdmin('zwei@example.org');
    const eigene = await seedSession(eigen, 'dieses Gerät');
    await seedSession(eigen, 'altes Telefon');
    await seedSession(fremd, 'Gerät des anderen');

    const count = await revokeOtherAdminSessions(platformContextOf(eigen), eigene);

    expect(count).toBe(1);
    expect(await prisma.adminSession.count({ where: { adminUserId: eigen } })).toBe(1);
    expect(await prisma.adminSession.count({ where: { adminUserId: fremd } })).toBe(1);
  });
});
