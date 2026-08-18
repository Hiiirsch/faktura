/**
 * Unternehmensverwaltung aus der Sicht des Betreibers (M8, FA-ORG-01..03,
 * FA-ADM-03, -05).
 *
 * Erster Parameter ist überall der `PlatformContext` — dasselbe Muster wie der
 * `OrganizationContext` in der Mandantenschicht, mit derselben Wirkung: Ohne
 * Adminsitzung lässt sich keine dieser Funktionen aufrufen, und mit ihr kommt
 * man an keine Geschäftsdaten.
 *
 * **Was der Betreiber sieht, sind Zahlen.** Kontenzahl, Belegzahl, Kundenzahl,
 * letzte Anmeldung. Aus einer Anzahl lässt sich kein Beleg rekonstruieren, und
 * ohne sie könnte er nicht einmal erkennen, ob ein Unternehmen die Anwendung
 * benutzt. Die Grenze steht in `platform-repository.ts` und wird am Quelltext
 * geprüft — in zwei Formen, weil ein `include: { invoices: true }` einem
 * `_count` zum Verwechseln ähnlich sieht.
 *
 * **Was er nicht kann:** ein Mandantenpasswort erfahren. Beim Anlegen entsteht
 * eine Einladung; das Passwort setzt der Inhaber selbst. Es gibt keinen Weg vom
 * Adminkonto in einen Mandanten, und er fehlt nicht aus Nachlässigkeit, sondern
 * weil ihn niemand gebaut hat (FA-ADM-04).
 */
import type { PlatformContext } from '@/application/admin/admin-session-service';
import { invitationExpiry } from '@/domain/auth/invitation-policy';
import { ALL_PERMISSION_KEYS } from '@/domain/policy/can';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordPlatformAuditEntry } from '@/infrastructure/audit/audit-log';
import { generateRedemptionToken, hashToken } from '@/infrastructure/auth/tokens';
import { findUserByEmail } from '@/infrastructure/repositories/auth-repository';
import { logger } from '@/infrastructure/logging/logger';
import {
  countOrganizations,
  createOrganizationWithOwner,
  deleteSessionsOfOrganization,
  findOrganizationWithMetrics,
  findUserForPlatform,
  listOrganizationsWithMetrics,
  listUsersForPlatform,
  type OrganizationMetrics,
  type PlatformUser,
  updateOrganizationForPlatform,
  updateUserForPlatform,
} from '@/infrastructure/repositories/platform-repository';

export type { OrganizationMetrics, PlatformUser };

/**
 * Der Name der Rolle, die jedes neue Unternehmen mitbekommt.
 *
 * Derselbe wie in der Datenmigration `roles_and_permissions`, damit ein
 * Bestandsmandant und ein neu angelegter gleich aussehen. Sie trägt **alle**
 * Schlüssel des Katalogs: Wer ein Unternehmen übernimmt, muss es einrichten
 * können, und die Aussperrsicherung verlangt mindestens ein Konto mit
 * `organization.administer`.
 */
export const OWNER_ROLE_NAME = 'Inhaber';

export type OrganizationAdminError =
  | { readonly kind: 'NOT_FOUND' }
  /** Die Adresse gehört schon zu einem Konto — global, nicht je Unternehmen. */
  | { readonly kind: 'EMAIL_TAKEN' }
  | { readonly kind: 'NAME_MISSING' };

export async function countManagedOrganizations(platform: PlatformContext): Promise<number> {
  return countOrganizations(platform);
}

export async function listManagedOrganizations(
  platform: PlatformContext,
): Promise<readonly OrganizationMetrics[]> {
  return listOrganizationsWithMetrics(platform);
}

export async function getManagedOrganization(
  platform: PlatformContext,
  id: string,
): Promise<OrganizationMetrics | null> {
  return findOrganizationWithMetrics(platform, id);
}

export async function getOrganizationAccounts(
  platform: PlatformContext,
  organizationId: string,
): Promise<readonly PlatformUser[]> {
  return listUsersForPlatform(platform, organizationId);
}

/**
 * Legt ein Unternehmen samt Inhaber-Einladung an (FA-ORG-02, FA-ADM-05).
 *
 * Der Token verlässt diese Schicht **genau einmal** — wie bei jeder Einladung.
 * Wer den Link verliert, lässt das Unternehmen eine neue Einladung ausstellen;
 * hier gibt es keinen zweiten Abruf, weil es kein zweites Mal gibt.
 */
export async function createManagedOrganization(
  platform: PlatformContext,
  data: { readonly name: string; readonly ownerEmail: string },
  adminUserId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<
  Result<
    { readonly organizationId: string; readonly token: string; readonly expiresAt: Date },
    OrganizationAdminError
  >
> {
  const name = data.name.trim();
  const ownerEmail = data.ownerEmail.trim().toLowerCase();

  if (name.length === 0) {
    return err({ kind: 'NAME_MISSING' });
  }

  /*
   * Die Adresse wird **vor** der Transaktion geprüft.
   *
   * `User.email` ist global eindeutig, und `Invitation_one_open_per_email`
   * ebenso. Beide würden das Anlegen abbrechen — aber erst nachdem Organisation
   * und Rolle geschrieben wären, und die Meldung wäre ein Indexfehler statt
   * eines Satzes.
   */
  if ((await findUserByEmail(ownerEmail)) !== null) {
    return err({ kind: 'EMAIL_TAKEN' });
  }

  const token = generateRedemptionToken();
  const expiresAt = invitationExpiry(now);

  const created = await createOrganizationWithOwner(platform, {
    name,
    ownerEmail,
    ownerRoleName: OWNER_ROLE_NAME,
    permissionKeys: ALL_PERMISSION_KEYS,
    tokenHash: hashToken(token),
    invitationExpiresAt: expiresAt,
  });

  await recordPlatformAuditEntry(platform, created.organizationId, {
    entityType: 'Organization',
    entityId: created.organizationId,
    action: 'ORGANIZATION_CREATED',
    actorId: adminUserId,
    ipAddress,
    // Die Adresse steht im Protokoll, der Token nicht (NFA-BETR-10).
    details: { name, ownerEmail, invitationId: created.invitationId },
  });

  logger.security('admin.organization_created', {
    adminUserId,
    organizationId: created.organizationId,
  });

  return ok({ organizationId: created.organizationId, token, expiresAt });
}

/**
 * Legt ein Unternehmen still oder gibt es frei (FA-ORG-03).
 *
 * Stilllegen heißt: keine Anmeldung, keine laufende Sitzung, **kein
 * Datenverlust**. Der Bestand bleibt vollständig, und die Freigabe stellt den
 * vorigen Zustand wieder her. Ein Unternehmen zu löschen gibt es hier nicht —
 * die Belege eines Mandanten sind aufbewahrungspflichtig, und ein Knopf dafür
 * wäre ein Knopf, den niemand versehentlich finden soll.
 */
export async function setOrganizationSuspended(
  platform: PlatformContext,
  id: string,
  suspended: boolean,
  adminUserId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<null, OrganizationAdminError>> {
  const organization = await findOrganizationWithMetrics(platform, id);
  if (organization === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const changed = await updateOrganizationForPlatform(platform, id, {
    suspendedAt: suspended ? now : null,
  });
  if (changed === 0) {
    return err({ kind: 'NOT_FOUND' });
  }

  if (suspended) {
    // Sofort statt beim nächsten Klick: Die Auflösung würde die Sitzungen
    // ohnehin abweisen, aber solange sie in der Tabelle stehen, sieht ein
    // Betrachter der Datenbank aktive Sitzungen eines stillgelegten Mandanten.
    await deleteSessionsOfOrganization(platform, id);
  }

  await recordPlatformAuditEntry(platform, id, {
    entityType: 'Organization',
    entityId: id,
    action: suspended ? 'SUSPENDED' : 'RESUMED',
    actorId: adminUserId,
    ipAddress,
  });

  logger.security(suspended ? 'admin.organization_suspended' : 'admin.organization_resumed', {
    adminUserId,
    organizationId: id,
  });

  return ok(null);
}

/**
 * Sperrt oder entsperrt ein Mandantenkonto (FA-ADM-05).
 *
 * **Ohne Aussperrsicherung**, anders als in der Mitgliederverwaltung: Die drei
 * Trigger aus `roles_and_permissions` greifen auch hier — sie hängen an der
 * Tabelle, nicht an der Anwendungsschicht. Der Betreiber bekommt deshalb keinen
 * erklärenden Satz vorab, sondern eine abgewiesene Änderung; das ist
 * vertretbar, weil er ein Werkzeug für den Ausnahmefall benutzt und die
 * Erklärung im Log steht.
 *
 * Warum der Betreiber Konten überhaupt sperren kann: Ein Unternehmen, dessen
 * Rechteverwaltung ausfällt, wäre sonst auf einen Datenbankeingriff angewiesen.
 */
export async function setPlatformUserDisabled(
  platform: PlatformContext,
  userId: string,
  disabled: boolean,
  adminUserId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<null, OrganizationAdminError>> {
  const user = await findUserForPlatform(platform, userId);
  if (user === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const changed = await updateUserForPlatform(platform, userId, {
    disabledAt: disabled ? now : null,
  });
  if (changed === 0) {
    return err({ kind: 'NOT_FOUND' });
  }

  await recordPlatformAuditEntry(platform, user.organizationId, {
    entityType: 'User',
    entityId: userId,
    action: disabled ? 'DISABLED' : 'ENABLED',
    actorId: adminUserId,
    ipAddress,
  });

  logger.security('admin.user_state_changed', { adminUserId, userId, disabled });

  return ok(null);
}
