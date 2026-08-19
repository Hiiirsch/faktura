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
import {
  completeAdminSetup,
  inviteAdmin,
  loadAdminSetup,
  resetAdmin,
} from '@/application/admin/admin-setup';
import { ADMIN_SETUP_TTL_MS } from '@/domain/auth/admin-setup-policy';
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
const OTHER_PASSWORD = 'Quittenbrot-am-Sonntagmorgen-3';
const CONTEXT = { ipAddress: '203.0.113.9', userAgent: 'pruefung' };
/** Die echte Uhr — ein Einmalkennwort ist an sie gebunden. */
const NOW = new Date();

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

describe('FA-ADM-06 / FA-ADM-08 Die Einrichtung eines Betreiberkontos', () => {
  /**
   * Die tragende Zusage: **Es gibt zu keinem Zeitpunkt ein Betreiberkonto ohne
   * zweiten Faktor.**
   *
   * Der naheliegende andere Weg — Konto mit Passwort anlegen, Einrichtung beim
   * ersten Login erzwingen — hätte sie aufgegeben: Zwischen Anlage und erster
   * Anmeldung stünde ein Konto, das nur ein Passwort kennt, und wer sich zuerst
   * anmeldet, richtet seinen Authenticator ein. Deshalb entsteht das Konto erst
   * beim Einlösen, und dieser Test hält fest, dass vorher **keines** existiert.
   */
  it('legt der Nachweis noch kein Konto an', async () => {
    const result = await inviteAdmin('neu@example.org', NOW);

    expect(result.ok).toBe(true);
    expect(await prisma.adminUser.count()).toBe(0);

    const stored = await prisma.adminInvitation.findFirstOrThrow();
    expect(stored.email).toBe('neu@example.org');
    if (!result.ok) return;
    // Der Token steht nirgends in der Datenbank.
    expect(JSON.stringify(stored)).not.toContain(result.value.token);
    expect(stored.tokenHash).toHaveLength(64);
  });

  it('entsteht das Konto beim Einlösen — vollständig', async () => {
    const invited = await inviteAdmin('neu@example.org', NOW);
    if (!invited.ok) throw new Error('kein Nachweis');

    const offer = await loadAdminSetup(invited.value.token, NOW);
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;

    const done = await completeAdminSetup(
      invited.value.token,
      { name: 'Tim', password: PASSWORD, code: codeFor(offer.value.secret, NOW) },
      NOW,
    );
    expect(done.ok).toBe(true);

    const admin = await prisma.adminUser.findUniqueOrThrow({
      where: { email: 'neu@example.org' },
    });
    expect(admin.name).toBe('Tim');
    // Der zweite Faktor ist von der ersten Sekunde an aktiv (FA-ADM-08).
    expect(admin.totpEnabled).toBe(true);
    expect(admin.totpSecret).toBe(offer.value.secret);

    // Und die Anmeldung geht auf dem üblichen Weg — zwei Schritte.
    const first = await adminLogin({ email: 'neu@example.org', password: PASSWORD }, CONTEXT, NOW);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await prisma.adminSession.count()).toBe(0);

    const second = await completeAdminSecondFactor(
      first.value.token,
      codeFor(offer.value.secret, NOW),
      CONTEXT,
      NOW,
    );
    expect(second.ok).toBe(true);
  });

  /**
   * Das Geheimnis bleibt über Neuladen stabil.
   *
   * Es steht am Nachweis und nicht in einem versteckten Formularfeld: Läge es
   * dort, erzeugte jedes Neuladen ein neues, und wer den ersten QR-Code
   * gescannt hat, bestätigte gegen das zweite — mit einer Fehlermeldung, die
   * nichts erklärt.
   */
  it('bleibt das Geheimnis über mehrere Aufrufe dasselbe', async () => {
    const invited = await inviteAdmin('neu@example.org', NOW);
    if (!invited.ok) throw new Error('kein Nachweis');

    const first = await loadAdminSetup(invited.value.token, NOW);
    const second = await loadAdminSetup(invited.value.token, NOW);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.secret).toBe(second.value.secret);
  });

  it('weist einen falschen Code ab, ohne ein Konto anzulegen', async () => {
    const invited = await inviteAdmin('neu@example.org', NOW);
    if (!invited.ok) throw new Error('kein Nachweis');

    const result = await completeAdminSetup(
      invited.value.token,
      { name: '', password: PASSWORD, code: '000000' },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('INVALID_CODE');
    expect(await prisma.adminUser.count()).toBe(0);
    // Der Nachweis ist nicht verbraucht — ein Tippfehler kostet nicht den Link.
    expect((await prisma.adminInvitation.findFirstOrThrow()).acceptedAt).toBeNull();
  });

  it('weist ein zu kurzes Passwort ab', async () => {
    const invited = await inviteAdmin('neu@example.org', NOW);
    if (!invited.ok) throw new Error('kein Nachweis');
    const offer = await loadAdminSetup(invited.value.token, NOW);
    if (!offer.ok) return;

    const result = await completeAdminSetup(
      invited.value.token,
      { name: '', password: 'kurz', code: codeFor(offer.value.secret, NOW) },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('PASSWORD');
    expect(await prisma.adminUser.count()).toBe(0);
  });

  it('lässt sich ein Nachweis nur einmal einlösen', async () => {
    const invited = await inviteAdmin('neu@example.org', NOW);
    if (!invited.ok) throw new Error('kein Nachweis');
    const offer = await loadAdminSetup(invited.value.token, NOW);
    if (!offer.ok) return;

    const code = codeFor(offer.value.secret, NOW);
    expect((await completeAdminSetup(invited.value.token, { name: '', password: PASSWORD, code }, NOW)).ok).toBe(true);

    const again = await completeAdminSetup(
      invited.value.token,
      { name: '', password: PASSWORD, code },
      NOW,
    );

    expect(again.ok).toBe(false);
    if (again.ok) return;
    // Dieselbe Antwort wie ein unbekannter Token — nicht ein Fehler an der
    // Adresseindeutigkeit.
    expect(again.error.kind).toBe('INVALID');
    expect(await prisma.adminUser.count()).toBe(1);
  });

  it('läuft der Nachweis nach 24 Stunden ab', async () => {
    const invited = await inviteAdmin('neu@example.org', NOW);
    if (!invited.ok) throw new Error('kein Nachweis');

    const tooLate = new Date(NOW.getTime() + ADMIN_SETUP_TTL_MS + 1_000);

    expect((await loadAdminSetup(invited.value.token, tooLate)).ok).toBe(false);
    expect(await prisma.adminUser.count()).toBe(0);
  });

  it('entwertet ein neuer Nachweis den vorigen', async () => {
    const first = await inviteAdmin('neu@example.org', NOW);
    const second = await inviteAdmin('neu@example.org', NOW);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect((await loadAdminSetup(first.value.token, NOW)).ok).toBe(false);
    expect((await loadAdminSetup(second.value.token, NOW)).ok).toBe(true);

    // Der partielle Index hält fest, dass genau einer offen ist.
    expect(
      await prisma.adminInvitation.count({
        where: { email: 'neu@example.org', acceptedAt: null, revokedAt: null },
      }),
    ).toBe(1);
  });

  it('weist eine Adresse ab, die schon ein Betreiberkonto trägt', async () => {
    await seedAdmin('vorhanden@example.org');

    const result = await inviteAdmin('vorhanden@example.org', NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('EMAIL_TAKEN');
  });
});

describe('FA-ADM-06 Ein Betreiberkonto zurücksetzen', () => {
  /**
   * Der Anlass: Der Authenticator ist weg, und Wiederherstellungscodes gibt es
   * für die Verwaltung nicht. Ohne diesen Weg bliebe nur ein Eingriff in die
   * Datenbank.
   */
  it('sperrt sofort und beendet die laufenden Sitzungen', async () => {
    const { secret } = await seedAdmin();
    const first = await adminLogin({ email: 'betreiber@example.org', password: PASSWORD }, CONTEXT, NOW);
    if (!first.ok) throw new Error('kein Nachweis');
    const issued = await completeAdminSecondFactor(
      first.value.token,
      codeFor(secret, NOW),
      CONTEXT,
      NOW,
    );
    if (!issued.ok) throw new Error('keine Sitzung');
    expect(await resolveAdminSession(issued.value.token, NOW)).not.toBeNull();

    const reset = await resetAdmin('betreiber@example.org', NOW);
    expect(reset.ok).toBe(true);

    // Sofort, nicht erst beim Einlösen: Wer zurücksetzt, tut das, weil etwas
    // abhandengekommen ist.
    expect(await resolveAdminSession(issued.value.token, NOW)).toBeNull();
    expect(await prisma.adminSession.count()).toBe(0);

    // Und auch das bekannte Passwort genügt nicht mehr.
    const again = await adminLogin({ email: 'betreiber@example.org', password: PASSWORD }, CONTEXT, NOW);
    expect(again.ok).toBe(false);
  });

  /**
   * **Das Konto bleibt dasselbe.**
   *
   * Es zu löschen und neu anzulegen wäre einfacher gewesen und hätte das
   * Protokoll beschädigt: Es nennt den Betreiber über seine Kennung
   * (`actorKind: 'ADMIN'`), und die eines gelöschten Kontos zeigt ins Leere.
   */
  it('behält das Konto seine Kennung und damit seine Spuren', async () => {
    const { id } = await seedAdmin();

    const reset = await resetAdmin('betreiber@example.org', NOW);
    if (!reset.ok) throw new Error('kein Nachweis');

    const offer = await loadAdminSetup(reset.value.token, NOW);
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    expect(offer.value.kind).toBe('RESET');

    const done = await completeAdminSetup(
      reset.value.token,
      { name: 'Tim', password: OTHER_PASSWORD, code: codeFor(offer.value.secret, NOW) },
      NOW,
    );
    expect(done.ok).toBe(true);

    // Dieselbe Kennung, neue Zugangsdaten, Sperre aufgehoben.
    const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id } });
    expect(admin.disabledAt).toBeNull();
    expect(admin.totpEnabled).toBe(true);
    expect(admin.totpSecret).toBe(offer.value.secret);
    expect(await prisma.adminUser.count()).toBe(1);

    // Das neue Passwort gilt, das alte nicht mehr.
    expect(
      (await adminLogin({ email: 'betreiber@example.org', password: OTHER_PASSWORD }, CONTEXT, NOW))
        .ok,
    ).toBe(true);
    expect(
      (await adminLogin({ email: 'betreiber@example.org', password: PASSWORD }, CONTEXT, NOW)).ok,
    ).toBe(false);
  });

  it('weist einen Reset für eine unbekannte Adresse ab', async () => {
    const result = await resetAdmin('gibtesnicht@example.org', NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NO_ACCOUNT');
  });

  /**
   * Die Absicht des Nachweises muss zur Lage passen.
   *
   * Ohne diese Prüfung könnte ein Nachweis, der für ein **neues** Konto
   * ausgestellt wurde, ein Konto überschreiben, das inzwischen auf anderem Weg
   * entstanden ist.
   */
  it('überschreibt ein `CREATE`-Nachweis kein inzwischen entstandenes Konto', async () => {
    const invited = await inviteAdmin('neu@example.org', NOW);
    if (!invited.ok) throw new Error('kein Nachweis');
    const offer = await loadAdminSetup(invited.value.token, NOW);
    if (!offer.ok) return;

    // Auf anderem Weg entsteht inzwischen ein Konto mit derselben Adresse.
    await seedAdmin('neu@example.org');

    const result = await completeAdminSetup(
      invited.value.token,
      { name: '', password: OTHER_PASSWORD, code: codeFor(offer.value.secret, NOW) },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('EMAIL_TAKEN');
  });
});
