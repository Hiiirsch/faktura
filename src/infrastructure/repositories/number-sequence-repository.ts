/**
 * Fortlaufende Zähler je Organisation (FA-NUM-02 bis -07, FA-KUND-02).
 *
 * Der Bereich (`scope`) ist zusammen mit der Organisation eindeutig. Ohne die
 * Organisation im Schlüssel zählte eine zweite Organisation im Nummernkreis
 * der ersten weiter — und beide bekämen Lücken.
 *
 * `upsert` mit `increment` ist auf Datenbankebene atomar: Der Zählerstand wird
 * nicht gelesen und zurückgeschrieben, sondern in einer Anweisung erhöht. Zwei
 * gleichzeitige Vergaben können deshalb nie dieselbe Nummer erhalten
 * (FA-NUM-04).
 */
import type { NumberSequence } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';

export type { NumberSequence };

export async function incrementSequence(
  context: OrganizationContext,
  scope: string,
  handle?: TransactionHandle,
): Promise<number> {
  const sequence = await clientFor(handle).numberSequence.upsert({
    where: { organizationId_scope: { organizationId: context.organizationId, scope } },
    create: { organizationId: context.organizationId, scope, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });

  return sequence.lastValue;
}

export async function findSequence(
  context: OrganizationContext,
  scope: string,
): Promise<NumberSequence | null> {
  return clientFor(undefined).numberSequence.findUnique({
    where: { organizationId_scope: { organizationId: context.organizationId, scope } },
  });
}

export async function listSequencesWithPrefix(
  context: OrganizationContext,
  prefix: string,
): Promise<readonly NumberSequence[]> {
  return clientFor(undefined).numberSequence.findMany({
    where: { organizationId: context.organizationId, scope: { startsWith: prefix } },
    orderBy: { scope: 'asc' },
  });
}

export async function setSequenceValue(
  context: OrganizationContext,
  scope: string,
  lastValue: number,
): Promise<void> {
  await clientFor(undefined).numberSequence.upsert({
    where: { organizationId_scope: { organizationId: context.organizationId, scope } },
    create: { organizationId: context.organizationId, scope, lastValue },
    update: { lastValue },
  });
}
