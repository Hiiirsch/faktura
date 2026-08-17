/**
 * Die Identität der zentralen Verwaltung (M8, FA-ADM-01, -02, -04, -08).
 *
 * Der Kern dieses Tests ist nicht die Anmeldung — die läuft nach demselben
 * Muster wie die der Mandanten und ist dort geprüft. Der Kern ist die
 * **Trennung**:
 *
 * - Ein Admintoken ist keine Mandantensitzung und umgekehrt. Geprüft wird das
 *   nicht durch Lesen des Codes, sondern indem jedes Token der jeweils anderen
 *   Auflösung vorgelegt wird.
 * - Eine Adminsitzung führt **kein** Feld `organization`. Das ist eine Aussage
 *   über den Typ; hier steht sie zusätzlich als Laufzeitprüfung, damit ein
 *   späterer Umbau sie nicht stillschweigend hinzufügt.
 * - Der zweite Faktor ist verpflichtend: Der erste Schritt endet **immer** mit
 *   einem Nachweis, nie mit einer Sitzung.
 */
import { PrismaClient } from '@prisma/client';
import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { adminLogin, completeAdminSecondFactor } from '@/application/admin/admin-login';
import { resolveAdminSession } from '@/application/admin/admin-session-service';
import { resolveSession } from '@/application/auth/session-service';
import { login } from '@/application/auth/login';
import { PENDING_LOGIN_TTL_MS } from '@/domain/auth/pending-login-policy';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { hashToken } from '@/infrastructure/auth/tokens';
import { generateTotpSecret } from '@/infrastructure/auth/totp';
import { getEnv } from '@/infrastructure/config/env';
import { createUser } from '@/infrastructure/repositories/auth-repository';
import {
  createAdminUser,
  updateAdminUser,
} from '@/infrastructure/repositories/platform-repository';
import { DEFAULT_ORGANIZATION_ID } from '@/infrastructure/repositories/organization-context';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';
const CONTEXT = { ipAddress: '203.0.113.9', userAgent: 'pruefung' };
/** Die echte Uhr — ein Einmalkennwort ist an sie gebunden. */
const NOW = new Date();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedAdmin(email = 'betreiber@example.org'): Promise<{ id: string; secret: string }> {
  const secret = generateTotpSecret();
  const admin = await createAdminUser({
    email,
    passwordHash: await hashPassword(PASSWORD),
    totpSecret: secret,
    totpEnabled: true,
  });
  return { id: admin.id, secret };
}

function codeFor(secret: string, at: Date): string {
  return new TOTP({
    issuer: getEnv().APP_NAME,
    label: 'verify',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate({ timestamp: at.getTime() });
}

/** Der erste Schritt, mit dem Nachweis als Ergebnis. */
async function firstStep(): Promise<{ token: string; secret: string }> {
  const { secret } = await seedAdmin();
  const result = await adminLogin(
    { email: 'betreiber@example.org', password: PASSWORD },
    CONTEXT,
    NOW,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('kein Nachweis');
  return { token: result.value.token, secret };
}

describe('FA-ADM-08 Der zweite Faktor ist verpflichtend', () => {
  it('endet der erste Schritt immer mit einem Nachweis, nie mit einer Sitzung', async () => {
    await firstStep();

    expect(await prisma.adminSession.count()).toBe(0);
    expect(await prisma.pendingLogin.count()).toBe(1);
  });

  it('legt den Nachweis nur als Hash ab', async () => {
    const { token } = await firstStep();
    const stored = await prisma.pendingLogin.findFirstOrThrow();

    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.adminUserId).not.toBeNull();
    // Der Nachweis der Verwaltung gehört keinem Mandantenkonto.
    expect(stored.userId).toBeNull();
  });

  it('meldet mit richtigem Code an', async () => {
    const { token, secret } = await firstStep();

    const result = await completeAdminSecondFactor(token, codeFor(secret, NOW), CONTEXT, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await resolveAdminSession(result.value.token, NOW)).not.toBeNull();
    expect(await prisma.pendingLogin.count()).toBe(0);
  });

  it('zählt einen falschen Code als Fehlversuch', async () => {
    const { token } = await firstStep();

    const result = await completeAdminSecondFactor(token, '000000', CONTEXT, NOW);

    expect(result.ok).toBe(false);
    const admin = await prisma.adminUser.findFirstOrThrow();
    expect(admin.failedLogins).toBe(1);
  });

  it('läuft der Nachweis nach fünf Minuten ab', async () => {
    const { token, secret } = await firstStep();
    const tooLate = new Date(NOW.getTime() + PENDING_LOGIN_TTL_MS + 1_000);

    const result = await completeAdminSecondFactor(
      token,
      codeFor(secret, tooLate),
      CONTEXT,
      tooLate,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NO_PENDING_LOGIN');
  });
});

describe('FA-ADM-01 Die beiden Identitäten sind getrennt', () => {
  it('öffnet ein Admintoken keine Mandantensitzung', async () => {
    const { token, secret } = await firstStep();
    const issued = await completeAdminSecondFactor(token, codeFor(secret, NOW), CONTEXT, NOW);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    // Der eigentliche Nachweis: Das Admintoken wird der Mandantenauflösung
    // vorgelegt, und sie darf es nicht kennen.
    expect(await resolveSession(issued.value.token, NOW)).toBeNull();
  });

  it('öffnet ein Mandantentoken keine Adminsitzung', async () => {
    await createUser({
      email: 'buchhaltung@example.org',
      passwordHash: await hashPassword(PASSWORD),
      organizationId: DEFAULT_ORGANIZATION_ID,
    });

    const tenant = await login(
      { email: 'buchhaltung@example.org', password: PASSWORD },
      CONTEXT,
      NOW,
    );
    expect(tenant.ok).toBe(true);
    if (!tenant.ok || tenant.value.kind !== 'SESSION') throw new Error('keine Sitzung');

    expect(await resolveAdminSession(tenant.value.session.token, NOW)).toBeNull();
  });

  it('führt eine Adminsitzung keinen Mandantenkontext', async () => {
    const { token, secret } = await firstStep();
    const issued = await completeAdminSecondFactor(token, codeFor(secret, NOW), CONTEXT, NOW);
    if (!issued.ok) throw new Error('keine Sitzung');

    const session = await resolveAdminSession(issued.value.token, NOW);
    expect(session).not.toBeNull();

    // Eine Aussage über den Typ, hier zusätzlich zur Laufzeit geprüft: Ein
    // späterer Umbau soll `organization` nicht stillschweigend hinzufügen.
    expect(session === null ? true : 'organization' in session).toBe(false);
    expect(session?.platform.adminUserId).toBe(session?.adminUserId);
  });

  it('verliert ein gesperrtes Betreiberkonto seine Sitzung sofort', async () => {
    const { token, secret } = await firstStep();
    const issued = await completeAdminSecondFactor(token, codeFor(secret, NOW), CONTEXT, NOW);
    if (!issued.ok) throw new Error('keine Sitzung');

    const admin = await prisma.adminUser.findFirstOrThrow();
    await updateAdminUser(admin.id, { disabledAt: NOW });

    // Nicht erst mit dem Ablauf: Wer gesperrt wird, ist sofort draußen.
    expect(await resolveAdminSession(issued.value.token, NOW)).toBeNull();
    expect(await prisma.adminSession.count()).toBe(0);
  });

  it('weist ein gesperrtes Konto schon beim Passwort ab', async () => {
    const { id } = await seedAdmin();
    await updateAdminUser(id, { disabledAt: NOW });

    const result = await adminLogin(
      { email: 'betreiber@example.org', password: PASSWORD },
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Ununterscheidbar von einem unbekannten Konto.
    expect(result.error.kind).toBe('INVALID_CREDENTIALS');
  });
});
