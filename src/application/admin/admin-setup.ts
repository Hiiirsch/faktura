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
import { logger } from '@/infrastructure/logging/logger';
import {
  createAdminInvitation,
  findAdminInvitationByTokenHash,
  findAdminUserByEmail,
  redeemAdminInvitation,
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
  | { readonly kind: 'EMAIL_TAKEN' };

/** Was die Einrichtungsseite zeigt, bevor sich jemand ausweist. */
export type AdminSetupOffer = {
  readonly email: string;
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
): Promise<Result<{ readonly token: string; readonly expiresAt: Date }, AdminSetupError>> {
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
    expiresAt,
  });

  logger.security('admin.invitation_created', { email: address });

  return ok({ token, expiresAt });
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
      secret: invitation.totpSecret,
      uri: buildTotpUri(invitation.totpSecret, invitation.email, getEnv().APP_NAME),
    },
  };
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

  // Zwischen dem Ausstellen und dem Einlösen kann ein anderer Weg dieselbe
  // Adresse belegt haben — der Notfallweg auf der Kommandozeile etwa.
  if ((await findAdminUserByEmail(invitation.email)) !== null) {
    return err({ kind: 'EMAIL_TAKEN' });
  }

  const name = data.name.trim();

  const admin = await redeemAdminInvitation(
    invitation.id,
    {
      email: invitation.email,
      name: name.length === 0 ? null : name,
      passwordHash: await hashPassword(data.password),
      totpSecret: invitation.totpSecret,
    },
    now,
  );

  logger.security('admin.account_created', { adminUserId: admin.id });

  return ok(null);
}
