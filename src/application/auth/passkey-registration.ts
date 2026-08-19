/**
 * Einen Passkey registrieren (M9, FA-PASS-01..04).
 *
 * **Für beide Identitäten dieselbe Datei**, weil die Zeremonie dieselbe ist. Was
 * sie unterscheidet, ist einzig, an welchem Konto der Schlüssel hängt — und das
 * ist ein Feld, kein Ablauf. Zwei Kopien dieser Datei wären zwei Stellen, an
 * denen `userVerification` auseinanderlaufen kann.
 *
 * **Registrieren darf nur, wer schon angemeldet ist.** Die Routen liegen hinter
 * der jeweiligen Sitzung; hier steht die Kennung des Kontos schon fest. Ein
 * Passkey, den jemand ohne Anmeldung anlegen könnte, wäre ein zweiter Weg
 * hinein, den niemand beschlossen hat.
 *
 * **`userVerification: 'required'`** ist die Bedingung, unter der ein Passkey
 * allein anmelden darf: Die Gerätesperre — PIN, Fingerabdruck, Gesicht — ist der
 * zweite Faktor. Ohne sie wäre er nur ein Besitzfaktor, und passwortloses
 * Anmelden damit eine Einfaktorauthentifizierung.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

import {
  isWebauthnChallengeExpired,
  webauthnChallengeExpiry,
} from '@/domain/auth/webauthn-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import {
  expectedOrigin,
  relyingPartyId,
  userHandleFor,
} from '@/infrastructure/auth/webauthn';
import { getEnv } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import {
  consumeChallenge,
  createChallenge,
  createCredential,
  deleteCredentialOfAdmin,
  deleteCredentialOfUser,
  deleteExpiredChallenges,
  findChallenge,
  listCredentialsForAdmin,
  listCredentialsForUser,
} from '@/infrastructure/repositories/webauthn-repository';

/** Wessen Passkey — und damit, an welchem Feld er hängt. */
export type PasskeyOwner =
  | { readonly kind: 'user'; readonly id: string; readonly email: string; readonly name: string | null }
  | { readonly kind: 'admin'; readonly id: string; readonly email: string; readonly name: string | null };

export type PasskeyError =
  /** Aufgabe unbekannt, abgelaufen oder schon verbraucht. */
  | { readonly kind: 'NO_CHALLENGE' }
  /** Die Antwort des Authenticators hielt der Prüfung nicht stand. */
  | { readonly kind: 'REJECTED' }
  | { readonly kind: 'LABEL_MISSING' };

/** Die Aufgabe samt ihrer Kennung — die reist im Cookie zurück. */
export type RegistrationOffer = {
  readonly challengeId: string;
  readonly options: PublicKeyCredentialCreationOptionsJSON;
};

async function existingCredentials(
  owner: PasskeyOwner,
): Promise<readonly { readonly credentialId: string; readonly transports: string | null }[]> {
  const rows =
    owner.kind === 'user'
      ? await listCredentialsForUser(owner.id)
      : await listCredentialsForAdmin(owner.id);

  return rows.map((row) => ({ credentialId: row.credentialId, transports: row.transports }));
}

/**
 * Beginnt die Registrierung.
 *
 * `excludeCredentials` nennt die schon vorhandenen Schlüssel: Der Authenticator
 * verweigert dann eine zweite Registrierung desselben Geräts, statt einen
 * doppelten Eintrag anzulegen, den niemand auseinanderhalten kann.
 */
export async function beginPasskeyRegistration(
  owner: PasskeyOwner,
  now: Date = new Date(),
): Promise<RegistrationOffer> {
  await deleteExpiredChallenges(now);

  const existing = await existingCredentials(owner);

  const options = await generateRegistrationOptions({
    rpName: getEnv().APP_NAME,
    rpID: relyingPartyId(),
    userName: owner.email,
    userDisplayName: owner.name ?? owner.email,
    // Die Kennung des Kontos, nicht die Adresse: Der `userHandle` liegt
    // unverschlüsselt im Authenticator und reist bei jeder Anmeldung mit.
    userID: new TextEncoder().encode(userHandleFor(owner.kind, owner.id)),
    attestationType: 'none',
    excludeCredentials: existing.map((entry) => ({ id: entry.credentialId })),
    authenticatorSelection: {
      // Auffindbar, damit die Anmeldung ohne Eingabe einer Adresse auskommt.
      residentKey: 'required',
      userVerification: 'required',
    },
  });

  const challenge = await createChallenge({
    challenge: options.challenge,
    kind: 'REGISTER',
    ...(owner.kind === 'user' ? { userId: owner.id } : { adminUserId: owner.id }),
    expiresAt: webauthnChallengeExpiry(now),
  });

  return { challengeId: challenge.id, options };
}

/**
 * Schließt die Registrierung ab.
 *
 * Die Aufgabe wird **vor** der Prüfung verbraucht: Eine zweite Antwort darauf
 * ist ein Wiedereinspielversuch und soll nichts mehr vorfinden, gleich ob die
 * erste gelang.
 */
export async function completePasskeyRegistration(
  owner: PasskeyOwner,
  challengeId: string,
  response: RegistrationResponseJSON,
  label: string,
  now: Date = new Date(),
): Promise<Result<{ readonly id: string }, PasskeyError>> {
  const name = label.trim();
  if (name.length === 0) {
    return err({ kind: 'LABEL_MISSING' });
  }

  const challenge = await findChallenge(challengeId);
  const belongsToOwner =
    challenge !== null &&
    challenge.kind === 'REGISTER' &&
    (owner.kind === 'user'
      ? challenge.userId === owner.id
      : challenge.adminUserId === owner.id);

  if (challenge === null || !belongsToOwner || isWebauthnChallengeExpired(challenge.expiresAt, now)) {
    return err({ kind: 'NO_CHALLENGE' });
  }

  await consumeChallenge(challenge.id);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: relyingPartyId(),
      requireUserVerification: true,
    });
  } catch (error) {
    // Der Client erfährt nur, dass es nicht ging (NFA-SEC-18); der Grund steht
    // im Serverlog, weil eine abgewiesene Zeremonie fast immer eine falsch
    // gesetzte `APP_URL` ist und man sonst blind sucht.
    logger.security('passkey.registration_rejected', { error }, 'warn');
    return err({ kind: 'REJECTED' });
  }

  if (!verification.verified || verification.registrationInfo === undefined) {
    logger.security('passkey.registration_unverified', {}, 'warn');
    return err({ kind: 'REJECTED' });
  }

  const { credential } = verification.registrationInfo;

  const created = await createCredential({
    ...(owner.kind === 'user' ? { userId: owner.id } : { adminUserId: owner.id }),
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports?.join(',') ?? null,
    label: name,
  });

  logger.security('passkey.registered', {
    ...(owner.kind === 'user' ? { userId: owner.id } : { adminUserId: owner.id }),
  });

  return ok({ id: created.id });
}

/** Ein Passkey, wie die Oberfläche ihn zeigt. */
export type PasskeySummary = {
  readonly id: string;
  readonly label: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  /** Gesperrt nach erkanntem Klon — sichtbar, damit man ihn entfernen kann. */
  readonly disabled: boolean;
};

export async function listPasskeys(owner: PasskeyOwner): Promise<readonly PasskeySummary[]> {
  const rows =
    owner.kind === 'user'
      ? await listCredentialsForUser(owner.id)
      : await listCredentialsForAdmin(owner.id);

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    disabled: row.disabledAt !== null,
  }));
}

/**
 * Entfernt einen Passkey.
 *
 * Die Einschränkung auf das Konto steht in der Abfrage, nicht in einer Prüfung
 * davor: Ein fremder Passkey wird nicht gefunden, statt gefunden und verworfen.
 *
 * **Der letzte Passkey darf gehen.** Passwort und zweiter Faktor bleiben; ein
 * Konto ohne Passkey ist kein ausgesperrtes Konto. Anders wäre es, wenn
 * Passkeys das Passwort ersetzten — sie ergänzen es.
 */
export async function removePasskey(owner: PasskeyOwner, id: string): Promise<boolean> {
  const removed =
    owner.kind === 'user'
      ? await deleteCredentialOfUser(owner.id, id)
      : await deleteCredentialOfAdmin(owner.id, id);

  if (removed) {
    logger.security('passkey.removed', {
      ...(owner.kind === 'user' ? { userId: owner.id } : { adminUserId: owner.id }),
    });
  }

  return removed;
}
