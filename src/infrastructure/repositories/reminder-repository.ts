/**
 * Mahnungen und ihre erzeugten Dateien (M15, FA-MAHN-01 bis -07).
 *
 * Gefiltert wird über `Reminder.organizationId` — genau ein maßgeblicher
 * Abfragepfad, wie bei den Belegen. Dass die Spalte zur Organisation des
 * Belegs passt, hält ein Trigger fest; sie ist Absicherung, nicht die Prüfung.
 *
 * Eine Mahnung wird nie geändert und nie gelöscht. Es gibt hier deshalb kein
 * `update` und kein `delete` — die Trigger wiesen beides ohnehin ab, aber eine
 * Funktion, die es versucht, wäre schon eine Behauptung darüber, dass es geht.
 */
import type { Prisma, Reminder, ReminderArtifact } from '@prisma/client';

import { clientFor, type TransactionHandle } from './client';
import type { OrganizationContext } from './organization-context';

export type { Reminder, ReminderArtifact };

const withInvoice = {
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      issueDate: true,
      dueDate: true,
      grossTotalCents: true,
      status: true,
    },
  },
} satisfies Prisma.ReminderInclude;

export type ReminderWithInvoice = Prisma.ReminderGetPayload<{ include: typeof withInvoice }>;

export async function createReminder(
  context: OrganizationContext,
  data: Omit<Prisma.ReminderUncheckedCreateInput, 'organizationId'>,
  handle?: TransactionHandle,
): Promise<Reminder> {
  return clientFor(handle).reminder.create({
    data: { ...data, organizationId: context.organizationId },
  });
}

export async function findReminder(
  context: OrganizationContext,
  id: string,
): Promise<ReminderWithInvoice | null> {
  return clientFor(undefined).reminder.findFirst({
    where: { id, organizationId: context.organizationId },
    include: withInvoice,
  });
}

/** Die Mahnungen eines Belegs, jüngste zuletzt. */
export async function listRemindersForInvoice(
  context: OrganizationContext,
  invoiceId: string,
): Promise<readonly Reminder[]> {
  return clientFor(undefined).reminder.findMany({
    where: { invoiceId, organizationId: context.organizationId },
    orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * Die höchste bisher ausgestellte Stufe — oder `null`, wenn noch nicht gemahnt
 * wurde.
 *
 * **Die höchste Stufe und nicht die Anzahl:** Zwei Mahnungen derselben Stufe —
 * etwa nach einem verlorenen Brief — dürfen die nächste nicht überspringen
 * lassen.
 */
export async function highestReminderLevel(
  context: OrganizationContext,
  invoiceId: string,
  handle?: TransactionHandle,
): Promise<number | null> {
  const result = await clientFor(handle).reminder.aggregate({
    where: { invoiceId, organizationId: context.organizationId },
    _max: { level: true },
  });

  return result._max.level;
}

/** Die höchsten Stufen mehrerer Belege auf einmal — für Listen. */
export async function highestReminderLevels(
  context: OrganizationContext,
  invoiceIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (invoiceIds.length === 0) {
    return new Map();
  }

  const rows = await clientFor(undefined).reminder.groupBy({
    by: ['invoiceId'],
    where: { organizationId: context.organizationId, invoiceId: { in: [...invoiceIds] } },
    _max: { level: true },
  });

  return new Map(
    rows.flatMap((row) => (row._max.level === null ? [] : [[row.invoiceId, row._max.level]])),
  );
}

export async function createReminderArtifact(
  context: OrganizationContext,
  data: Omit<Prisma.ReminderArtifactUncheckedCreateInput, 'organizationId'>,
): Promise<ReminderArtifact> {
  return clientFor(undefined).reminderArtifact.create({
    data: { ...data, organizationId: context.organizationId },
  });
}

export async function findReminderArtifact(
  context: OrganizationContext,
  reminderId: string,
  kind = 'pdf',
): Promise<ReminderArtifact | null> {
  return clientFor(undefined).reminderArtifact.findFirst({
    where: { reminderId, kind, organizationId: context.organizationId },
  });
}
