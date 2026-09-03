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
import { passwordResetExpiry } from '@/domain/auth/password-reset-policy';
import { ALL_PERMISSION_KEYS } from '@/domain/policy/can';
import {
  deliverInvitation,
  deliverPasswordReset,
  type Delivery,
} from '@/application/notifications/deliver';
import { err, ok, type Result } from '@/domain/shared/result';
import { recordPlatformAuditEntry } from '@/infrastructure/audit/audit-log';
import { generateRedemptionToken, hashToken } from '@/infrastructure/auth/tokens';
import { findUserByEmail } from '@/infrastructure/repositories/auth-repository';
import { logger } from '@/infrastructure/logging/logger';
import {
  countOrganizations,
  createOrganizationWithOwner,
  createTenantPasswordReset,
  deleteSessionsOfOrganization,
  findOrganizationWithMetrics,
  findOwnerRoleId,
  findUserForPlatform,
  anonymizeUserForPlatform,
  findOrganizationNote,
  listOpenInvitationsForPlatform,
  listOrganizationsWithMetrics,
  listPlatformAuditEntries,
  listUsersForPlatform,
  type OrganizationMetrics,
  type PlatformAuditView,
  type PlatformUser,
  reissueOwnerInvitation,
  revokeInvitationForPlatform,
  updateOrganizationForPlatform,
  updateUserForPlatform,
} from '@/infrastructure/repositories/platform-repository';

export type { OrganizationMetrics, PlatformUser };

/** Eine offene Einladung, wie die Adminansicht sie zeigt. */
export type OpenInvitation = {
  readonly id: string;
  readonly email: string;
  readonly roleId: string;
  readonly expiresAt: Date;
};

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
  | { readonly kind: 'NAME_MISSING' }
  /**
   * Das Unternehmen führt keine Rolle mit Rechteverwaltung.
   *
   * Sollte es nach FA-ROLE-04 nicht geben — die Trigger halten mindestens ein
   * aktives Konto damit. Eintreten kann es trotzdem, etwa nach einem Eingriff
   * an der Datenbank vorbei, und dann soll die Meldung das sagen statt eine
   * Einladung ohne Rolle auszustellen.
   */
  | { readonly kind: 'NO_OWNER_ROLE' }
  /**
   * Die Aussperrsicherung hat abgewiesen (M10, B3).
   *
   * Anonymisieren entzieht die Rolle und sperrt das Konto — beides Spalten, auf
   * die `Organization_keeps_administrator_on_user_update` hört. Ein Unternehmen
   * ohne Rechteverwaltung zurückzulassen wäre schlimmer als ein Konto, das
   * bleibt.
   */
  | { readonly kind: 'LAST_ADMINISTRATOR' };

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
    {
      readonly organizationId: string;
      readonly token: string;
      readonly expiresAt: Date;
      readonly delivery: Delivery;
    },
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

  /*
   * Zugestellt wird **nach** dem Protokolleintrag und außerhalb jeder
   * Transaktion — dieselbe Reihenfolge wie in `inviteMember`: Das Unternehmen
   * besteht, sobald es in der Datenbank steht, und ein schweigender Mailserver
   * darf daran nichts ändern.
   */
  const delivery = await deliverInvitation(ownerEmail, token, expiresAt);

  return ok({ organizationId: created.organizationId, token, expiresAt, delivery });
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

// ─── Wege aus einer Sackgasse (M9/B1) ───────────────────────────────────────
//
// Beide Funktionen hier haben denselben Anlass: Ein Zugang ist verloren, und der
// einzige, der ihn wiederherstellen könnte, ist genau der Verlorene. Dieselbe
// Klasse Fehler hat der Betreiberzugang gezeigt; dort heißt die Antwort
// `admin:reset`.

/** Offene Einladungen eines Unternehmens — für die Adminansicht. */
export async function getOpenInvitations(
  platform: PlatformContext,
  organizationId: string,
): Promise<readonly OpenInvitation[]> {
  return listOpenInvitationsForPlatform(platform, organizationId);
}

/**
 * Stellt die Einladung für das Inhaberkonto neu aus (FA-ADM-09).
 *
 * Die Rolle wählt der Betreiber **nicht**: Genommen wird die des offenen
 * Nachweises, sonst die Rolle mit `organization.administer`. Welche Rechte in
 * einem Unternehmen gelten, geht ihn nichts an.
 *
 * Die Adresse ebenso wenig frei wählbar, wenn es schon eine offene Einladung
 * gibt — sonst wäre „erneut ausstellen" ein Weg, die Einladung an eine andere
 * Adresse umzuleiten.
 */
export async function reissueInvitation(
  platform: PlatformContext,
  organizationId: string,
  email: string,
  adminUserId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<
  Result<
    { readonly token: string; readonly expiresAt: Date; readonly delivery: Delivery },
    OrganizationAdminError
  >
> {
  const organization = await findOrganizationWithMetrics(platform, organizationId);
  if (organization === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const address = email.trim().toLowerCase();
  if (address.length === 0) {
    return err({ kind: 'NOT_FOUND' });
  }

  if ((await findUserByEmail(address)) !== null) {
    return err({ kind: 'EMAIL_TAKEN' });
  }

  const open = await listOpenInvitationsForPlatform(platform, organizationId);
  const roleId = open.find((entry) => entry.email === address)?.roleId
    ?? (await findOwnerRoleId(platform, organizationId));

  if (roleId === null) {
    return err({ kind: 'NO_OWNER_ROLE' });
  }

  const token = generateRedemptionToken();
  const expiresAt = invitationExpiry(now);

  const invitationId = await reissueOwnerInvitation(
    platform,
    organizationId,
    { email: address, roleId, tokenHash: hashToken(token), expiresAt },
    now,
  );

  await recordPlatformAuditEntry(platform, organizationId, {
    entityType: 'Invitation',
    entityId: invitationId,
    action: 'INVITED',
    actorId: adminUserId,
    ipAddress,
    details: { email: address, reissued: true },
  });

  logger.security('admin.invitation_reissued', { adminUserId, organizationId });

  const delivery = await deliverInvitation(address, token, expiresAt);

  return ok({ token, expiresAt, delivery });
}

export async function withdrawInvitationAsPlatform(
  platform: PlatformContext,
  organizationId: string,
  invitationId: string,
  adminUserId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<null, OrganizationAdminError>> {
  const revoked = await revokeInvitationForPlatform(platform, organizationId, invitationId, now);
  if (revoked === 0) {
    return err({ kind: 'NOT_FOUND' });
  }

  await recordPlatformAuditEntry(platform, organizationId, {
    entityType: 'Invitation',
    entityId: invitationId,
    action: 'INVITATION_REVOKED',
    actorId: adminUserId,
    ipAddress,
  });

  return ok(null);
}

/**
 * Stellt einen Zurücksetzungsnachweis für ein **Mandantenkonto** aus
 * (FA-ADM-10).
 *
 * **Der Eingriff mit der größten Reichweite, den der Betreiber hat** — und der
 * einzige, der etwas berührt, das einem Konto in einem Unternehmen gehört.
 * Gebaut für die Sackgasse: Verliert das einzige Konto mit
 * `organization.administer` sein Passwort, kann es niemand zurücksetzen, denn
 * die Zurücksetzung verlangt genau dieses Recht.
 *
 * Was er damit **nicht** bekommt: eine Sitzung, ein Passwort oder Einsicht. Er
 * stellt einen Nachweis aus, den ein Mensch einlöst. Dass er ihn selbst einlösen
 * könnte, ist der bewusst in Kauf genommene Preis — deshalb steht der Vorgang im
 * Protokoll **des Unternehmens**, und alle Sitzungen des Kontos enden dabei.
 */
export async function startTenantPasswordReset(
  platform: PlatformContext,
  userId: string,
  adminUserId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<
  Result<
    {
      readonly token: string;
      readonly expiresAt: Date;
      readonly delivery: Delivery;
      readonly email: string;
    },
    OrganizationAdminError
  >
> {
  const user = await findUserForPlatform(platform, userId);
  if (user === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const token = generateRedemptionToken();
  const expiresAt = passwordResetExpiry(now);

  await createTenantPasswordReset(platform, userId, { tokenHash: hashToken(token), expiresAt });

  await recordPlatformAuditEntry(platform, user.organizationId, {
    entityType: 'User',
    entityId: userId,
    action: 'PASSWORD_RESET_REQUESTED',
    actorId: adminUserId,
    ipAddress,
    // Damit im Protokoll des Unternehmens steht, dass der Anstoß von außen kam
    // — `actorKind` allein sagt es, aber nicht jeder liest die Spalte.
    details: { byPlatform: true },
  });

  logger.security('admin.tenant_password_reset', { adminUserId, userId });

  /*
   * **Hier ist die Zustellung mehr als eine Bequemlichkeit.** Der Betreiber
   * könnte den Nachweis selbst einlösen und das Konto übernehmen — der bewusst
   * in Kauf genommene Preis aus M9. Geht die Nachricht an den Kontoinhaber,
   * erfährt der davon, ohne im Protokoll nachsehen zu müssen. Der Eingriff
   * wird dadurch nicht unmöglich, aber er wird sichtbar.
   */
  const delivery = await deliverPasswordReset(user.email, token, expiresAt);

  return ok({ token, expiresAt, delivery, email: user.email });
}

/**
 * Die Platzhalteradresse eines anonymisierten Kontos (M10, B3).
 *
 * `.invalid` ist nach RFC 2606 reserviert und kann niemandem gehören; die
 * Kennung darin hält den eindeutigen Index auf `User.email`. Ohne sie liefe die
 * zweite Anonymisierung in eine Kollision mit der ersten.
 */
function anonymizedEmailFor(userId: string): string {
  return `geloescht-${userId}@invalid`;
}

/**
 * Ein Passworthash, mit dem sich niemand anmeldet.
 *
 * Kein echtes Argon2id: `verifyPassword` fängt einen unlesbaren Hash ab und
 * antwortet mit `false`. Ein zufälliges Passwort zu hashen wäre derselbe
 * Effekt für hundert Millisekunden Rechenzeit — und für eine Zeichenkette, die
 * niemand kennt und niemand braucht.
 */
const ANONYMIZED_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$anonymisiert$anonymisiert';

/**
 * Ein Mandantenkonto unkenntlich machen (M10, B3, FA-ADM-15).
 *
 * **Der Vorgang heißt nicht „löschen", weil er keiner ist.** Belege sind
 * aufbewahrungspflichtig, und ein Beleg nennt seinen Urheber. Was verschwindet,
 * ist die Person: Adresse, Name, Zugangsdaten, jede Anmeldespur. Was bleibt, ist
 * eine Kennung, die zu niemandem mehr führt.
 *
 * **Nicht umkehrbar**, und die Oberfläche sagt das. Es gibt keine Gegenfunktion:
 * Die Daten sind fort, nicht versteckt.
 *
 * **Das Protokoll wird nicht angefasst.** `AuditLog_no_update` und `_no_delete`
 * würden es abwehren, aber der Grund ist inhaltlich: Was geschehen ist, ist
 * geschehen. Der Eintrag nennt danach eine Kennung ohne Person — genau wie der
 * Beleg.
 */
export async function anonymizeTenantUser(
  platform: PlatformContext,
  userId: string,
  adminUserId: string,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<Result<null, OrganizationAdminError>> {
  const user = await findUserForPlatform(platform, userId);
  if (user === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  // Ein zweites Mal ändert nichts und soll auch nichts protokollieren.
  if (user.anonymizedAt !== null) {
    return ok(null);
  }

  try {
    await anonymizeUserForPlatform(platform, userId, {
      email: anonymizedEmailFor(userId),
      passwordHash: ANONYMIZED_PASSWORD_HASH,
      now,
    });
  } catch {
    /*
     * Die Aussperrsicherung aus FA-ROLE-04 greift auch hier: Anonymisieren
     * entzieht die Rolle und sperrt das Konto, und beides sind Spalten, auf die
     * der Trigger hört. Ein Unternehmen ohne Rechteverwaltung zurückzulassen
     * wäre schlimmer als ein Konto, das bleibt.
     */
    return err({ kind: 'LAST_ADMINISTRATOR' });
  }

  await recordPlatformAuditEntry(platform, user.organizationId, {
    entityType: 'User',
    entityId: userId,
    action: 'ANONYMIZED',
    actorId: adminUserId,
    ipAddress,
    details: { byPlatform: true },
  });

  logger.security('admin.user_anonymized', { adminUserId, userId });

  return ok(null);
}

/** Die interne Notiz eines Unternehmens — nur für die Verwaltung (FA-ADM-16). */
export async function getOrganizationNote(
  platform: PlatformContext,
  id: string,
): Promise<string | null> {
  return findOrganizationNote(platform, id);
}

/**
 * Name und interne Notiz eines Unternehmens ändern (M10, B4, FA-ADM-16).
 *
 * **Die Notiz erreicht den Mandanten nie.** Sie steht an `Organization`, wird
 * aber von keiner Funktion außerhalb des Betreiber-Repositories gelesen und ist
 * nicht Teil des Datenexports. Ein Test hält beides fest — eine Spalte, die nur
 * einer sieht, ist eine Zusage und keine Gewohnheit.
 *
 * **Nur die Namensänderung wird protokolliert.** Sie ist eine Änderung an den
 * Daten des Unternehmens und fällt dort auf. Die Notiz ist eine Aufzeichnung
 * **über** das Unternehmen, keine **an** ihm; sie in dessen Protokoll zu
 * schreiben hieße, dem Mandanten mitzuteilen, dass der Betreiber sich etwas
 * notiert hat, ohne ihm zu sagen, was.
 */
export async function updateManagedOrganization(
  platform: PlatformContext,
  id: string,
  data: { readonly name: string; readonly note: string | null },
  adminUserId: string,
  ipAddress: string | null,
): Promise<Result<null, OrganizationAdminError>> {
  const organization = await findOrganizationWithMetrics(platform, id);
  if (organization === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const name = data.name.trim();
  if (name.length === 0) {
    return err({ kind: 'NAME_MISSING' });
  }

  const note = data.note === null || data.note.trim().length === 0 ? null : data.note.trim();

  await updateOrganizationForPlatform(platform, id, { name, note });

  if (name !== organization.name) {
    await recordPlatformAuditEntry(platform, id, {
      entityType: 'Organization',
      entityId: id,
      action: 'UPDATED',
      actorId: adminUserId,
      ipAddress,
      details: { nameVorher: organization.name, nameNachher: name },
    });
  }

  logger.security('admin.organization_updated', { adminUserId, organizationId: id });

  return ok(null);
}

/**
 * Das Protokoll der Verwaltung (M10, B2, FA-ADM-14).
 *
 * **Was hier steht und was nicht.** Handlungen von Betreibern: Unternehmen
 * angelegt, stillgelegt, freigegeben, Einladung neu ausgestellt,
 * Zurücksetzungsnachweis erteilt, Konto gesperrt — und seit B1 auch die
 * Vorgänge an Betreiberkonten selbst, die kein Unternehmen betreffen.
 *
 * **Kein Geschäftsvorfall.** Nicht durch einen Filter, sondern weil die Tabelle
 * `PlatformAuditEntry` ausschließlich aus Handlungen der Verwaltung entsteht.
 * Ein Eintrag über eine festgeschriebene Rechnung kommt dort nie an.
 *
 * Der eigentliche Zweck ist die Sichtbarkeit des Eingriffs, der ein
 * Mandantenkonto übernehmen könnte (M9, Plan H6): Er lässt sich nicht
 * verhindern, solange der Betreiber Nachweise ausstellen darf — aber er soll
 * niemandem entgehen.
 */
export async function getPlatformAuditTrail(
  platform: PlatformContext,
  limit?: number,
): Promise<readonly PlatformAuditView[]> {
  return listPlatformAuditEntries(platform, limit);
}
