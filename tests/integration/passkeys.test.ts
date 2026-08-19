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
import { WEBAUTHN_CHALLENGE_TTL_MS } from '@/domain/auth/webauthn-policy';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { expectedOrigin, relyingPartyId } from '@/infrastructure/auth/webauthn';
import { createUser } from '@/infrastructure/repositories/auth-repository';
import { DEFAULT_ORGANIZATION_ID } from '@/infrastructure/repositories/organization-context';

import { createFakeAuthenticator } from '../support/authenticator';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const NOW = new Date();
const ORIGIN = expectedOrigin();
const RP_ID = relyingPartyId();

beforeEach(async () => {
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
