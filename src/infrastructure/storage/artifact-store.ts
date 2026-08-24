/**
 * Ablage erzeugter Belegdateien (FA-PDF-11, FA-NUM-10, Spec §4).
 *
 * Zwei Unterschiede zum Asset-Speicher, beide bewusst:
 *
 * 1. **Atomar geschrieben.** Erst in eine Datei mit Zufallsnamen, dann
 *    umbenannt. `rename` ist innerhalb eines Dateisystems unteilbar — es gibt
 *    keinen Zeitpunkt, an dem unter dem endgültigen Pfad ein halbes PDF liegt.
 *    Bricht das Rendern ab, wird die Zwischendatei entfernt und es bleibt gar
 *    nichts zurück (FA-PDF-11).
 * 2. **Nach Beleg abgelegt**, nicht nach Zufallsnamen: `artifacts/<invoiceId>/`.
 *    Wer den Speicher im Ernstfall von Hand durchsieht, findet den Beleg über
 *    seine Kennung statt über eine Zuordnungstabelle.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getEnv } from '@/infrastructure/config/env';

export type StoredArtifact = {
  /** Pfad relativ zum Speicherverzeichnis — nie ein absoluter Pfad. */
  readonly storagePath: string;
  readonly sha256: string;
  readonly byteSize: number;
};

function storageRoot(): string {
  return path.resolve(getEnv().STORAGE_DIR);
}

function artifactRoot(): string {
  return path.join(storageRoot(), 'artifacts');
}

/**
 * Prüft, dass ein Pfad im Artefaktverzeichnis liegt.
 *
 * Ein manipulierter Eintrag in der Datenbank soll nicht dazu führen, dass
 * beliebige Dateien des Servers ausgeliefert oder gelöscht werden.
 */
function resolveInside(storagePath: string): string | null {
  const absolutePath = path.resolve(storageRoot(), storagePath);
  const relative = path.relative(artifactRoot(), absolutePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return absolutePath;
}

export async function storeArtifact(
  invoiceId: string,
  kind: string,
  bytes: Uint8Array,
): Promise<StoredArtifact> {
  // `invoiceId` und `kind` stammen aus der Datenbank bzw. aus einer festen
  // Aufzählung. Trotzdem gefiltert: Ein Verzeichnisname entsteht daraus, und
  // die Annahme „kommt ja von uns" ist genau die, die irgendwann nicht mehr
  // stimmt.
  const safeInvoiceId = invoiceId.replace(/[^A-Za-z0-9_-]/g, '');
  const safeKind = kind.replace(/[^A-Za-z0-9_-]/g, '');

  if (safeInvoiceId.length === 0 || safeKind.length === 0) {
    throw new RangeError('Unzulässige Kennung für ein Artefakt');
  }

  const directory = path.join(artifactRoot(), safeInvoiceId);
  await mkdir(directory, { recursive: true });

  const finalPath = path.join(directory, `${safeKind}.pdf`);
  const temporaryPath = path.join(directory, `.${randomUUID()}.part`);

  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, finalPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  return {
    storagePath: path.join('artifacts', safeInvoiceId, `${safeKind}.pdf`),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteSize: bytes.length,
  };
}

export async function readArtifact(storagePath: string): Promise<Buffer> {
  const absolutePath = resolveInside(storagePath);
  if (absolutePath === null) {
    throw new Error('Pfad liegt außerhalb des Artefaktverzeichnisses');
  }
  return readFile(absolutePath);
}

/** Prüft, ob die abgelegte Datei noch dem gespeicherten Hash entspricht. */
export async function verifyArtifact(storagePath: string, sha256: string): Promise<boolean> {
  try {
    const bytes = await readArtifact(storagePath);
    return createHash('sha256').update(bytes).digest('hex') === sha256;
  } catch {
    return false;
  }
}

/**
 * Entfernt alle Artefakte eines Belegs.
 *
 * Betrifft ausschließlich Entwürfe: Ein festgeschriebener Beleg lässt sich
 * nicht löschen, und sein Artefakt ist unveränderlich.
 */
export async function deleteArtifactsOf(invoiceId: string): Promise<void> {
  const safeInvoiceId = invoiceId.replace(/[^A-Za-z0-9_-]/g, '');
  const absolutePath = resolveInside(path.join('artifacts', safeInvoiceId));

  if (absolutePath === null || safeInvoiceId.length === 0) {
    return;
  }
  await rm(absolutePath, { recursive: true, force: true });
}
