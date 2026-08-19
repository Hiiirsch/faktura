/**
 * Passkeys und die Aufgaben ihrer Zeremonien (M9, FA-PASS-*).
 *
 * **Die dritte dokumentierte Ausnahme von der Kontextpflicht** — nach der
 * Anmeldung und der Betreiberverwaltung, und aus demselben Grund: Wer einen
 * Passkey vorlegt, ist noch niemand. Welches Konto gemeint ist, ist das
 * *Ergebnis* der Abfrage; der Authenticator nennt dazu einen `userHandle`, und
 * daraus wird aufgelöst.
 *
 * Beide Identitäten teilen sich die Tabelle, weil die Zeremonie dieselbe ist.
 * Getrennt bleiben sie dort, wo es zählt: Ein `WebAuthnCredential` gehört zu
 * genau einem Konto — Mandant **oder** Betreiber —, und ein CHECK in der
 * Datenbank erzwingt das. Eine Abfrage, die beide Felder ignoriert, gibt es
 * nicht: Jede Lesefunktion hier nennt eines von beiden.
 */
import type { Prisma, WebAuthnChallenge, WebAuthnCredential } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';

export type { WebAuthnChallenge, WebAuthnCredential };

// ─── Aufgaben ───────────────────────────────────────────────────────────────

export async function createChallenge(
  data: Prisma.WebAuthnChallengeUncheckedCreateInput,
): Promise<WebAuthnChallenge> {
  return clientFor(undefined).webAuthnChallenge.create({ data });
}

export async function findChallenge(id: string): Promise<WebAuthnChallenge | null> {
  return clientFor(undefined).webAuthnChallenge.findUnique({ where: { id } });
}

/**
 * Verbraucht die Aufgabe — **gleich ob die Prüfung gelingt**.
 *
 * Eine zweite Antwort auf dieselbe Aufgabe ist ein Wiedereinspielversuch und
 * findet nichts mehr vor. Deshalb wird hier gelöscht, bevor geprüft wird, und
 * nicht danach.
 */
export async function consumeChallenge(id: string): Promise<void> {
  await clientFor(undefined).webAuthnChallenge.deleteMany({ where: { id } });
}

/** Räumt abgelaufene Aufgaben ab — beiläufig bei jeder neuen. */
export async function deleteExpiredChallenges(now: Date): Promise<void> {
  await clientFor(undefined).webAuthnChallenge.deleteMany({
    where: { expiresAt: { lte: now } },
  });
}

// ─── Passkeys ───────────────────────────────────────────────────────────────

export async function createCredential(
  data: Prisma.WebAuthnCredentialUncheckedCreateInput,
  handle?: TransactionHandle,
): Promise<WebAuthnCredential> {
  return clientFor(handle).webAuthnCredential.create({ data });
}

/**
 * Der Passkey zu einer Kennung — **ohne Rücksicht auf die Sperre**.
 *
 * Die Bewertung trifft die Anwendungsschicht: Ein gesperrter Passkey soll
 * dieselbe Antwort erzeugen wie ein unbekannter (keine Auskunft darüber, dass es
 * ihn gab), aber im Log unterscheidbar sein.
 */
export async function findCredentialById(
  credentialId: string,
): Promise<WebAuthnCredential | null> {
  return clientFor(undefined).webAuthnCredential.findUnique({ where: { credentialId } });
}

export async function listCredentialsForUser(
  userId: string,
): Promise<readonly WebAuthnCredential[]> {
  return clientFor(undefined).webAuthnCredential.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function listCredentialsForAdmin(
  adminUserId: string,
): Promise<readonly WebAuthnCredential[]> {
  return clientFor(undefined).webAuthnCredential.findMany({
    where: { adminUserId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function touchCredential(
  id: string,
  data: { readonly counter: number; readonly lastUsedAt: Date },
): Promise<void> {
  await clientFor(undefined).webAuthnCredential.update({ where: { id }, data });
}

/**
 * Sperrt einen Passkey, dessen Zähler einen Klon verraten hat.
 *
 * Gesperrt und nicht gelöscht: Der Eintrag ist die Spur, dass es den Vorfall gab
 * — und sein Inhaber soll in der Liste sehen, welcher Schlüssel betroffen ist,
 * statt einen zu vermissen.
 */
export async function disableCredential(id: string, disabledAt: Date): Promise<void> {
  await clientFor(undefined).webAuthnCredential.update({ where: { id }, data: { disabledAt } });
}

/** Die Einschränkung auf das Konto verhindert, dass ein fremder Passkey endet. */
export async function deleteCredentialOfUser(userId: string, id: string): Promise<boolean> {
  const result = await clientFor(undefined).webAuthnCredential.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

export async function deleteCredentialOfAdmin(adminUserId: string, id: string): Promise<boolean> {
  const result = await clientFor(undefined).webAuthnCredential.deleteMany({
    where: { id, adminUserId },
  });
  return result.count > 0;
}
