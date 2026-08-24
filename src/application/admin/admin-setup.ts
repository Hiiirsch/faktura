/**
 * Einrichtung eines Betreiberkontos (M8, FA-ADM-06, -08).
 *
 * **Warum das Konto erst beim Einlösen entsteht.** Bis hierher legte
 * `admin:create` es unmittelbar an und gab das TOTP-Geheimnis im Terminal aus.
 * Sicher war das — ein Betreiberkonto ohne zweiten Faktor gab es nie —, aber das
 * Geheimnis musste durch einen Scrollback und von Hand abgetippt werden.
 *
 * Jetzt entsteht zuerst nur ein Nachweis. Passwort und zweiter Faktor werden im
 * Browser gesetzt, der QR-Code kommt aus dem eigenen Prozess. Der `AdminUser`
 * entsteht beim Einlösen, vollständig, in einer Transaktion.
 *
 * **Die Zusage bleibt dieselbe:** Es gibt zu keinem Zeitpunkt ein
 * Betreiberkonto ohne zweiten Faktor. Der naheliegende andere Weg — Konto mit
 * Passwort anlegen, Einrichtung beim ersten Login erzwingen — hätte genau das
 * aufgegeben: Zwischen Anlage und erster Anmeldung stünde ein Konto, das nur ein
 * Passwort kennt, und wer sich zuerst anmeldet, richtet **seinen** Authenticator
 * ein.
 *
 * **Ohne Sitzung**, wie `members/redeem.ts`: Wer den Nachweis vorlegt, ist noch
 * niemand. Anders als dort gibt es hier keinen Mandantenkontext, den man
 * herstellen müsste — ein Betreiberkonto gehört zu keinem Unternehmen.
 */
import { adminSetupExpiry, isAdminSetupExpired } from '@/domain/auth/admin-setup-policy';
import { type PasswordViolation, validatePassword } from '@/domain/auth/password-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import { isCompromisedPassword } from '@/infrastructure/auth/compromised-passwords';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { generateRedemptionToken, hashToken } from '@/infrastructure/auth/tokens';
import { buildTotpUri, generateTotpSecret, verifyTotpCode } from '@/infrastructure/auth/totp';
import { getEnv } from '@/infrastructure/config/env';
import { deliverAdminSetup, type Delivery } from '@/application/notifications/deliver';
import { logger } from '@/infrastructure/logging/logger';
import {
  createAdminInvitation,
  findAdminInvitationByTokenHash,
  findAdminUserByEmail,
  redeemAdminInvitation,
  reenrollAdminUser,
  suspendAdminForReset,
} from '@/infrastructure/repositories/platform-repository';

export type AdminSetupError =
  /**
   * Die einzige Ablehnung, die ein Einlöseversuch zu sehen bekommt.
   *
   * Unbekannt, abgelaufen, zurückgezogen, schon eingelöst — dieselbe Antwort,
   * aus demselben Grund wie bei den Mitgliedern (FA-MEMB-05): Die
   * Unterscheidung wäre eine Auskunft darüber, ob es einen Nachweis gab.
   */
  | { readonly kind: 'INVALID' }
  | { readonly kind: 'PASSWORD'; readonly violations: readonly PasswordViolation[] }
  | { readonly kind: 'INVALID_CODE' }
  /** Die Adresse gehört schon zu einem Betreiberkonto. */
  | { readonly kind: 'EMAIL_TAKEN' }
  /** Zu dieser Adresse gibt es kein Betreiberkonto, das zurückzusetzen wäre. */
  | { readonly kind: 'NO_ACCOUNT' };

/** Was die Einrichtungsseite zeigt, bevor sich jemand ausweist. */
export type AdminSetupOffer = {
  readonly email: string;
  /** Ob ein Konto entsteht oder ein vorhandenes neue Zugangsdaten bekommt. */
  readonly kind: 'CREATE' | 'RESET';
  /** Das Geheimnis im Klartext — für die Eingabe von Hand ohne Kamera. */
  readonly secret: string;
  /** `otpauth://`-URI, aus der die Seite den QR-Code erzeugt. */
  readonly uri: string;
};

/**
 * Stellt einen Einrichtungsnachweis aus — aufgerufen von `npm run admin:create`.
 *
 * Der Token verlässt diese Schicht **genau einmal**, als Rückgabewert.
 * Gespeichert ist nur sein SHA-256-Hash; wer den Link verliert, lässt einen
 * neuen ausstellen und entwertet damit den alten.
 */
export async function inviteAdmin(
  email: string,
  now: Date = new Date(),
): Promise<
  Result<
    { readonly token: string; readonly expiresAt: Date; readonly delivery: Delivery },
    AdminSetupError
  >
> {
  const address = email.trim().toLowerCase();

  if ((await findAdminUserByEmail(address)) !== null) {
    return err({ kind: 'EMAIL_TAKEN' });
  }

  const token = generateRedemptionToken();
  const expiresAt = adminSetupExpiry(now);

  await createAdminInvitation({
    email: address,
    tokenHash: hashToken(token),
    // Das Geheimnis entsteht **jetzt** und nicht beim Anzeigen der Seite: Sonst
    // erzeugte jedes Neuladen ein neues, und wer den ersten QR-Code gescannt
    // hat, bestätigte gegen das zweite.
    totpSecret: generateTotpSecret(),
    kind: 'CREATE',
    expiresAt,
  });

  logger.security('admin.invitation_created', { email: address });

  // Zugestellt wird zusätzlich; der Link steht weiterhin im Terminal
  // beziehungsweise in der Oberfläche (M14).
  const delivery = await deliverAdminSetup(address, token, expiresAt);

  return ok({ token, expiresAt, delivery });
}

/** Lädt den Nachweis zur Anzeige: Adresse, Geheimnis und `otpauth://`-URI. */
export async function loadAdminSetup(
  token: string,
  now: Date = new Date(),
): Promise<Result<AdminSetupOffer, AdminSetupError>> {
  const invitation = await findAdminInvitationByTokenHash(hashToken(token));

  if (
    invitation === null ||
    invitation.acceptedAt !== null ||
    invitation.revokedAt !== null ||
    isAdminSetupExpired(invitation.expiresAt, now)
  ) {
    return err({ kind: 'INVALID' });
  }

  return {
    ok: true,
    value: {
      email: invitation.email,
      kind: invitation.kind === 'RESET' ? 'RESET' : 'CREATE',
      secret: invitation.totpSecret,
      uri: buildTotpUri(invitation.totpSecret, invitation.email, getEnv().APP_NAME),
    },
  };
}

/**
 * Setzt ein vorhandenes Betreiberkonto zurück (M8).
 *
 * Für den Fall, dass der Authenticator verloren ist: Für Betreiberkonten gibt es
 * keine Wiederherstellungscodes, und ohne diesen Weg bliebe nur ein Eingriff in
 * die Datenbank.
 *
 * **Das Konto bleibt bestehen.** Es wird gesperrt und bekommt beim Einlösen
 * neue Zugangsdaten. Es zu löschen und neu anzulegen wäre einfacher gewesen und
 * hätte das Protokoll beschädigt: Es nennt den Betreiber über seine Kennung, und
 * die eines gelöschten Kontos zeigt ins Leere.
 *
 * **Gesperrt ab sofort**, nicht erst beim Einlösen: Wer den Reset auslöst, tut
 * das, weil etwas abhandengekommen ist. Bis der Nachweis eingelöst ist, soll
 * auch ein bekanntes Passwort nicht mehr genügen.
 */
export async function resetAdmin(
  email: string,
  now: Date = new Date(),
): Promise<
  Result<
    { readonly token: string; readonly expiresAt: Date; readonly delivery: Delivery },
    AdminSetupError
  >
> {
  const address = email.trim().toLowerCase();
  const admin = await findAdminUserByEmail(address);

  if (admin === null) {
    return err({ kind: 'NO_ACCOUNT' });
  }

  const token = generateRedemptionToken();
  const expiresAt = adminSetupExpiry(now);

  await suspendAdminForReset(
    admin.id,
    {
      email: address,
      tokenHash: hashToken(token),
      totpSecret: generateTotpSecret(),
      expiresAt,
    },
    now,
  );

  logger.security('admin.reset_started', { adminUserId: admin.id });

  // Zugestellt wird zusätzlich; der Link steht weiterhin im Terminal
  // beziehungsweise in der Oberfläche (M14).
  const delivery = await deliverAdminSetup(address, token, expiresAt);

  return ok({ token, expiresAt, delivery });
}

/**
 * Löst den Nachweis ein: Konto anlegen, zweiten Faktor aktivieren, Nachweis
 * verbrauchen.
 *
 * Der Code wird **vor** dem Anlegen geprüft. Ein Konto, dessen Authenticator
 * nachweislich nicht stimmt, wäre von der ersten Sekunde an unbenutzbar — und
 * für Betreiberkonten gibt es keine Wiederherstellungscodes.
 */
export async function completeAdminSetup(
  token: string,
  data: { readonly name: string; readonly password: string; readonly code: string },
  now: Date = new Date(),
): Promise<Result<null, AdminSetupError>> {
  const invitation = await findAdminInvitationByTokenHash(hashToken(token));

  if (
    invitation === null ||
    invitation.acceptedAt !== null ||
    invitation.revokedAt !== null ||
    isAdminSetupExpired(invitation.expiresAt, now)
  ) {
    return err({ kind: 'INVALID' });
  }

  const violations = validatePassword(data.password, isCompromisedPassword);
  if (violations.length > 0) {
    return err({ kind: 'PASSWORD', violations });
  }

  if (!verifyTotpCode(invitation.totpSecret, data.code.trim(), getEnv().APP_NAME)) {
    return err({ kind: 'INVALID_CODE' });
  }

  const name = data.name.trim();
  const passwordHash = await hashPassword(data.password);
  const existing = await findAdminUserByEmail(invitation.email);

  /*
   * Die Lage muss zur Absicht passen.
   *
   * Ohne diese Prüfung könnte ein Nachweis, der für ein **neues** Konto
   * ausgestellt wurde, ein Konto überschreiben, das inzwischen auf anderem Weg
   * entstanden ist — und ein Reset-Nachweis ein Konto anlegen, das jemand
   * zwischenzeitlich entfernt hat. Ein unbekannter Wert in `kind` fällt durch
   * beide Zweige und scheitert; das ist die sichere Richtung.
   */
  if (invitation.kind === 'CREATE') {
    if (existing !== null) {
      return err({ kind: 'EMAIL_TAKEN' });
    }

    const admin = await redeemAdminInvitation(
      invitation.id,
      {
        email: invitation.email,
        name: name.length === 0 ? null : name,
        passwordHash,
        totpSecret: invitation.totpSecret,
      },
      now,
    );

    logger.security('admin.account_created', { adminUserId: admin.id });
    return ok(null);
  }

  if (invitation.kind === 'RESET' && existing !== null) {
    await reenrollAdminUser(
      invitation.id,
      existing.id,
      {
        name: name.length === 0 ? existing.name : name,
        passwordHash,
        totpSecret: invitation.totpSecret,
      },
      now,
    );

    logger.security('admin.reset_completed', { adminUserId: existing.id });
    return ok(null);
  }

  return err({ kind: 'INVALID' });
}
