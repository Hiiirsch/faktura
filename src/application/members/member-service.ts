/**
 * Mitglieder verwalten (M8, FA-MEMB-04, -06, FA-ROLE-02, -04).
 *
 * Vier Handlungen, alle unter `organization.administer`: Rolle wechseln, Konto
 * sperren, Konto entsperren, Passwortzurücksetzung auslösen.
 *
 * **Ausscheiden heißt sperren, nicht löschen.** Ein Beleg behält seinen Urheber,
 * und die Nachvollziehbarkeit geht vor der Wiederverwendbarkeit einer Adresse
 * (Spec §12). Der Preis ist benannt und nicht behoben: Die Adresse bleibt
 * dauerhaft belegt.
 *
 * **Wer sperrt, beendet auch die Sitzungen.** Die Auflösung weist eine Sitzung
 * mit gesperrtem Konto zwar ohnehin ab und entfernt sie dabei — aber erst beim
 * nächsten Aufruf. Sie hier gleich zu löschen macht aus „beim nächsten Klick
 * draußen" ein „sofort draußen" und lässt keine Zeile stehen, die es nicht mehr
 * gibt.
 */
import type { Authorized } from '@/application/auth/authorize';
import { passwordResetExpiry } from '@/domain/auth/password-reset-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { generateRedemptionToken, hashToken } from '@/infrastructure/auth/tokens';
import {
  createPasswordReset,
  deleteSessionsForUser,
  deleteUnusedPasswordResets,
} from '@/infrastructure/repositories/auth-repository';
import { runInTransaction } from '@/infrastructure/repositories/client';
import {
  findMember,
  listMembers,
  type Member,
  updateMember,
} from '@/infrastructure/repositories/member-repository';
import {
  countActiveHoldersOf,
  findRole,
} from '@/infrastructure/repositories/role-repository';

export type { Member };

export type MemberError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'ROLE_NOT_FOUND' }
  /** Nähme dem Unternehmen die letzte Rechteverwaltung (FA-ROLE-04). */
  | { readonly kind: 'LAST_ADMINISTRATOR' }
  /**
   * Das eigene Konto sperrt man nicht.
   *
   * Nicht weil es unmöglich wäre — die Aussperrsicherung deckt den harten Fall
   * ab —, sondern weil es keinen Vorgang gibt, den es abbildet. Wer geht, wird
   * von jemandem gesperrt, der bleibt.
   */
  | { readonly kind: 'SELF' };

const ADMINISTER = 'organization.administer';

export async function getMembers(
  context: Authorized<'organization.administer'>,
): Promise<readonly Member[]> {
  return listMembers(context);
}

/**
 * Ob dieses Konto die letzte aktive Rechteverwaltung ist.
 *
 * Die Zusage liegt im Trigger `Organization_keeps_administrator_*`; diese
 * Abfrage ist die Erklärung davor. Sie prüft beides: dass das Konto das Recht
 * überhaupt hält, und dass es das einzige ist, das es hält.
 */
async function isLastAdministrator(
  context: Authorized<'organization.administer'>,
  member: Member,
): Promise<boolean> {
  if (member.role === null) {
    return false;
  }

  const role = await findRole(context, member.role.id);
  const holdsIt = role?.permissions.some((entry) => entry.permissionKey === ADMINISTER) === true;

  if (!holdsIt) {
    return false;
  }

  return (await countActiveHoldersOf(context, ADMINISTER)) <= 1;
}

export async function changeMemberRole(
  context: Authorized<'organization.administer'>,
  memberId: string,
  roleId: string,
  actorId: string,
  ipAddress: string | null,
): Promise<Result<null, MemberError>> {
  const member = await findMember(context, memberId);
  if (member === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const role = await findRole(context, roleId);
  if (role === null) {
    return err({ kind: 'ROLE_NOT_FOUND' });
  }

  const keepsAdminister = role.permissions.some((entry) => entry.permissionKey === ADMINISTER);
  if (!keepsAdminister && (await isLastAdministrator(context, member))) {
    return err({ kind: 'LAST_ADMINISTRATOR' });
  }

  await updateMember(context, memberId, { roleId });

  await recordAuditEntry(context, {
    entityType: 'User',
    entityId: memberId,
    action: 'ROLE_ASSIGNED',
    actorId,
    ipAddress,
    details: { role: role.name, previousRole: member.role?.name ?? null },
  });

  return ok(null);
}

export async function setMemberDisabled(
  context: Authorized<'organization.administer'>,
  memberId: string,
  disabled: boolean,
  actorId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<null, MemberError>> {
  if (memberId === actorId) {
    return err({ kind: 'SELF' });
  }

  const member = await findMember(context, memberId);
  if (member === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  if (disabled && (await isLastAdministrator(context, member))) {
    return err({ kind: 'LAST_ADMINISTRATOR' });
  }

  await runInTransaction(async (handle) => {
    await updateMember(context, memberId, { disabledAt: disabled ? now : null }, handle);

    if (disabled) {
      await deleteSessionsForUser(memberId, undefined, handle);
      // Ein offener Zurücksetzungslink wäre ein Weg zurück in ein gesperrtes
      // Konto. Er hilft nicht — die Auflösung weist es ab —, aber er soll auch
      // nicht herumliegen.
      await deleteUnusedPasswordResets(memberId, handle);
    }
  });

  await recordAuditEntry(context, {
    entityType: 'User',
    entityId: memberId,
    action: disabled ? 'DISABLED' : 'ENABLED',
    actorId,
    ipAddress,
  });

  return ok(null);
}

/**
 * Stellt einen Zurücksetzungsnachweis aus (FA-MEMB-04).
 *
 * Was hier **nicht** geschieht: ein Passwort setzen. Die Rechteverwaltung löst
 * den Vorgang aus und gibt den Link weiter; das Passwort kennt danach genau
 * eine Person. Ein Verfahren, in dem die Verwaltung ein Passwort vergibt, hätte
 * immer zwei Wissende — und der erste Wechsel danach wäre freiwillig.
 *
 * Der Token verlässt diese Schicht genau einmal, wie bei der Einladung.
 */
export async function startPasswordReset(
  context: Authorized<'organization.administer'>,
  memberId: string,
  actorId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<{ readonly token: string; readonly expiresAt: Date }, MemberError>> {
  const member = await findMember(context, memberId);
  if (member === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const token = generateRedemptionToken();
  const expiresAt = passwordResetExpiry(now);

  await runInTransaction(async (handle) => {
    // Ein neuer Nachweis entwertet ältere — dieselbe Regel wie beim zweiten
    // Anmeldeschritt.
    await deleteUnusedPasswordResets(memberId, handle);
    await createPasswordReset({ userId: memberId, tokenHash: hashToken(token), expiresAt }, handle);
  });

  await recordAuditEntry(context, {
    entityType: 'User',
    entityId: memberId,
    action: 'PASSWORD_RESET_REQUESTED',
    actorId,
    ipAddress,
  });

  return ok({ token, expiresAt });
}
