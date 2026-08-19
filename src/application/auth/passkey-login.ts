/**
 * Anmeldung mit einem Passkey — **ohne Passwort** (M9, FA-PASS-06..08).
 *
 * **Warum das kein zweiter Faktor ist, sondern beide.** Der Passkey beweist den
 * Besitz des Geräts; die Gerätesperre — PIN, Fingerabdruck, Gesicht — beweist die
 * Person. Beides zusammen prüft der Authenticator, und er sagt es im
 * `userVerified`-Bit. Deshalb ist `requireUserVerification: true` hier keine
 * Verschärfung, sondern die Voraussetzung: Ohne diese Zeile wäre das hier eine
 * Anmeldung mit einem Faktor.
 *
 * **Ohne Adresse.** Der Passkey ist auffindbar (`residentKey: 'required'`), also
 * nennt der Authenticator selbst, zu wem er gehört — als `userHandle`. Wer sich
 * anmeldet, tippt nichts.
 *
 * **Die Anmeldesperre gilt hier nicht.** Zehn Fehlversuche sperren den
 * Passwortweg; ein Passkey lässt sich nicht durchprobieren, und eine Sperre, die
 * an ihm hinge, wäre ein Weg, jemanden auszusperren, ohne sein Passwort zu
 * kennen. Was weiter gilt, sind die Abweisungsgründe aus M8: gesperrtes Konto und
 * stillgelegtes Unternehmen.
 *
 * **Jede Ablehnung sieht gleich aus.** Unbekannter Schlüssel, gesperrter
 * Schlüssel, gesperrtes Konto, stillgelegtes Unternehmen — eine Antwort. Sonst
 * ließe sich mit fremden Schlüsseln erkunden, welche Konten es gibt.
 */
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';

import {
  createAdminSession,
  type IssuedAdminSession,
} from '@/application/admin/admin-session-service';
import {
  indicatesClonedAuthenticator,
  isWebauthnChallengeExpired,
  webauthnChallengeExpiry,
} from '@/domain/auth/webauthn-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { expectedOrigin, parseUserHandle, relyingPartyId } from '@/infrastructure/auth/webauthn';
import { logger } from '@/infrastructure/logging/logger';
import { findUserById, updateUser } from '@/infrastructure/repositories/auth-repository';
import { organizationContextOf } from '@/infrastructure/repositories/organization-context';
import {
  findAdminUserById,
  updateAdminUser,
} from '@/infrastructure/repositories/platform-repository';
import {
  consumeChallenge,
  createChallenge,
  deleteExpiredChallenges,
  disableCredential,
  findChallenge,
  findCredentialById,
  touchCredential,
} from '@/infrastructure/repositories/webauthn-repository';

import { createSession, type IssuedSession, type RequestContext } from './session-service';

/** Für welche Identität die Anmeldung gelten soll. */
export type PasskeyAudience = 'user' | 'admin';

export type PasskeyLoginError =
  /**
   * Die einzige Ablehnung, die ein Anmeldeversuch je zu sehen bekommt.
   *
   * Unbekannter Schlüssel, gesperrter Schlüssel, gesperrtes Konto, stillgelegtes
   * Unternehmen, falsche Identität, abgelaufene Aufgabe — alles dasselbe.
   */
  { readonly kind: 'REJECTED' };

export type PasskeyLoginOffer = {
  readonly challengeId: string;
  readonly options: { readonly challenge: string; readonly rpId: string; readonly timeout: number };
};

/**
 * Beginnt die Anmeldung: eine Aufgabe, an kein Konto gebunden.
 *
 * `allowCredentials` bleibt leer — das ist der Unterschied zur Registrierung.
 * Eine Liste erlaubter Schlüssel setzte voraus, dass man schon weiß, wer sich
 * anmeldet, und genau das weiß hier niemand.
 */
export async function beginPasskeyLogin(now: Date = new Date()): Promise<PasskeyLoginOffer> {
  await deleteExpiredChallenges(now);

  // Die Aufgabe selbst ist der einzige Zufall, den der Server beisteuert; die
  // Bibliothek erzeugt sie beim Registrieren, hier genügt derselbe Umfang.
  const { randomBytes } = await import('node:crypto');
  const challenge = randomBytes(32).toString('base64url');

  const row = await createChallenge({
    challenge,
    kind: 'AUTHENTICATE',
    expiresAt: webauthnChallengeExpiry(now),
  });

  return {
    challengeId: row.id,
    options: { challenge, rpId: relyingPartyId(), timeout: 60_000 },
  };
}

export type PasskeyLoginOutcome =
  | { readonly kind: 'user'; readonly session: IssuedSession }
  | { readonly kind: 'admin'; readonly session: IssuedAdminSession };

/**
 * Schließt die Anmeldung ab.
 *
 * `audience` sagt, welche Identität die aufrufende Route bedient. Ein Passkey
 * der jeweils anderen wird abgewiesen — sonst öffnete die Anmeldeseite der
 * Mandanten eine Betreibersitzung, und die Trennung der beiden Identitäten wäre
 * an dieser Stelle aufgehoben.
 */
export async function completePasskeyLogin(
  audience: PasskeyAudience,
  challengeId: string,
  response: AuthenticationResponseJSON,
  context: RequestContext,
  now: Date = new Date(),
): Promise<Result<PasskeyLoginOutcome, PasskeyLoginError>> {
  const challenge = await findChallenge(challengeId);

  if (
    challenge === null ||
    challenge.kind !== 'AUTHENTICATE' ||
    isWebauthnChallengeExpired(challenge.expiresAt, now)
  ) {
    return err({ kind: 'REJECTED' });
  }

  // Vor der Prüfung verbrauchen: Eine zweite Antwort auf dieselbe Aufgabe ist
  // ein Wiedereinspielversuch.
  await consumeChallenge(challenge.id);

  const credential = await findCredentialById(response.id);
  if (credential === null || credential.disabledAt !== null) {
    logger.security('passkey.login_unknown_credential', {}, 'warn');
    return err({ kind: 'REJECTED' });
  }

  /*
   * Der `userHandle` muss zum abgelegten Schlüssel passen.
   *
   * Er kommt vom Authenticator, also von der Gegenseite. Ihm ohne Abgleich zu
   * folgen hieße, sich das Konto nennen zu lassen, in das man will.
   */
  const handle =
    response.response.userHandle === undefined
      ? null
      : parseUserHandle(Buffer.from(response.response.userHandle, 'base64url').toString('utf8'));

  const owner =
    credential.userId !== null
      ? ({ kind: 'user', id: credential.userId } as const)
      : credential.adminUserId !== null
        ? ({ kind: 'admin', id: credential.adminUserId } as const)
        : null;

  if (owner === null || handle === null || handle.kind !== owner.kind || handle.id !== owner.id) {
    logger.security('passkey.login_handle_mismatch', {}, 'warn');
    return err({ kind: 'REJECTED' });
  }

  if (owner.kind !== audience) {
    logger.security('passkey.login_wrong_audience', { expected: audience }, 'warn');
    return err({ kind: 'REJECTED' });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: relyingPartyId(),
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, 'base64url'),
        /*
         * **Bewusst 0 statt des gespeicherten Werts** — die Zählerprüfung macht
         * diese Datei selbst, gleich darunter.
         *
         * Die Bibliothek würde sie sonst hier erledigen und die Zeremonie mit
         * einer Ausnahme abbrechen. Das wäre die richtige Antwort auf den
         * Anmeldeversuch, aber die falsche auf den Befund: Ein erkannter Klon
         * soll den Passkey **sperren**, und dazu muss der Fall unterscheidbar
         * bei uns ankommen statt in einem Fehlertext.
         *
         * Was dabei **nicht** wegfällt, ist die Prüfung selbst: Sie steht unten,
         * auf demselben Wert (`newCounter`), und zwar **nach** der Signatur.
         * Diese Reihenfolge ist der Punkt — läse man den Zähler vorher aus den
         * Rohdaten, ließe sich mit einer erfundenen Antwort ein fremder Passkey
         * sperren, ohne ihn zu besitzen.
         */
        counter: 0,
      },
      // Ohne diese Zeile wäre das hier eine Anmeldung mit einem Faktor.
      requireUserVerification: true,
    });
  } catch (error) {
    logger.security('passkey.login_rejected', { error }, 'warn');
    return err({ kind: 'REJECTED' });
  }

  if (!verification.verified) {
    return err({ kind: 'REJECTED' });
  }

  /*
   * **Die Klonerkennung** (FA-PASS-08).
   *
   * Ein Authenticator zählt jede Signatur hoch. Kommt ein Wert zurück, der nicht
   * größer ist als der gespeicherte, gibt es den Schlüssel zweimal. Die Folge
   * ist eine Sperre und nicht nur ein Protokolleintrag: Ein Wert, den man
   * aufschreibt und sonst nichts, ist eine Warnung, die niemand liest.
   */
  const received = verification.authenticationInfo.newCounter;
  if (indicatesClonedAuthenticator(credential.counter, received)) {
    await disableCredential(credential.id, now);
    logger.security(
      'passkey.cloned_authenticator',
      { credential: credential.id, stored: credential.counter, received },
      'error',
    );
    return err({ kind: 'REJECTED' });
  }

  if (owner.kind === 'admin') {
    const admin = await findAdminUserById(owner.id);
    if (admin === null || admin.disabledAt !== null) {
      return err({ kind: 'REJECTED' });
    }

    await touchCredential(credential.id, { counter: received, lastUsedAt: now });
    await updateAdminUser(admin.id, { failedLogins: 0, lockedUntil: null, lastLoginAt: now });

    logger.security('admin.login_succeeded', {
      adminUserId: admin.id,
      ipAddress: context.ipAddress,
      method: 'passkey',
    });

    return ok({ kind: 'admin', session: await createAdminSession(admin.id, context, now) });
  }

  const user = await findUserById(owner.id);
  if (user === null || user.disabledAt !== null || user.organization.suspendedAt !== null) {
    return err({ kind: 'REJECTED' });
  }

  await touchCredential(credential.id, { counter: received, lastUsedAt: now });
  await updateUser(user.id, { failedLogins: 0, lockedUntil: null, lastLoginAt: now });

  const organization = organizationContextOf(user.organizationId);
  const session = await createSession(user.id, context, now);

  await recordAuditEntry(organization, {
    entityType: 'User',
    entityId: user.id,
    action: 'LOGIN_SUCCEEDED',
    actorId: user.id,
    ipAddress: context.ipAddress,
  });

  logger.security('auth.login_succeeded', {
    userId: user.id,
    ipAddress: context.ipAddress,
    method: 'passkey',
  });

  return ok({ kind: 'user', session });
}
