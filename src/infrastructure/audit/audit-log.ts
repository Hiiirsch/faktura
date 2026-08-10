/**
 * Schreibzugriff auf das Protokoll (NFA-COMP-01, NFA-SEC-08).
 *
 * Einträge werden ausschließlich angelegt. Es gibt hier bewusst keine Funktion
 * zum Ändern oder Löschen — die Durchsetzung auf Datenbankebene folgt mit M4
 * (NFA-COMP-02).
 *
 * Was hier hineingeschrieben wird, unterliegt NFA-BETR-10: keine Passwörter,
 * keine Token, keine vollständigen Kundendatensätze.
 */
import { getPrismaClient } from '@/infrastructure/db/prisma';

export type AuditAction =
  // Stammdaten (FA-STAMM-09, NFA-COMP-01)
  | 'CREATED'
  | 'UPDATED'
  | 'ARCHIVED'
  | 'UNARCHIVED'
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

export async function recordAuditEntry(entry: AuditEntry): Promise<void> {
  await getPrismaClient().auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId ?? null,
      ipAddress: entry.ipAddress ?? null,
      diffJson: entry.details === undefined ? null : JSON.stringify(entry.details),
    },
  });
}
