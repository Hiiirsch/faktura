/**
 * Hochgeladene Dateien (FA-STAMM-05, NFA-SEC-15, NFA-SEC-16).
 *
 * Die Prüfung der Bytes liegt in der Domain, das Schreiben in der
 * Infrastruktur; hier wird beides zusammengeführt und der Datenbankeintrag
 * angelegt. Erst wenn die Datei geschrieben ist, entsteht der Eintrag — ein
 * verwaister Datensatz ohne Datei wäre schlimmer als eine verwaiste Datei.
 */
import {
  type ImageUploadError,
  MAX_LOGO_BYTES,
  validateImageUpload,
} from '@/domain/assets/image-upload';
import { err, ok, type Result } from '@/domain/shared/result';
import { getPrismaClient } from '@/infrastructure/db/prisma';
import { deleteStoredFile, readStoredFile, storeImage } from '@/infrastructure/storage/asset-store';

export type StoredAsset = {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storagePath: string;
};

/** Kürzt und entschärft den vom Benutzer gelieferten Anzeigenamen. */
function sanitizeDisplayName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? 'datei';
  return base.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120) || 'datei';
}

export async function storeImageAsset(
  bytes: Uint8Array,
  declaredMimeType: string,
  originalFileName: string,
  maxBytes: number = MAX_LOGO_BYTES,
): Promise<Result<StoredAsset, ImageUploadError>> {
  const validated = validateImageUpload(bytes, declaredMimeType, maxBytes);
  if (!validated.ok) {
    return err(validated.error);
  }

  const stored = await storeImage(bytes, validated.value.type);

  const asset = await getPrismaClient().asset.create({
    data: {
      fileName: sanitizeDisplayName(originalFileName),
      mimeType: validated.value.type,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      storagePath: stored.storagePath,
    },
  });

  return ok(asset);
}

export async function getAsset(id: string): Promise<StoredAsset | null> {
  return getPrismaClient().asset.findUnique({ where: { id } });
}

export async function readAssetContent(asset: StoredAsset): Promise<Buffer> {
  return readStoredFile(asset.storagePath);
}

/** Entfernt Datensatz und Datei. Wird nur für ersetzte Logos aufgerufen. */
export async function deleteAsset(id: string): Promise<void> {
  const prisma = getPrismaClient();
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (asset === null) {
    return;
  }

  await prisma.asset.delete({ where: { id } });
  await deleteStoredFile(asset.storagePath);
}
