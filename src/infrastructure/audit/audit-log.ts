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
import { createAuditEntry } from '@/infrastructure/repositories/audit-repository';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';

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
  | 'USER_CREATED';

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
