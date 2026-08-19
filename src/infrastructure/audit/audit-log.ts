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
import {
  createPlatformAuditEntry,
  createPlatformAuditRow,
} from '@/infrastructure/repositories/platform-repository';
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
  | 'RESUMED'
  /**
   * Ein Konto unkenntlich gemacht (M10, FA-ADM-15).
   *
   * Bewusst nicht `DELETED`: Gelöscht wird nichts. Die Zeile bleibt, damit der
   * Beleg seinen Urheber und dieser Eintrag seinen Akteur behält.
   */
  | 'ANONYMIZED'
  // Betreiberkonten (M10, FA-ADM-12, -14). Sie betreffen kein Unternehmen und
  // stehen deshalb ausschließlich im Protokoll der Anlage.
  | 'ADMIN_INVITED'
  | 'ADMIN_DISABLED'
  | 'ADMIN_ENABLED'
  | 'ADMIN_RESET';

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
 * Ein Eintrag, den die **Verwaltung** schreibt (M8, FA-ADM-07; M10, FA-ADM-14).
 *
 * Er landet an **zwei** Stellen, und beide sind nötig:
 *
 * - im Protokoll des betroffenen **Unternehmens**, mit `actorKind: 'ADMIN'` —
 *   wer dort liest, soll sehen, dass eine Stilllegung von außen kam;
 * - im Protokoll der **Anlage**, das der Betreiber selbst einsehen kann.
 *
 * Doppelt aufgezeichnet, weil es zwei Leserschaften mit zwei Reichweiten sind.
 * Der Betreiber liest dafür **nie** das Protokoll eines Mandanten: Es enthält
 * Rechnungsnummern und Beträge, und eine Ansicht, die nur durch ein `where`
 * davon getrennt wäre, hinge an einem vergessenen Filter.
 *
 * Beide Schreibvorgänge stehen hier, nicht bei den Aufrufern: Sechs Stellen
 * rufen diese Funktion, und die siebte hätte die zweite Aufzeichnung vergessen.
 */
export async function recordPlatformAuditEntry(
  platform: PlatformContext,
  organizationId: string,
  entry: AuditEntry,
): Promise<void> {
  const detailsJson = entry.details === undefined ? null : JSON.stringify(entry.details);

  await createPlatformAuditEntry(platform, organizationId, {
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actorId ?? null,
    ipAddress: entry.ipAddress ?? null,
    diffJson: detailsJson,
  });

  await createPlatformAuditRow(platform, {
    organizationId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    detailsJson,
    ipAddress: entry.ipAddress ?? null,
  });
}

/**
 * Ein Vorgang der Verwaltung **ohne Unternehmensbezug** (M10, FA-ADM-14).
 *
 * Betreiberkonten einladen, sperren, zurücksetzen: Es gibt kein Unternehmen, in
 * dessen Protokoll das gehörte, und `AuditLog` verlangt eine Organisation. Genau
 * diese Vorgänge wären in der ersten Fassung des Protokolls unsichtbar geblieben
 * — eine Seite mit dem Titel „Protokoll der Verwaltung", die die Hälfte davon
 * verschweigt.
 */
export async function recordPlatformEvent(
  platform: PlatformContext,
  entry: Omit<AuditEntry, 'actorId'>,
): Promise<void> {
  await createPlatformAuditRow(platform, {
    organizationId: null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    detailsJson: entry.details === undefined ? null : JSON.stringify(entry.details),
    ipAddress: entry.ipAddress ?? null,
  });
}
