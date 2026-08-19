/**
 * Betreiberkonten aus der Oberfläche verwalten (M10, B1, FA-ADM-12, -13).
 *
 * **Warum das nicht schon in M8 kam.** Dort entstand das erste Betreiberkonto
 * über `npm run admin:create`, und ein zweites hätte denselben Weg genommen. Das
 * hielt genau so lange, bis der Zugang zum Server nicht mehr selbstverständlich
 * war: Wer die Anwendung betreibt, aber keine Konsole hat, konnte niemanden
 * hinzunehmen und niemanden ausschließen.
 *
 * **Was hier nicht steht, ist die Zeremonie.** `inviteAdmin`, `resetAdmin` und
 * `completeAdminSetup` in `admin-setup.ts` bleiben unverändert — sie sind
 * dieselben Funktionen, die die Kommandos benutzen, und ein zweiter
 * Ausstellungsweg wäre eine zweite Stelle, an der ein Konto ohne zweiten Faktor
 * entstehen könnte (FA-ADM-08). Diese Datei fügt drei Dinge hinzu: den
 * Nachweis, dass ein angemeldeter Betreiber handelt, die Liste, und die zwei
 * Ablehnungen, die es nur in der Oberfläche gibt.
 *
 * **Der Akteur kommt aus dem Kontext, nicht als Parameter.** `PlatformContext`
 * trägt `adminUserId` — wer handelt, steht also im Nachweis selbst. Ein
 * zusätzlicher `actorId` wäre eine zweite Wahrheit über dieselbe Sache, und die
 * zweite wäre die, die nach einer Umstellung nicht mehr stimmt. Es ist derselbe
 * Grund, aus dem in M8 die beiden `void actorId;` verschwunden sind.
 *
 * **Die erste Ablehnung: das eigene Konto.** Niemand sperrt oder setzt sich
 * selbst zurück — nicht weil es unmöglich wäre, sondern weil es keinen Vorgang
 * gibt, den das abbildet. Wer gehen will, lässt sich von einem anderen sperren;
 * wer seinen Authenticator verloren hat, ist gerade nicht angemeldet. Dieselbe
 * Regel wie bei den Mitgliedern.
 *
 * **Die zweite: das letzte aktive Konto** — aber nur beim Sperren aus der
 * Oberfläche, nicht als Regel der Tabelle. Der erste Anlauf war ein Trigger und
 * war falsch: `resetAdmin` sperrt absichtlich und stellt im selben Zug einen
 * Einrichtungslink aus, führt in einer Anlage mit einem Betreiber also durch
 * einen Zustand ohne aktives Konto. Der Trigger hätte damit genau den Weg
 * gesperrt, der seit M8 bei verlorenem Authenticator hilft. Die Begründung steht
 * ausführlich an `setAdminUserDisabled`.
 */
import { err, ok, type Result } from '@/domain/shared/result';
import { logger } from '@/infrastructure/logging/logger';
import type { PlatformContext } from '@/infrastructure/repositories/platform-context';
import {
  findAdminUserById,
  listAdminUsers,
  setAdminUserDisabled,
} from '@/infrastructure/repositories/platform-repository';

import { inviteAdmin, resetAdmin } from './admin-setup';

export type PlatformAccount = {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly totpEnabled: boolean;
  readonly disabledAt: Date | null;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
};

export type PlatformAccountError =
  /** Die Adresse führt bereits ein Betreiberkonto. */
  | { readonly kind: 'EMAIL_TAKEN' }
  /** Kein Konto unter dieser Kennung. */
  | { readonly kind: 'NOT_FOUND' }
  /** Das eigene Konto — dafür gibt es keinen Vorgang. */
  | { readonly kind: 'SELF' }
  /** Der Trigger hat abgewiesen: Es wäre das letzte aktive Konto gewesen. */
  | { readonly kind: 'LAST_ADMINISTRATOR' };

export async function listPlatformAccounts(
  platform: PlatformContext,
): Promise<readonly PlatformAccount[]> {
  return listAdminUsers(platform);
}

/**
 * Lädt ein weiteres Betreiberkonto ein.
 *
 * Der Link verlässt die Anwendungsschicht **genau einmal**, als Rückgabewert —
 * wie jeder Nachweis in diesem Projekt. Gespeichert liegt nur sein Hash, und die
 * Anwendung versendet keine E-Mail (NFA-COMP-05).
 */
export async function invitePlatformAccount(
  platform: PlatformContext,
  email: string,
  now: Date = new Date(),
): Promise<Result<{ readonly token: string; readonly expiresAt: Date }, PlatformAccountError>> {
  const result = await inviteAdmin(email, now);
  if (!result.ok) {
    return err({ kind: 'EMAIL_TAKEN' });
  }

  logger.security('admin.account_invited', {
    by: platform.adminUserId,
    email: email.trim().toLowerCase(),
  });
  return ok(result.value);
}

/**
 * Sperrt ein Betreiberkonto oder gibt es wieder frei.
 *
 * Gezählt und geschrieben wird in **einer** Transaktion, unten im Repository —
 * getrennt wäre es ein Wettlauffenster, in dem zwei gleichzeitige Sperrungen
 * beide noch ein zweites aktives Konto sähen.
 */
export async function setPlatformAccountDisabled(
  platform: PlatformContext,
  id: string,
  disabled: boolean,
  now: Date = new Date(),
): Promise<Result<null, PlatformAccountError>> {
  if (id === platform.adminUserId) {
    return err({ kind: 'SELF' });
  }

  if ((await findAdminUserById(id)) === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  if ((await setAdminUserDisabled(platform, id, disabled ? now : null)) === 'last-administrator') {
    return err({ kind: 'LAST_ADMINISTRATOR' });
  }

  logger.security(disabled ? 'admin.account_disabled' : 'admin.account_enabled', {
    by: platform.adminUserId,
    adminUserId: id,
  });

  return ok(null);
}

/**
 * Stellt einem vorhandenen Betreiberkonto neue Zugangsdaten aus.
 *
 * `resetAdmin` sperrt das Konto sofort und beendet alle Sitzungen; neue
 * Zugangsdaten entstehen erst beim Einlösen, im Browser des Betroffenen. Der
 * Ausstellende erfährt weder Passwort noch TOTP-Geheimnis.
 *
 * **Auch das letzte aktive Konto lässt sich zurücksetzen**, anders als sperren.
 * Der Unterschied ist der Rückweg: Das Zurücksetzen stellt ihn im selben Zug
 * aus. Genau deshalb steht die Sicherung im Sperrvorgang und nicht in der
 * Tabelle — ein Trigger könnte die beiden Absichten nicht unterscheiden.
 */
export async function resetPlatformAccount(
  platform: PlatformContext,
  id: string,
  now: Date = new Date(),
): Promise<Result<{ readonly token: string; readonly expiresAt: Date }, PlatformAccountError>> {
  if (id === platform.adminUserId) {
    return err({ kind: 'SELF' });
  }

  const account = await findAdminUserById(id);
  if (account === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const result = await resetAdmin(account.email, now);
  if (!result.ok) {
    return err({ kind: 'NOT_FOUND' });
  }

  logger.security('admin.account_reset', { by: platform.adminUserId, adminUserId: id });
  return ok(result.value);
}
