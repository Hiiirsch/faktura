/**
 * Anmeldung in zwei Schritten (M6.2 — NFA-SEC-05, -07, -08).
 *
 * Der zweite Faktor wird seit M6.2 auf einer eigenen Seite abgefragt, und nur
 * bei Konten, die einen führen. Das erzeugt einen Zustand, den es vorher nicht
 * gab: „Passwort stimmte, Code fehlt noch." Er ist der empfindlichste Punkt des
 * Vorgangs, und die Prüfungen hier gelten fast alle ihm.
 *
 * Die eine Zusage, die über allen steht: **Der Nachweis ist keine Sitzung.**
 * Wer ihn erlangt, kommt damit an keine einzige geschützte Seite — geprüft wird
 * das nicht durch Lesen des Codes, sondern indem der Nachweis als
 * Sitzungscookie vorgelegt wird.
 */
import { PrismaClient } from '@prisma/client';
import { TOTP, Secret } from 'otpauth';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { completeSecondFactor, login } from '@/application/auth/login';
import { resolveSession } from '@/application/auth/session-service';
import { PENDING_LOGIN_TTL_MS } from '@/domain/auth/pending-login-policy';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { generateTotpSecret } from '@/infrastructure/auth/totp';
import { hashToken } from '@/infrastructure/auth/tokens';
import { getEnv } from '@/infrastructure/config/env';
import {
  createUser,
  findPendingLoginByHash,
  findUserByEmail,
  updateUser,
} from '@/infrastructure/repositories/auth-repository';
import { DEFAULT_ORGANIZATION_ID } from '@/infrastructure/repositories/organization-context';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';
const CONTEXT = { ipAddress: '203.0.113.7', userAgent: 'pruefung' };

/**
 * Die echte Uhr, nicht ein erfundener Zeitpunkt.
 *
 * `verifyTotpCode` prüft gegen die Systemzeit und nimmt keinen Zeitpunkt
 * entgegen — ein Einmalkennwort ist an die Uhr gebunden, das ist sein Wesen.
 * Ein für 10:00 Uhr erzeugter Code wäre eine halbe Stunde später schlicht
 * falsch, und der Test prüfte dann etwas anderes als das, was er behauptet.
 * Wo eine Frist geprüft wird, verschiebt der Test stattdessen `now` gegenüber
 * diesem Bezugspunkt.
 */
const NOW = new Date();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Legt ein Konto an — wahlweise mit zweitem Faktor. */
async function seedUser(
  email: string,
  options: { readonly withTotp: boolean },
): Promise<{ readonly id: string; readonly secret: string | null }> {
  const secret = options.withTotp ? generateTotpSecret() : null;

  await createUser({
    email,
    passwordHash: await hashPassword(PASSWORD),
    organizationId: DEFAULT_ORGANIZATION_ID,
    totpSecret: secret,
    totpEnabled: options.withTotp,
  });

  const user = await findUserByEmail(email);
  expect(user).not.toBeNull();
  return { id: user?.id ?? '', secret };
}

/** Ein gültiger Code zum Zeitpunkt `at`. */
function totpCodeFor(secret: string, at: Date): string {
  const totp = new TOTP({
    issuer: getEnv().APP_NAME,
    label: 'verify',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.generate({ timestamp: at.getTime() });
}

describe('Konto ohne zweiten Faktor', () => {
  it('ist nach dem Passwort angemeldet — die zweite Seite entfällt', async () => {
    await seedUser('ohne@example.org', { withTotp: false });

    const result = await login({ email: 'ohne@example.org', password: PASSWORD }, CONTEXT, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('SESSION');

    // Und die Sitzung trägt sofort.
    if (result.value.kind !== 'SESSION') return;
    expect(await resolveSession(result.value.session.token, NOW)).not.toBeNull();

    // Kein Zwischenzustand entstanden.
    expect(await prisma.pendingLogin.count()).toBe(0);
  });

  it('beantwortet unbekanntes Konto und falsches Passwort gleich', async () => {
    await seedUser('ohne@example.org', { withTotp: false });

    const wrongPassword = await login(
      { email: 'ohne@example.org', password: 'Falsch-aber-lang-genug-1' },
      CONTEXT,
      NOW,
    );
    const unknownAccount = await login(
      { email: 'gibtsnicht@example.org', password: PASSWORD },
      CONTEXT,
      NOW,
    );

    expect(wrongPassword.ok).toBe(false);
    expect(unknownAccount.ok).toBe(false);
    if (wrongPassword.ok || unknownAccount.ok) return;
    expect(wrongPassword.error).toEqual(unknownAccount.error);
  });
});

describe('Konto mit zweitem Faktor', () => {
  it('gibt nach dem Passwort keine Sitzung, sondern einen Nachweis', async () => {
    await seedUser('mit@example.org', { withTotp: true });

    const result = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('SECOND_FACTOR_REQUIRED');

    // Keine Sitzung angelegt — das ist die Zusage.
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.pendingLogin.count()).toBe(1);
  });

  it('gibt den Nachweis nur als Hash in die Datenbank (NFA-SEC-06)', async () => {
    await seedUser('mit@example.org', { withTotp: true });
    const result = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!result.ok || result.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    const token = result.value.pending.token;
    const stored = await prisma.pendingLogin.findFirstOrThrow();

    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toBe(token);
  });

  it('meldet mit richtigem Code an und verbraucht dabei den Nachweis', async () => {
    const { secret } = await seedUser('mit@example.org', { withTotp: true });
    const first = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok || first.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    const result = await completeSecondFactor(
      first.value.pending.token,
      totpCodeFor(secret ?? '', NOW),
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await resolveSession(result.value.token, NOW)).not.toBeNull();

    // Einmal verwendet, danach weg.
    expect(await prisma.pendingLogin.count()).toBe(0);
  });

  it('nimmt auch einen Wiederherstellungscode an', async () => {
    const { id } = await seedUser('mit@example.org', { withTotp: true });
    const code = 'ABCD-EFGH-JKLM-NPQR';
    await prisma.recoveryCode.create({
      data: { userId: id, codeHash: hashToken(code.replace(/-/gu, '')) },
    });

    const first = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok || first.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    const result = await completeSecondFactor(first.value.pending.token, code, CONTEXT, NOW);

    expect(result.ok).toBe(true);
    // Ein Wiederherstellungscode gilt genau einmal.
    const used = await prisma.recoveryCode.findFirstOrThrow();
    expect(used.usedAt).not.toBeNull();
  });
});

describe('Der Nachweis ist keine Sitzung', () => {
  it('öffnet als Sitzungstoken vorgelegt nichts', async () => {
    await seedUser('mit@example.org', { withTotp: true });
    const first = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok || first.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    // Der eigentliche Nachweis dieser Datei: Das Token des ersten Schritts
    // wird der Sitzungsauflösung vorgelegt — sie darf es nicht kennen.
    expect(await resolveSession(first.value.pending.token, NOW)).toBeNull();
  });

  it('läuft nach fünf Minuten ab', async () => {
    const { secret } = await seedUser('mit@example.org', { withTotp: true });
    const first = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok || first.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    const tooLate = new Date(NOW.getTime() + PENDING_LOGIN_TTL_MS + 1_000);
    const result = await completeSecondFactor(
      first.value.pending.token,
      totpCodeFor(secret ?? '', tooLate),
      CONTEXT,
      tooLate,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NO_PENDING_LOGIN');
    // Der abgelaufene Nachweis wird dabei gleich entfernt.
    expect(await prisma.pendingLogin.count()).toBe(0);
  });

  it('weist ein erfundenes Token ab', async () => {
    await seedUser('mit@example.org', { withTotp: true });

    const result = await completeSecondFactor('frei-erfunden', '123456', CONTEXT, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NO_PENDING_LOGIN');
  });

  it('behält nur den jüngsten Nachweis je Konto', async () => {
    await seedUser('mit@example.org', { withTotp: true });

    const first = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    const second = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok || first.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');
    if (!second.ok || second.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    expect(await prisma.pendingLogin.count()).toBe(1);
    // Der ältere ist ungültig geworden: kein offenes Zeitfenster, von dem
    // niemand mehr weiß.
    expect(await findPendingLoginByHash(hashToken(first.value.pending.token))).toBeNull();
    expect(await findPendingLoginByHash(hashToken(second.value.pending.token))).not.toBeNull();
  });

  it('gilt nicht mehr, wenn der zweite Faktor zwischenzeitlich abgeschaltet wurde', async () => {
    const { id, secret } = await seedUser('mit@example.org', { withTotp: true });
    const first = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok || first.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    await updateUser(id, { totpEnabled: false, totpSecret: null });

    const result = await completeSecondFactor(
      first.value.pending.token,
      totpCodeFor(secret ?? '', NOW),
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NO_PENDING_LOGIN');
  });
});

describe('NFA-SEC-08 Die Sperre gilt auch im zweiten Schritt', () => {
  it('zählt jeden falschen Code als Fehlversuch', async () => {
    const { id } = await seedUser('mit@example.org', { withTotp: true });
    const first = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok || first.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    const result = await completeSecondFactor(first.value.pending.token, '000000', CONTEXT, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('INVALID_CODE');

    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.failedLogins).toBe(1);

    // Der Nachweis bleibt: Ein Vertipper soll nicht die ganze Anmeldung kosten.
    expect(await prisma.pendingLogin.count()).toBe(1);
  });

  it('sperrt nach zehn falschen Codes und verwirft den Nachweis', async () => {
    await seedUser('mit@example.org', { withTotp: true });
    const first = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok || first.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    const token = first.value.pending.token;
    let last = await completeSecondFactor(token, '000000', CONTEXT, NOW);

    for (let attempt = 1; attempt < 11; attempt += 1) {
      last = await completeSecondFactor(token, '000000', CONTEXT, NOW);
    }

    expect(last.ok).toBe(false);
    if (last.ok) return;
    expect(last.error.kind).toBe('LOCKED');
    expect(await prisma.pendingLogin.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
  });

  it('lässt ein richtiges Passwort die Sperre nicht zurücksetzen', async () => {
    const { id } = await seedUser('mit@example.org', { withTotp: true });

    // Erst ein Fehlversuch beim Passwort …
    await login({ email: 'mit@example.org', password: 'Falsch-aber-lang-genug-1' }, CONTEXT, NOW);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).failedLogins).toBe(1);

    // … dann das richtige Passwort. Solange der zweite Faktor fehlt, ist die
    // Anmeldung nicht bestanden — der Zähler bleibt stehen.
    await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).failedLogins).toBe(1);
  });

  it('setzt den Zähler erst mit dem richtigen Code zurück', async () => {
    const { id, secret } = await seedUser('mit@example.org', { withTotp: true });
    await login({ email: 'mit@example.org', password: 'Falsch-aber-lang-genug-1' }, CONTEXT, NOW);

    const first = await login({ email: 'mit@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok || first.value.kind !== 'SECOND_FACTOR_REQUIRED') throw new Error('kein Nachweis');

    await completeSecondFactor(first.value.pending.token, totpCodeFor(secret ?? '', NOW), CONTEXT, NOW);

    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.failedLogins).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });
});
