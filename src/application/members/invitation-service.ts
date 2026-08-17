/**
 * Einladungen aussprechen und zurückziehen (M8, FA-MEMB-01, -02, -05, -07).
 *
 * **Die Anwendung versendet keine E-Mail.** Sie darf keine (NFA-COMP-05,
 * `tests/architecture/offline.test.ts`), und das ist hier kein Mangel, sondern
 * die Bauart: Der Link erscheint **genau einmal** in der Oberfläche — wie die
 * Wiederherstellungscodes — und wird außerhalb weitergereicht.
 *
 * Der Token verlässt diese Schicht deshalb genau einmal, als Rückgabewert von
 * `inviteMember`. Gespeichert ist nur sein SHA-256-Hash; ein zweiter Aufruf
 * kann ihn nicht wiederholen, weil ihn niemand mehr hat. Wer den Link verliert,
 * lädt neu ein — und entwertet damit den alten.
 */
import type { Authorized } from '@/application/auth/authorize';
import { invitationExpiry } from '@/domain/auth/invitation-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { generateRedemptionToken, hashToken } from '@/infrastructure/auth/tokens';
import { findUserByEmail } from '@/infrastructure/repositories/auth-repository';
import { runInTransaction } from '@/infrastructure/repositories/client';
import {
  createInvitation,
  type InvitationWithRole,
  listOpenInvitations,
  revokeInvitation,
  revokeOpenInvitationsFor,
} from '@/infrastructure/repositories/invitation-repository';
import { findRole } from '@/infrastructure/repositories/role-repository';

export type { InvitationWithRole };

export type InviteError =
  /**
   * Die Adresse gehört schon zu einem Konto — **irgendwo**.
   *
   * `User.email` ist global eindeutig: Eine Adresse gehört zu genau einem
   * Unternehmen. Die Meldung nennt deshalb nicht, zu welchem — das wäre eine
   * Auskunft über einen fremden Mandanten.
   */
  | { readonly kind: 'EMAIL_TAKEN' }
  | { readonly kind: 'ROLE_NOT_FOUND' }
  | { readonly kind: 'NOT_FOUND' };

/** Die Einladung samt dem Token, der genau hier einmal sichtbar wird. */
export type IssuedInvitation = {
  readonly invitation: { readonly id: string; readonly email: string; readonly expiresAt: Date };
  readonly token: string;
};

export async function getOpenInvitations(
  context: Authorized<'organization.administer'>,
): Promise<readonly InvitationWithRole[]> {
  return listOpenInvitations(context);
}

export async function inviteMember(
  context: Authorized<'organization.administer'>,
  data: { readonly email: string; readonly roleId: string },
  actorId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<IssuedInvitation, InviteError>> {
  const email = data.email.trim().toLowerCase();

  if ((await findUserByEmail(email)) !== null) {
    return err({ kind: 'EMAIL_TAKEN' });
  }

  // Die Rolle wird über den Kontext gesucht: Eine fremde Rollenkennung aus dem
  // Formular findet nichts. Der Trigger
  // `Invitation_role_matches_organization_insert` ist die zweite Ebene darunter.
  if ((await findRole(context, data.roleId)) === null) {
    return err({ kind: 'ROLE_NOT_FOUND' });
  }

  const token = generateRedemptionToken();

  const invitation = await runInTransaction(async (handle) => {
    /*
     * Erst zurückziehen, dann ausstellen.
     *
     * `Invitation_one_open_per_email` ist ein partieller eindeutiger Index und
     * kennt die Frist nicht — ein Index-`WHERE` darf in SQLite kein
     * `CURRENT_TIMESTAMP` nennen. Eine abgelaufene Einladung gilt dort also
     * weiter als offen und stünde einer neuen im Weg. Fachlich ist es ohnehin
     * richtig: Wer erneut einlädt, entwertet den alten Link (FA-MEMB-07).
     */
    await revokeOpenInvitationsFor(context, email, now, handle);

    return createInvitation(
      context,
      {
        email,
        roleId: data.roleId,
        tokenHash: hashToken(token),
        invitedById: actorId,
        expiresAt: invitationExpiry(now),
      },
      handle,
    );
  });

  await recordAuditEntry(context, {
    entityType: 'Invitation',
    entityId: invitation.id,
    action: 'INVITED',
    actorId,
    ipAddress,
    // Die Adresse steht im Protokoll, der Token nicht (NFA-BETR-10).
    details: { email, roleId: data.roleId },
  });

  return ok({
    invitation: { id: invitation.id, email, expiresAt: invitation.expiresAt },
    token,
  });
}

/**
 * Zieht eine Einladung zurück.
 *
 * Für den Empfänger des Links **ununterscheidbar** von abgelaufen und von
 * unbekannt (FA-MEMB-05) — die Einlöseseite beantwortet alle drei gleich.
 */
export async function withdrawInvitation(
  context: Authorized<'organization.administer'>,
  id: string,
  actorId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<null, InviteError>> {
  const revoked = await revokeInvitation(context, id, now);
  if (revoked === 0) {
    return err({ kind: 'NOT_FOUND' });
  }

  await recordAuditEntry(context, {
    entityType: 'Invitation',
    entityId: id,
    action: 'INVITATION_REVOKED',
    actorId,
    ipAddress,
  });

  return ok(null);
}
