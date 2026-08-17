/**
 * Die Konten **eines** Unternehmens (M8, FA-MEMB-01, -06).
 *
 * Bewusst getrennt von `auth-repository.ts`, obwohl beide auf `User` arbeiten.
 * Der Unterschied ist der Kontext, und er ist kein Formalismus:
 *
 * - `auth-repository.ts` löst die **Anmeldung** auf. Dort ist die Organisation
 *   das Ergebnis der Abfrage, nicht ihre Bedingung — deshalb die dokumentierte
 *   Ausnahme von der Kontextpflicht.
 * - Hier geht es um die **Mitgliederverwaltung**. Wer sie aufruft, kennt sein
 *   Unternehmen und darf nur dessen Konten sehen. Ein Kontext ist Pflicht.
 *
 * Läge beides in einer Datei, wäre die Ausnahme ihr Vorbild: Die nächste
 * Funktion entstünde ohne Kontext, weil die darüber auch keinen hat.
 */
import type { Prisma, User } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';

const forMember = {
  id: true,
  email: true,
  name: true,
  disabledAt: true,
  lastLoginAt: true,
  createdAt: true,
  totpEnabled: true,
  role: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export type Member = Prisma.UserGetPayload<{ select: typeof forMember }>;

export async function listMembers(
  context: OrganizationContext,
): Promise<readonly Member[]> {
  return clientFor(undefined).user.findMany({
    where: { organizationId: context.organizationId },
    select: forMember,
    // Gesperrte nach unten, sonst nach Adresse: Die Liste soll mit denen
    // beginnen, die arbeiten.
    orderBy: [{ disabledAt: 'asc' }, { email: 'asc' }],
  });
}

export async function findMember(
  context: OrganizationContext,
  id: string,
): Promise<Member | null> {
  return clientFor(undefined).user.findFirst({
    where: { id, organizationId: context.organizationId },
    select: forMember,
  });
}

/**
 * Ändert ein Konto **innerhalb** des eigenen Unternehmens.
 *
 * `updateMany` statt `update`, damit `organizationId` in die
 * `where`-Bedingung passt: Mit `update` ließe sich nur über `id` adressieren,
 * und die Zugehörigkeit müsste vorher geprüft werden — eine Prüfung, die sich
 * vergessen lässt. Der Rückgabewert nennt die Zahl der betroffenen Zeilen; `0`
 * heißt „gehört nicht zu diesem Unternehmen oder gibt es nicht", und beide
 * Fälle beantwortet der Aufrufer gleich.
 */
export async function updateMember(
  context: OrganizationContext,
  id: string,
  data: Prisma.UserUncheckedUpdateManyInput,
  handle?: TransactionHandle,
): Promise<number> {
  const result = await clientFor(handle).user.updateMany({
    where: { id, organizationId: context.organizationId },
    data,
  });
  return result.count;
}

export type { User };
