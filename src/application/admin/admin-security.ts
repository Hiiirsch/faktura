/**
 * Die eigene Sicherheit eines Betreiberkontos (M14.1, FA-ADM-18, -19).
 *
 * **Warum es das bis jetzt nicht gab.** Ein Betreiberkonto entsteht über einen
 * Einrichtungslink, und derselbe Weg diente auch der Wiederherstellung: Wer
 * sein Passwort wechseln wollte, ließ sich von einem zweiten Betreiber
 * zurücksetzen oder rief `npm run admin:reset` auf dem Server auf. Das ist kein
 * Vorgang, das ist ein Umweg — und er setzt jedes Mal auch den zweiten Faktor
 * neu, was niemand will, der bloß sein Passwort ändern möchte.
 *
 * **Warum es trotzdem kein „Passwort vergessen" für die Verwaltung gibt.** Der
 * Unterschied liegt im Umfang des Nachweises: Beim Mandanten setzt ein
 * Zurücksetzungslink **nur** das Passwort, der zweite Faktor bleibt stehen. Beim
 * Betreiber muss er **beides** neu setzen, weil es für die Verwaltung keine
 * Wiederherstellungscodes gibt (FA-ADM-08). Ein Link im Postfach wäre damit ein
 * vollständiger Ersatz für Passwort **und** Authenticator — die verpflichtende
 * Zweifaktorauthentifizierung wäre ein Satz im Katalog und sonst nichts.
 *
 * Was hier entsteht, ist deshalb ausdrücklich **kein** Wiederherstellungsweg,
 * sondern der Wechsel bei bestehender Sitzung: Das alte Passwort wird verlangt,
 * und wer die Sitzung nicht hat, kommt hier nicht hin.
 */
import { validatePassword, type PasswordViolation } from '@/domain/auth/password-policy';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordPlatformEvent } from '@/infrastructure/audit/audit-log';
import { isCompromisedPassword } from '@/infrastructure/auth/compromised-passwords';
import { hashPassword, verifyPassword } from '@/infrastructure/auth/password-hasher';
import { logger } from '@/infrastructure/logging/logger';
import type { PlatformContext } from '@/infrastructure/repositories/platform-context';
import {
  deleteOtherAdminSessions,
  deleteOwnAdminSession,
  findAdminUserById,
  listAdminSessions,
  updateAdminPassword,
} from '@/infrastructure/repositories/platform-repository';

import { listPasskeys, type PasskeySummary } from '../auth/passkey-registration';

export type AdminSessionSummary = {
  readonly id: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly isCurrent: boolean;
};

export type AdminSecurityOverview = {
  readonly sessions: readonly AdminSessionSummary[];
  readonly passkeys: readonly PasskeySummary[];
};

export type AdminPasswordError =
  /** Das aktuelle Passwort stimmt nicht. */
  | { readonly kind: 'WRONG_PASSWORD' }
  | { readonly kind: 'PASSWORD'; readonly violations: readonly PasswordViolation[] }
  /** Das Konto ist verschwunden — nur erreichbar, wenn es währenddessen gelöscht wurde. */
  | { readonly kind: 'NOT_FOUND' };

/**
 * Eine Abfrage für die ganze Seite, damit der gezeigte Zustand in sich stimmt —
 * dieselbe Bauart wie `getSecurityOverview()` für Mandanten.
 */
export async function getAdminSecurityOverview(
  platform: PlatformContext,
  currentSessionId: string,
): Promise<AdminSecurityOverview> {
  const account = await findAdminUserById(platform.adminUserId);

  const [sessions, passkeys] = await Promise.all([
    listAdminSessions(platform, platform.adminUserId),
    listPasskeys({
      kind: 'admin',
      id: platform.adminUserId,
      email: account?.email ?? '',
      name: null,
    }),
  ]);

  return {
    sessions: sessions.map((entry) => ({ ...entry, isCurrent: entry.id === currentSessionId })),
    passkeys,
  };
}

/**
 * Wechselt das eigene Passwort.
 *
 * **Das alte wird verlangt**, obwohl die Sitzung schon steht. Ein übernommener
 * Bildschirm genügt sonst, um das Konto zu übernehmen — und die Sitzung ist der
 * einzige Nachweis, den ein Angreifer an dieser Stelle mitbringt.
 *
 * **Alle anderen Sitzungen enden**, die aufrufende nicht. Wer sein Passwort
 * wechselt, tut das oft genau deshalb, weil er einen fremden Zugriff vermutet;
 * bliebe der bestehen, hätte der Wechsel nichts bewirkt. Die eigene Sitzung
 * auch zu beenden, wäre die reinere Regel und würde jeden Wechsel mit einer
 * Neuanmeldung bestrafen — bei der Zurücksetzung durch einen anderen Betreiber
 * enden dagegen **alle**, weil dort niemand weiß, welche die richtige ist.
 *
 * Vertraute Geräte gibt es hier nicht (FA-ADM-08), also auch nichts zu
 * widerrufen.
 */
export async function changeAdminPassword(
  platform: PlatformContext,
  currentSessionId: string,
  data: { readonly currentPassword: string; readonly newPassword: string },
  ipAddress: string | null,
): Promise<Result<{ readonly endedSessions: number }, AdminPasswordError>> {
  const account = await findAdminUserById(platform.adminUserId);
  if (account === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  if (!(await verifyPassword(account.passwordHash, data.currentPassword))) {
    logger.security('admin.password_change_rejected', {
      adminUserId: platform.adminUserId,
      ipAddress,
    });
    return err({ kind: 'WRONG_PASSWORD' });
  }

  const violations = validatePassword(data.newPassword, isCompromisedPassword);
  if (violations.length > 0) {
    return err({ kind: 'PASSWORD', violations });
  }

  await updateAdminPassword(platform, platform.adminUserId, await hashPassword(data.newPassword));
  const endedSessions = await deleteOtherAdminSessions(
    platform,
    platform.adminUserId,
    currentSessionId,
  );

  await recordPlatformEvent(platform, {
    entityType: 'AdminUser',
    entityId: platform.adminUserId,
    action: 'ADMIN_PASSWORD_CHANGED',
    ipAddress,
    // Wie viele Sitzungen dabei endeten, ist die eigentliche Auskunft: Wer
    // hinterher nachliest, sieht, ob noch jemand angemeldet war.
    details: { endedSessions },
  });

  logger.security('admin.password_changed', { adminUserId: platform.adminUserId, endedSessions });

  return ok({ endedSessions });
}

/** Beendet eine einzelne eigene Sitzung. */
export async function revokeAdminSession(
  platform: PlatformContext,
  id: string,
): Promise<boolean> {
  const count = await deleteOwnAdminSession(platform, platform.adminUserId, id);
  if (count > 0) {
    logger.security('admin.session_revoked', { adminUserId: platform.adminUserId });
  }
  return count > 0;
}

/** Beendet alle Sitzungen außer der aufrufenden. */
export async function revokeOtherAdminSessions(
  platform: PlatformContext,
  currentSessionId: string,
): Promise<number> {
  const count = await deleteOtherAdminSessions(platform, platform.adminUserId, currentSessionId);
  logger.security('admin.other_sessions_revoked', {
    adminUserId: platform.adminUserId,
    count,
  });
  return count;
}
