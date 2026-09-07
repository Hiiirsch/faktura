/**
 * Ablage der erzeugten Belegdateien (FA-PDF-11, FA-TPL-09).
 *
 * **Seit M17 über `FileStore`.** Wo die Bytes wirklich liegen — auf dem
 * Dateisystem oder in einem Objektspeicher — entscheidet `fileStore()`. Diese
 * Datei kennt nur noch den Schlüssel, unter dem eine Datei zu finden ist, und
 * die Prüfsumme, mit der sie sich wiedererkennen lässt.
 *
 * Die Zusage aus FA-PDF-11 gilt unverändert, nur an anderer Stelle: Der
 * Dateisystem-Adapter schreibt über eine Zwischendatei und `rename`, der
 * Objektspeicher kennt kein halb geschriebenes Objekt. Ein abgebrochener Lauf
 * hinterlässt in beiden Fällen nichts, was jemand für vollständig hielte.
 */
import { createHash } from 'node:crypto';

import { fileStore } from './store';

export type StoredArtifact = {
  /** Schlüssel im Dateispeicher — nie ein absoluter Pfad. */
  readonly storagePath: string;
  readonly sha256: string;
  readonly byteSize: number;
};

/**
 * Der Schlüssel einer Belegdatei.
 *
 * `ownerId` ist die Kennung des Belegs **oder** der Mahnung (M15) — beide sind
 * cuid und teilen sich denselben Namensraum, ohne kollidieren zu können.
 *
 * Gefiltert wird, obwohl beide Werte aus der Datenbank stammen: Aus ihnen
 * entsteht ein Schlüssel, und die Annahme „kommt ja von uns" ist genau die, die
 * irgendwann nicht mehr stimmt.
 */
function keyFor(ownerId: string, kind: string): string {
  const safeOwnerId = ownerId.replace(/[^A-Za-z0-9_-]/gu, '');
  const safeKind = kind.replace(/[^A-Za-z0-9_-]/gu, '');

  if (safeOwnerId.length === 0 || safeKind.length === 0) {
    throw new RangeError('Unzulässige Kennung für ein Artefakt');
  }

  return `artifacts/${safeOwnerId}/${safeKind}.pdf`;
}

export async function storeArtifact(
  ownerId: string,
  kind: string,
  bytes: Uint8Array,
): Promise<StoredArtifact> {
  const key = keyFor(ownerId, kind);
  await fileStore().put(key, bytes);

  return {
    storagePath: key,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteSize: bytes.length,
  };
}

export async function readArtifact(storagePath: string): Promise<Buffer> {
  return Buffer.from(await fileStore().get(storagePath));
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
  const safeInvoiceId = invoiceId.replace(/[^A-Za-z0-9_-]/gu, '');

  if (safeInvoiceId.length === 0) {
    return;
  }

  await fileStore().removePrefix(`artifacts/${safeInvoiceId}`);
}
