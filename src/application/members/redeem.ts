/**
 * Einlösen ohne Sitzung (M8, FA-MEMB-02..05).
 *
 * Zwei Vorgänge, die dieselbe Ausgangslage haben: Wer sie auslöst, ist
 * **niemand** — kein Konto, keine Sitzung, keine Organisation. Nur ein Token in
 * einer Adresse.
 *
 * - Eine Einladung annehmen: Das Konto entsteht dabei.
 * - Ein Passwort neu setzen: Das Konto gibt es, aber sein Inhaber kommt gerade
 *   nicht hinein.
 *
 * **Warum diese beiden in einer eigenen Datei stehen.** Sie sind die dritte
 * dokumentierte Stelle, die `organizationContextOf()` aufruft — nach der
 * Sitzungsauflösung und der Anmeldung. Der Grund ist derselbe: Welche
 * Organisation gemeint ist, ist das *Ergebnis* der Abfrage, nicht ihre
 * Bedingung. Läge das in `member-service.ts`, stünde die Ausnahme neben
 * Funktionen, die einen Kontext verlangen, und wäre deren Vorbild. So trägt eine
 * Datei die Ausnahme, und ihr Name sagt, worin sie besteht.
 *
 * **Alle Fehlerfälle antworten gleich** (FA-MEMB-05): unbekannt, abgelaufen,
 * zurückgezogen, bereits eingelöst, Unternehmen stillgelegt. Wer einen Link
 * ausprobiert, soll nicht erfahren, welcher davon zutrifft — sonst ließe sich
 * aus der Antwort ablesen, ob eine Adresse eingeladen wurde.
 *
 * **Kein automatisches Anmelden.** Nach dem Setzen des Passworts geht es zur
 * Anmeldung. Ein Link, der eine Sitzung eröffnet, wäre ein Passwortersatz mit
 * sieben Tagen Gültigkeit — und läge in einem Postfach.
 */
import {
  isInvitationExpired,
} from '@/domain/auth/invitation-policy';
import {
  type PasswordViolation,
  validatePassword,
} from '@/domain/auth/password-policy';
import { isPasswordResetExpired } from '@/domain/auth/password-reset-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { isCompromisedPassword } from '@/infrastructure/auth/compromised-passwords';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { hashToken } from '@/infrastructure/auth/tokens';
import { logger } from '@/infrastructure/logging/logger';
import {
  createUser,
  deleteSessionsForUser,
  deleteTrustedDevicesForUser,
  deleteUnusedPasswordResets,
  findPasswordResetByHash,
  findUserById,
  markPasswordResetUsed,
  updateUser,
} from '@/infrastructure/repositories/auth-repository';
import { runInTransaction } from '@/infrastructure/repositories/client';
import { findCompanyProfile } from '@/infrastructure/repositories/company-repository';
import {
  findInvitationByTokenHash,
  markInvitationAccepted,
} from '@/infrastructure/repositories/invitation-repository';
import { organizationContextOf } from '@/infrastructure/repositories/organization-context';

/** Die einzige Ablehnung, die ein Einlöseversuch je zu sehen bekommt. */
export type RedemptionError =
  | { readonly kind: 'INVALID' }
  | { readonly kind: 'PASSWORD'; readonly violations: readonly PasswordViolation[] };

/** Was die Einlöseseite anzeigen darf, bevor jemand sich ausweist. */
export type InvitationOffer = {
  readonly email: string;
  readonly organizationName: string;
  readonly roleName: string;
};

/**
 * Lädt eine Einladung zur Anzeige.
 *
 * Sie nennt Adresse, Unternehmen und Rolle — wer den Token hat, war gemeint, und
 * ohne diese drei Angaben wüsste er nicht, wofür er ein Passwort setzt. Mehr
 * steht nicht darin: keine Mitgliederliste, keine Geschäftsdaten.
 *
 * **Der Name des Unternehmens ist der aus den Firmendaten**, nicht
 * `Organization.name`. Letzteren hat der Betreiber beim Anlegen eingetragen; die
 * Seitenleiste zeigt seit M5.5b den `legalName` aus den Firmendaten. Zwei
 * verschiedene Namen für dasselbe Unternehmen — einer in der Einladung, ein
 * anderer nach dem Anmelden — sind ein Zweifel an der richtigen Stelle.
 * `Organization.name` bleibt der Rückfall, solange keine Firmendaten erfasst
 * sind.
 */
export async function loadInvitation(
  token: string,
  now: Date = new Date(),
): Promise<Result<InvitationOffer, RedemptionError>> {
  const invitation = await findInvitationByTokenHash(hashToken(token));

  if (
    invitation === null ||
    invitation.acceptedAt !== null ||
    invitation.revokedAt !== null ||
    invitation.organization.suspendedAt !== null ||
    isInvitationExpired(invitation.expiresAt, now)
  ) {
    return err({ kind: 'INVALID' });
  }

  const company = await findCompanyProfile(organizationContextOf(invitation.organizationId));
  const legalName = company?.legalName ?? '';

  return ok({
    email: invitation.email,
    organizationName: legalName.length === 0 ? invitation.organization.name : legalName,
    roleName: invitation.role.name,
  });
}

/**
 * Nimmt eine Einladung an: Konto anlegen, Passwort setzen, Einladung verbrauchen.
 *
 * Das Passwort wird **hier** zum ersten Mal gesehen und sofort gehasht; es gibt
 * keinen Weg, auf dem ein anderes Konto es erfahren könnte (FA-MEMB-03).
 */
export async function acceptInvitation(
  token: string,
  data: { readonly name: string; readonly password: string },
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<null, RedemptionError>> {
  const invitation = await findInvitationByTokenHash(hashToken(token));

  if (
    invitation === null ||
    invitation.acceptedAt !== null ||
    invitation.revokedAt !== null ||
    invitation.organization.suspendedAt !== null ||
    isInvitationExpired(invitation.expiresAt, now)
  ) {
    return err({ kind: 'INVALID' });
  }

  const violations = validatePassword(data.password, isCompromisedPassword);
  if (violations.length > 0) {
    return err({ kind: 'PASSWORD', violations });
  }

  const passwordHash = await hashPassword(data.password);
  const name = data.name.trim();

  const created = await runInTransaction(async (handle) => {
    const user = await createUser(
      {
        email: invitation.email,
        passwordHash,
        name: name.length === 0 ? null : name,
        organizationId: invitation.organizationId,
        roleId: invitation.roleId,
      },
      handle,
    );

    await markInvitationAccepted(invitation.id, now, handle);
    return user;
  });

  /*
   * Der Kontext entsteht hier aus der Einladung — der einzige Grund, weshalb
   * diese Datei `organizationContextOf` aufruft. Das Protokoll gehört zu dem
   * Unternehmen, in dem das Konto entstanden ist; ohne Zuordnung stünde der
   * Eintrag nirgends.
   */
  const context = organizationContextOf(invitation.organizationId);

  await recordAuditEntry(context, {
    entityType: 'User',
    entityId: created.id,
    action: 'INVITATION_ACCEPTED',
    actorId: created.id,
    ipAddress,
    details: { email: invitation.email, invitationId: invitation.id },
  });

  logger.security('invitation.accepted', { userId: created.id, ipAddress });

  return ok(null);
}

/** Lädt eine Zurücksetzung zur Anzeige — sie nennt nur die Adresse. */
export async function loadPasswordReset(
  token: string,
  now: Date = new Date(),
): Promise<Result<{ readonly email: string }, RedemptionError>> {
  const reset = await findPasswordResetByHash(hashToken(token));
  if (reset === null || reset.usedAt !== null || isPasswordResetExpired(reset.expiresAt, now)) {
    return err({ kind: 'INVALID' });
  }

  const user = await findUserById(reset.userId);
  if (user === null || user.disabledAt !== null || user.organization.suspendedAt !== null) {
    return err({ kind: 'INVALID' });
  }

  return ok({ email: user.email });
}

/**
 * Setzt ein neues Passwort und beendet **alle** Sitzungen des Kontos.
 *
 * Das Beenden ist der Punkt: Wer sein Passwort zurücksetzt, tut das oft, weil
 * jemand anders es kannte. Bliebe eine Sitzung offen, hätte der Wechsel nichts
 * bewirkt. Aus demselben Grund fällt die Anmeldesperre: Der Zähler gehört zum
 * alten Passwort.
 */
export async function completePasswordReset(
  token: string,
  password: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<null, RedemptionError>> {
  const reset = await findPasswordResetByHash(hashToken(token));
  if (reset === null || reset.usedAt !== null || isPasswordResetExpired(reset.expiresAt, now)) {
    return err({ kind: 'INVALID' });
  }

  const user = await findUserById(reset.userId);
  if (user === null || user.disabledAt !== null || user.organization.suspendedAt !== null) {
    return err({ kind: 'INVALID' });
  }

  const violations = validatePassword(password, isCompromisedPassword);
  if (violations.length > 0) {
    return err({ kind: 'PASSWORD', violations });
  }

  const passwordHash = await hashPassword(password);

  await runInTransaction(async (handle) => {
    await updateUser(
      user.id,
      { passwordHash, failedLogins: 0, lockedUntil: null },
      handle,
    );
    await markPasswordResetUsed(reset.id, now, handle);
    // Der eingelöste Nachweis bleibt als Spur; nur die noch offenen fallen.
    await deleteUnusedPasswordResets(user.id, handle);
    await deleteSessionsForUser(user.id, undefined, handle);
    /*
     * Und die vertrauten Geräte (M9, FA-TRUST-04).
     *
     * Ohne diese Zeile bliebe die Zurücksetzung an der entscheidenden Stelle
     * wirkungslos: Wer das alte Passwort kannte und ein vertrautes Gerät hat,
     * käme weiterhin ohne zweiten Faktor hinein — und die Zurücksetzung wurde ja
     * gerade deshalb ausgelöst.
     */
    await deleteTrustedDevicesForUser(user.id, handle);
  });

  await recordAuditEntry(organizationContextOf(user.organizationId), {
    entityType: 'User',
    entityId: user.id,
    action: 'PASSWORD_RESET_COMPLETED',
    actorId: user.id,
    ipAddress,
  });

  logger.security('password_reset.completed', { userId: user.id, ipAddress });

  return ok(null);
}
