/**
 * Schreibzugriff auf das Protokoll (NFA-COMP-01, NFA-SEC-08).
 *
 * Einträge werden ausschließlich angelegt. Es gibt hier bewusst keine Funktion
 * zum Ändern oder Löschen; auf Datenbankebene wehren Trigger beides ab
 * (NFA-COMP-02).
 *
 * Jeder Eintrag gehört zu einer Organisation — auch die Anmeldeereignisse:
 * Ohne Zuordnung stünde im Protokoll der einen Organisation, wer sich bei
 * einer anderen angemeldet hat.
 *
 * Was hier hineingeschrieben wird, unterliegt NFA-BETR-10: keine Passwörter,
 * keine Token, keine vollständigen Kundendatensätze.
 */
import {
  createAuditEntry,
  createPlatformAuditEntry,
} from '@/infrastructure/repositories/audit-repository';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';
import type { PlatformContext } from '@/infrastructure/repositories/platform-context';

export type AuditAction =
  // Stammdaten (FA-STAMM-09, NFA-COMP-01)
  | 'CREATED'
  | 'UPDATED'
  | 'ARCHIVED'
  | 'UNARCHIVED'
  // Belege (FA-STAT-11, NFA-COMP-01)
  | 'ISSUED'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_REMOVED'
  | 'PAID'
  | 'CANCELLED'
  | 'DELETED'
  | 'DUPLICATED'
  // Authentifizierung
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'LOGOUT'
  | 'SESSION_REVOKED'
  | 'SESSIONS_REVOKED_ALL'
  | 'TOTP_ENABLED'
  | 'TOTP_DISABLED'
  | 'RECOVERY_CODE_USED'
  | 'RECOVERY_CODES_REGENERATED'
  | 'USER_CREATED'
  // Mitglieder und Rollen (M8, FA-MEMB-*, FA-ROLE-*)
  | 'INVITED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_ACCEPTED'
  | 'ROLE_ASSIGNED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'DISABLED'
  | 'ENABLED'
  // Eingriffe der Verwaltung (M8, FA-ADM-05, -07)
  | 'ORGANIZATION_CREATED'
  | 'SUSPENDED'
  | 'RESUMED';

export type AuditEntry = {
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly actorId?: string | null;
  readonly ipAddress?: string | null;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
};

export async function recordAuditEntry(
  context: OrganizationContext,
  entry: AuditEntry,
): Promise<void> {
  await createAuditEntry(context, {
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actorId ?? null,
    ipAddress: entry.ipAddress ?? null,
    diffJson: entry.details === undefined ? null : JSON.stringify(entry.details),
  });
}

/**
 * Ein Eintrag, den die **Verwaltung** schreibt (M8, FA-ADM-07).
 *
 * Er landet im Protokoll des betroffenen Unternehmens und trägt
 * `actorKind: 'ADMIN'`. Der Betreiber hat keinen Mandantenkontext; die Kennung
 * der Organisation kommt aus dem Gegenstand seiner Handlung.
 */
export async function recordPlatformAuditEntry(
  platform: PlatformContext,
  organizationId: string,
  entry: AuditEntry,
): Promise<void> {
  await createPlatformAuditEntry(platform, organizationId, {
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actorId ?? null,
    ipAddress: entry.ipAddress ?? null,
    diffJson: entry.details === undefined ? null : JSON.stringify(entry.details),
  });
}
