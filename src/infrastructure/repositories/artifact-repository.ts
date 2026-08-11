/**
 * Erzeugte Belegdateien je Organisation (FA-PDF-01, -11; FA-TPL-09).
 *
 * Es gibt kein `update`: Artefakte sind unveränderlich, und ein Trigger weist
 * jede Änderung auch dann ab, wenn sie an dieser Schicht vorbeigeht.
 */
import type { InvoiceArtifact, Prisma } from '@prisma/client';

import { clientFor } from './client';
import type { OrganizationContext } from './organization-context';

export type { InvoiceArtifact };

export type ArtifactData = Omit<
  Prisma.InvoiceArtifactUncheckedCreateInput,
  'organizationId' | 'invoiceId'
>;

export async function findArtifact(
  context: OrganizationContext,
  invoiceId: string,
  kind: string,
): Promise<InvoiceArtifact | null> {
  return clientFor(undefined).invoiceArtifact.findFirst({
    where: { invoiceId, kind, invoice: { organizationId: context.organizationId } },
  });
}

export async function createArtifact(
  context: OrganizationContext,
  invoiceId: string,
  data: ArtifactData,
): Promise<InvoiceArtifact> {
  return clientFor(undefined).invoiceArtifact.create({
    data: { ...data, invoiceId, organizationId: context.organizationId },
  });
}

/**
 * Entfernt den Datenbankeintrag eines Artefakts.
 *
 * Ausschließlich für den Fall, dass das Schreiben der Datei nach dem Anlegen
 * des Eintrags fehlschlägt — sonst bliebe ein Eintrag ohne Datei stehen, und
 * der Abruf liefe in einen Lesefehler statt in ein sauberes „nicht vorhanden".
 */
export async function deleteArtifact(
  context: OrganizationContext,
  id: string,
): Promise<void> {
  await clientFor(undefined).invoiceArtifact.deleteMany({
    where: { id, invoice: { organizationId: context.organizationId } },
  });
}
