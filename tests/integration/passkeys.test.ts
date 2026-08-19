/**
 * Passkeys: Registrierung (M9, B3, FA-PASS-01..04).
 *
 * Geprüft wird auf der Anwendungsschicht mit einem nachgebauten Authenticator
 * (`tests/support/authenticator.ts`) — ein ES256-Schlüsselpaar aus `node:crypto`,
 * die Antwort selbst signiert.
 *
 * **Warum nicht nur im Browser.** Ein Browsertest beweist, dass die Zeremonie
 * durchläuft. Was er nicht kann, ist das Interessante herstellen: eine falsche
 * Herkunft, eine abgelaufene Aufgabe, eine zweite Antwort auf dieselbe Aufgabe.
 * Ein echter Authenticator tut so etwas nicht.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  beginPasskeyRegistration,
  completePasskeyRegistration,
  listPasskeys,
  type PasskeyOwner,
  removePasskey,
} from '@/application/auth/passkey-registration';
import { beginPasskeyLogin, completePasskeyLogin } from '@/application/auth/passkey-login';
import { resolveSession } from '@/application/auth/session-service';
import { WEBAUTHN_CHALLENGE_TTL_MS } from '@/domain/auth/webauthn-policy';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { expectedOrigin, relyingPartyId, userHandleFor } from '@/infrastructure/auth/webauthn';
import { createUser } from '@/infrastructure/repositories/auth-repository';
import { DEFAULT_ORGANIZATION_ID } from '@/infrastructure/repositories/organization-context';

import { createFakeAuthenticator } from '../support/authenticator';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const NOW = new Date();
const CONTEXT = { ipAddress: '203.0.113.40', userAgent: 'pruefung' };
const ORIGIN = expectedOrigin();
const RP_ID = relyingPartyId();

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

async function seedOwner(): Promise<PasskeyOwner> {
  const user = await createUser({
    email: 'passkey@example.org',
    passwordHash: await hashPassword('Zwetschgenkuchen-mit-Streuseln-7'),
    organizationId: DEFAULT_ORGANIZATION_ID,
  });

  return { kind: 'user', id: user.id, email: user.email, name: null };
}

describe('FA-PASS-03 Einen Passkey anlegen', () => {
  it('nimmt eine gültige Antwort an und legt den Schlüssel ab', async () => {
    const owner = await seedOwner();
    const authenticator = createFakeAuthenticator();

    const offer = await beginPasskeyRegistration(owner, NOW);
    const response = authenticator.register(offer.options.challenge, ORIGIN, RP_ID);

    const result = await completePasskeyRegistration(
      owner,
      offer.challengeId,
      response as never,
      'Telefon',
      NOW,
    );

    expect(result.ok).toBe(true);

    const stored = await prisma.webAuthnCredential.findFirstOrThrow();
    expect(stored.label).toBe('Telefon');
    expect(stored.userId).toBe(owner.id);
    // Genau ein Konto — der CHECK erzwingt es, hier wird es bestätigt.
    expect(stored.adminUserId).toBeNull();
    expect(stored.credentialId).toBe(authenticator.credentialId);
  });

  /**
   * **Die Herkunft ist die Zusage.** Ein Authenticator, der von einer anderen
   * Adresse aus signiert hat, wird abgewiesen — genau darin besteht die
   * Phishing-Resistenz.
   */
  it('weist eine Antwort mit fremder Herkunft ab', async () => {
    const owner = await seedOwner();
    const authenticator = createFakeAuthenticator();

    const offer = await beginPasskeyRegistration(owner, NOW);
    const response = authenticator.register(
      offer.options.challenge,
      'https://faktura-anmeldung.example',
      RP_ID,
    );

    const result = await completePasskeyRegistration(
      owner,
      offer.challengeId,
      response as never,
      'Telefon',
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('REJECTED');
    expect(await prisma.webAuthnCredential.count()).toBe(0);
  });

  it('weist eine Antwort mit fremder Domain ab', async () => {
    const owner = await seedOwner();
    const authenticator = createFakeAuthenticator();

    const offer = await beginPasskeyRegistration(owner, NOW);
    const response = authenticator.register(offer.options.challenge, ORIGIN, 'boese.example');

    const result = await completePasskeyRegistration(
      owner,
      offer.challengeId,
      response as never,
      'Telefon',
      NOW,
    );

    expect(result.ok).toBe(false);
    expect(await prisma.webAuthnCredential.count()).toBe(0);
  });

  /**
   * Die Aufgabe wird **vor** der Prüfung verbraucht.
   *
   * Eine zweite Antwort darauf ist ein Wiedereinspielversuch und findet nichts
   * mehr vor — gleich ob die erste gelang.
   */
  it('lässt sich eine Aufgabe nur einmal beantworten', async () => {
    const owner = await seedOwner();
    const authenticator = createFakeAuthenticator();

    const offer = await beginPasskeyRegistration(owner, NOW);
    const response = authenticator.register(offer.options.challenge, ORIGIN, RP_ID);

    expect(
      (await completePasskeyRegistration(owner, offer.challengeId, response as never, 'A', NOW)).ok,
    ).toBe(true);

    const again = await completePasskeyRegistration(
      owner,
      offer.challengeId,
      response as never,
      'B',
      NOW,
    );

    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.kind).toBe('NO_CHALLENGE');
    expect(await prisma.webAuthnCredential.count()).toBe(1);
  });

  it('läuft eine Aufgabe nach zwei Minuten ab', async () => {
    const owner = await seedOwner();
    const authenticator = createFakeAuthenticator();

    const offer = await beginPasskeyRegistration(owner, NOW);
    const response = authenticator.register(offer.options.challenge, ORIGIN, RP_ID);
    const tooLate = new Date(NOW.getTime() + WEBAUTHN_CHALLENGE_TTL_MS + 1_000);

    const result = await completePasskeyRegistration(
      owner,
      offer.challengeId,
      response as never,
      'Telefon',
      tooLate,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NO_CHALLENGE');
  });

  /**
   * Eine Aufgabe gehört dem Konto, für das sie ausgestellt wurde.
   *
   * Ohne diese Prüfung könnte ein Konto die Aufgabe eines anderen beantworten
   * und sich dessen Passkey unterschieben.
   */
  it('nimmt kein anderes Konto die Aufgabe an', async () => {
    const owner = await seedOwner();
    const authenticator = createFakeAuthenticator();
    const offer = await beginPasskeyRegistration(owner, NOW);

    const other = await createUser({
      email: 'zweiter@example.org',
      passwordHash: await hashPassword('Zwetschgenkuchen-mit-Streuseln-7'),
      organizationId: DEFAULT_ORGANIZATION_ID,
    });

    const result = await completePasskeyRegistration(
      { kind: 'user', id: other.id, email: other.email, name: null },
      offer.challengeId,
      authenticator.register(offer.options.challenge, ORIGIN, RP_ID) as never,
      'Telefon',
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NO_CHALLENGE');
  });

  it('verlangt eine Bezeichnung', async () => {
    const owner = await seedOwner();
    const authenticator = createFakeAuthenticator();
    const offer = await beginPasskeyRegistration(owner, NOW);

    const result = await completePasskeyRegistration(
      owner,
      offer.challengeId,
      authenticator.register(offer.options.challenge, ORIGIN, RP_ID) as never,
      '   ',
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('LABEL_MISSING');
  });

  it('verlangt die Zeremonie eine Nutzerverifikation', async () => {
    const owner = await seedOwner();
    const offer = await beginPasskeyRegistration(owner, NOW);

    // Ohne sie wäre ein Passkey nur ein Besitzfaktor, und passwortloses
    // Anmelden damit eine Einfaktorauthentifizierung.
    expect(offer.options.authenticatorSelection?.userVerification).toBe('required');
    expect(offer.options.authenticatorSelection?.residentKey).toBe('required');
  });
});

describe('FA-PASS-04 Passkeys auflisten und entfernen', () => {
  async function registered(): Promise<{ owner: PasskeyOwner; id: string }> {
    const owner = await seedOwner();
    const authenticator = createFakeAuthenticator();
    const offer = await beginPasskeyRegistration(owner, NOW);

    const result = await completePasskeyRegistration(
      owner,
      offer.challengeId,
      authenticator.register(offer.options.challenge, ORIGIN, RP_ID) as never,
      'Telefon',
      NOW,
    );
    if (!result.ok) throw new Error('nicht angelegt');

    return { owner, id: result.value.id };
  }

  it('führt die Liste den angelegten Schlüssel', async () => {
    const { owner } = await registered();

    const list = await listPasskeys(owner);

    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe('Telefon');
    expect(list[0]?.disabled).toBe(false);
    expect(list[0]?.lastUsedAt).toBeNull();
  });

  it('entfernt nur den eigenen Schlüssel', async () => {
    const { owner, id } = await registered();

    const stranger: PasskeyOwner = {
      kind: 'user',
      id: 'user_gibtesnicht',
      email: 'fremd@example.org',
      name: null,
    };

    expect(await removePasskey(stranger, id)).toBe(false);
    expect(await prisma.webAuthnCredential.count()).toBe(1);

    expect(await removePasskey(owner, id)).toBe(true);
    expect(await prisma.webAuthnCredential.count()).toBe(0);
  });
});

describe('FA-PASS-06..08 Anmeldung mit einem Passkey', () => {
  /** Ein Konto samt registriertem Passkey. */
  async function withPasskey(): Promise<{
    readonly owner: PasskeyOwner;
    readonly authenticator: ReturnType<typeof createFakeAuthenticator>;
  }> {
    const owner = await seedOwner();
    const authenticator = createFakeAuthenticator();
    const offer = await beginPasskeyRegistration(owner, NOW);

    const registered = await completePasskeyRegistration(
      owner,
      offer.challengeId,
      authenticator.register(offer.options.challenge, ORIGIN, RP_ID) as never,
      'Telefon',
      NOW,
    );
    if (!registered.ok) throw new Error('nicht registriert');

    return { owner, authenticator };
  }

  function handleOf(owner: PasskeyOwner): string {
    return userHandleFor(owner.kind, owner.id);
  }

  it('meldet ohne Passwort und ohne Code an', async () => {
    const { owner, authenticator } = await withPasskey();

    const offer = await beginPasskeyLogin(NOW);
    const result = await completePasskeyLogin(
      'user',
      offer.challengeId,
      authenticator.authenticate(
        offer.options.challenge,
        ORIGIN,
        RP_ID,
        handleOf(owner),
      ) as never,
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('user');
    if (result.value.kind !== 'user') return;

    // Die Sitzung trägt sofort.
    expect(await resolveSession(result.value.session.token, NOW)).not.toBeNull();

    // Und der Passkey merkt sich, dass er benutzt wurde.
    const stored = await prisma.webAuthnCredential.findFirstOrThrow();
    expect(stored.lastUsedAt).not.toBeNull();
    expect(stored.counter).toBeGreaterThan(0);
  });

  /**
   * **Die Klonerkennung** (FA-PASS-08).
   *
   * Ein Authenticator zählt jede Signatur hoch. Kommt ein Wert zurück, der nicht
   * größer ist als der gespeicherte, gibt es den Schlüssel zweimal. Die Folge ist
   * eine Sperre, nicht nur ein Protokolleintrag — sonst wäre es eine Warnung,
   * die niemand liest.
   */
  it('sperrt den Passkey, wenn der Zähler einen Klon verrät', async () => {
    const { owner, authenticator } = await withPasskey();

    // Einmal regulär anmelden, damit der Zähler steht.
    const first = await beginPasskeyLogin(NOW);
    await completePasskeyLogin(
      'user',
      first.challengeId,
      authenticator.authenticate(first.options.challenge, ORIGIN, RP_ID, handleOf(owner)) as never,
      CONTEXT,
      NOW,
    );

    const before = await prisma.webAuthnCredential.findFirstOrThrow();

    // Ein Klon zählt unabhängig weiter und liegt deshalb zurück.
    const second = await beginPasskeyLogin(NOW);
    const result = await completePasskeyLogin(
      'user',
      second.challengeId,
      authenticator.authenticate(
        second.options.challenge,
        ORIGIN,
        RP_ID,
        handleOf(owner),
        before.counter,
      ) as never,
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);

    const after = await prisma.webAuthnCredential.findFirstOrThrow();
    expect(after.disabledAt).not.toBeNull();

    // Und ein gesperrter Passkey meldet niemanden mehr an — auch nicht mit
    // einem wieder korrekten Zähler.
    const third = await beginPasskeyLogin(NOW);
    const again = await completePasskeyLogin(
      'user',
      third.challengeId,
      authenticator.authenticate(third.options.challenge, ORIGIN, RP_ID, handleOf(owner)) as never,
      CONTEXT,
      NOW,
    );
    expect(again.ok).toBe(false);
  });

  it('weist ein gesperrtes Konto ab', async () => {
    const { owner, authenticator } = await withPasskey();
    await prisma.user.update({ where: { id: owner.id }, data: { disabledAt: NOW } });

    const offer = await beginPasskeyLogin(NOW);
    const result = await completePasskeyLogin(
      'user',
      offer.challengeId,
      authenticator.authenticate(offer.options.challenge, ORIGIN, RP_ID, handleOf(owner)) as never,
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);
    expect(await prisma.session.count()).toBe(0);
  });

  it('weist ein stillgelegtes Unternehmen ab', async () => {
    const { owner, authenticator } = await withPasskey();
    await prisma.organization.update({
      where: { id: DEFAULT_ORGANIZATION_ID },
      data: { suspendedAt: NOW },
    });

    const offer = await beginPasskeyLogin(NOW);
    const result = await completePasskeyLogin(
      'user',
      offer.challengeId,
      authenticator.authenticate(offer.options.challenge, ORIGIN, RP_ID, handleOf(owner)) as never,
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);
    expect(await prisma.session.count()).toBe(0);
  });

  /**
   * **Die Trennung der beiden Identitäten.**
   *
   * Die Anmeldeseite der Mandanten darf mit einem Passkey keine Betreibersitzung
   * öffnen — und umgekehrt. Die Route sagt, welche Identität sie bedient; ein
   * Schlüssel der anderen wird abgewiesen.
   */
  it('öffnet ein Mandanten-Passkey keine Betreibersitzung', async () => {
    const { owner, authenticator } = await withPasskey();

    const offer = await beginPasskeyLogin(NOW);
    const result = await completePasskeyLogin(
      'admin',
      offer.challengeId,
      authenticator.authenticate(offer.options.challenge, ORIGIN, RP_ID, handleOf(owner)) as never,
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);
    expect(await prisma.adminSession.count()).toBe(0);
  });

  /**
   * Der `userHandle` kommt vom Authenticator, also von der Gegenseite.
   *
   * Ihm ohne Abgleich zu folgen hieße, sich das Konto nennen zu lassen, in das
   * man will.
   */
  it('glaubt einem gefälschten `userHandle` nicht', async () => {
    const { authenticator } = await withPasskey();

    const other = await createUser({
      email: 'zweiter@example.org',
      passwordHash: await hashPassword('Zwetschgenkuchen-mit-Streuseln-7'),
      organizationId: DEFAULT_ORGANIZATION_ID,
    });

    const offer = await beginPasskeyLogin(NOW);
    const result = await completePasskeyLogin(
      'user',
      offer.challengeId,
      authenticator.authenticate(
        offer.options.challenge,
        ORIGIN,
        RP_ID,
        userHandleFor('user', other.id),
      ) as never,
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);
    expect(await prisma.session.count()).toBe(0);
  });

  it('weist eine Antwort mit fremder Herkunft ab', async () => {
    const { owner, authenticator } = await withPasskey();

    const offer = await beginPasskeyLogin(NOW);
    const result = await completePasskeyLogin(
      'user',
      offer.challengeId,
      authenticator.authenticate(
        offer.options.challenge,
        'https://faktura-anmeldung.example',
        RP_ID,
        handleOf(owner),
      ) as never,
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(false);
    expect(await prisma.session.count()).toBe(0);
  });

  it('lässt sich eine Aufgabe nur einmal beantworten', async () => {
    const { owner, authenticator } = await withPasskey();

    const offer = await beginPasskeyLogin(NOW);
    const response = authenticator.authenticate(
      offer.options.challenge,
      ORIGIN,
      RP_ID,
      handleOf(owner),
    );

    expect(
      (await completePasskeyLogin('user', offer.challengeId, response as never, CONTEXT, NOW)).ok,
    ).toBe(true);

    // Dieselbe Antwort ein zweites Mal ist ein Wiedereinspielversuch.
    const again = await completePasskeyLogin(
      'user',
      offer.challengeId,
      response as never,
      CONTEXT,
      NOW,
    );
    expect(again.ok).toBe(false);
  });

  it('läuft eine Anmeldeaufgabe nach zwei Minuten ab', async () => {
    const { owner, authenticator } = await withPasskey();

    const offer = await beginPasskeyLogin(NOW);
    const tooLate = new Date(NOW.getTime() + WEBAUTHN_CHALLENGE_TTL_MS + 1_000);

    const result = await completePasskeyLogin(
      'user',
      offer.challengeId,
      authenticator.authenticate(offer.options.challenge, ORIGIN, RP_ID, handleOf(owner)) as never,
      CONTEXT,
      tooLate,
    );

    expect(result.ok).toBe(false);
  });

  /**
   * Die Anmeldesperre gilt hier **nicht**.
   *
   * Zehn Fehlversuche sperren den Passwortweg; ein Passkey lässt sich nicht
   * durchprobieren. Eine Sperre, die an ihm hinge, wäre ein Weg, jemanden
   * auszusperren, ohne sein Passwort zu kennen.
   */
  it('meldet auch ein gesperrtes Passwortkonto mit Passkey an', async () => {
    const { owner, authenticator } = await withPasskey();
    await prisma.user.update({
      where: { id: owner.id },
      data: { failedLogins: 10, lockedUntil: new Date(NOW.getTime() + 15 * 60_000) },
    });

    const offer = await beginPasskeyLogin(NOW);
    const result = await completePasskeyLogin(
      'user',
      offer.challengeId,
      authenticator.authenticate(offer.options.challenge, ORIGIN, RP_ID, handleOf(owner)) as never,
      CONTEXT,
      NOW,
    );

    expect(result.ok).toBe(true);

    // Und die Sperre ist danach aufgehoben: Der Passkey hat bewiesen, wer da ist.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(user.lockedUntil).toBeNull();
    expect(user.failedLogins).toBe(0);
  });
});
