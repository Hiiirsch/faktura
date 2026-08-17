/**
 * Einladungen (M8, FA-MEMB-01..03, -05, -07).
 *
 * **Zwei Zugriffsarten, und nur eine trägt einen Kontext.**
 *
 * Die Verwaltung listet, spricht aus und zieht zurück — immer innerhalb ihres
 * Unternehmens, also mit `OrganizationContext` als erstem Pflichtparameter.
 *
 * Das Einlösen dagegen läuft über den Token und **ohne** Kontext. Das ist die
 * zweite dokumentierte Ausnahme neben der Anmeldung, und sie hat denselben
 * Grund: Wer die Seite aufruft, ist niemand — kein Konto, keine Sitzung, keine
 * Organisation. Welche Organisation gemeint ist, ist das *Ergebnis* der Abfrage.
 *
 * Im Unterschied zur Anmeldung ist der Schlüssel dabei nicht erratbar: eine
 * E-Mail-Adresse kennt man, einen 256-bit-Token nicht. Gespeichert liegt auch
 * hier nur der SHA-256-Hash (NFA-SEC-06).
 */
import type { Invitation, Prisma } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';

export type { Invitation };

const withRole = {
  role: { select: { id: true, name: true } },
} satisfies Prisma.InvitationInclude;

export type InvitationWithRole = Prisma.InvitationGetPayload<{ include: typeof withRole }>;

/** Die Einladung samt Unternehmensnamen — für die Einlöseseite. */
const forRedemption = {
  role: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true, suspendedAt: true } },
} satisfies Prisma.InvitationInclude;

export type InvitationForRedemption = Prisma.InvitationGetPayload<{
  include: typeof forRedemption;
}>;

// ─── Mit Kontext: die Verwaltung ────────────────────────────────────────────

/** Offene Einladungen des Unternehmens — angenommene und zurückgezogene nicht. */
export async function listOpenInvitations(
  context: OrganizationContext,
): Promise<readonly InvitationWithRole[]> {
  return clientFor(undefined).invitation.findMany({
    where: { organizationId: context.organizationId, acceptedAt: null, revokedAt: null },
    include: withRole,
    orderBy: { createdAt: 'desc' },
  });
}

export async function createInvitation(
  context: OrganizationContext,
  data: {
    readonly email: string;
    readonly roleId: string;
    readonly tokenHash: string;
    readonly invitedById: string;
    readonly expiresAt: Date;
  },
  handle?: TransactionHandle,
): Promise<Invitation> {
  return clientFor(handle).invitation.create({
    data: { organizationId: context.organizationId, ...data },
  });
}

/**
 * Zieht **alle** offenen Einladungen einer Adresse zurück.
 *
 * Aufgerufen vor jedem Ausstellen: Der partielle Index
 * `Invitation_one_open_per_email` kennt die Frist nicht (ein Index-`WHERE` darf
 * in SQLite kein `CURRENT_TIMESTAMP` nennen), also gilt eine abgelaufene
 * Einladung dort weiter als offen. Ohne diesen Schritt liefe die zweite
 * Einladung an dieselbe Adresse in einen Indexfehler.
 *
 * Die Bedeutung ist ohnehin die gewünschte: Wer erneut einlädt, entwertet den
 * alten Link (FA-MEMB-07).
 */
export async function revokeOpenInvitationsFor(
  context: OrganizationContext,
  email: string,
  revokedAt: Date,
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).invitation.updateMany({
    where: { organizationId: context.organizationId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt },
  });
  return result.count;
}

export async function revokeInvitation(
  context: OrganizationContext,
  id: string,
  revokedAt: Date,
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).invitation.updateMany({
    where: { id, organizationId: context.organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt },
  });
  return result.count;
}

// ─── Ohne Kontext: das Einlösen ─────────────────────────────────────────────

/**
 * Die Einladung zu einem Tokenhash — ohne Rücksicht auf Frist und Zustand.
 *
 * Die Bewertung („abgelaufen", „zurückgezogen", „angenommen") trifft die
 * Anwendungsschicht, damit sie alle drei Fälle **gleich** beantworten kann
 * (FA-MEMB-05). Gäbe die Abfrage nur gültige Einladungen zurück, wäre die
 * Unterscheidung nicht mehr möglich — aber auch nicht die Erklärung im Log.
 */
export async function findInvitationByTokenHash(
  tokenHash: string,
): Promise<InvitationForRedemption | null> {
  return clientFor(undefined).invitation.findUnique({
    where: { tokenHash },
    include: forRedemption,
  });
}

export async function markInvitationAccepted(
  id: string,
  acceptedAt: Date,
  handle?: TransactionHandle,
): Promise<void> {
  await clientFor(handle).invitation.update({ where: { id }, data: { acceptedAt } });
}
