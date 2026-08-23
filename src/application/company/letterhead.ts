/**
 * Briefpapier: hochladen, prüfen, verknüpfen (M12, FA-TPL-11, NFA-SEC-31).
 *
 * Ein Briefpapier ist eine einseitige A4-PDF, die unter jeden Beleg gelegt
 * wird. Es trägt **nur Gestaltung**: Logo, Blattfuß und Pflichtangaben setzt
 * weiterhin die Vorlage. Der Grund ist prüfbar — läge die Steuernummer auf dem
 * Briefpapier, stünde sie in einer Datei, die kein Test lesen kann, und
 * FA-PFL-02 wäre eine Behauptung statt einer Zusage.
 *
 * **Zwei Schichten prüfen, und beide werden gebraucht.** Die Domain
 * (`pdf-upload.ts`) sieht die Bytes: Signatur, Größe, ausführbare
 * Bestandteile. Erst danach darf pdf-lib die Datei überhaupt anfassen — was
 * hier ankommt, ist bereits als PDF erkannt. Diese Schicht prüft, was ohne
 * einen PDF-Leser nicht zu sehen ist: **genau eine Seite** und **A4**.
 *
 * Die Seitenzahl ist die wichtigere der beiden. Ein zweiseitiges Briefpapier
 * wäre eine stille Falle: Der Beleg bekäme immer nur die erste Seite, und die
 * zweite sähe niemand je.
 */
import { PDFDocument } from 'pdf-lib';

import {
  MAX_LETTERHEAD_BYTES,
  isA4,
  validatePdfUpload,
  type PdfUploadError,
} from '@/domain/assets/pdf-upload';
import { err, ok, type Result } from '@/domain/shared/result';
import type { Authorized } from '@/application/auth/authorize';
import { createAsset, findAsset } from '@/infrastructure/repositories/asset-repository';
import { storePdf } from '@/infrastructure/storage/asset-store';

import type { StoredAsset } from '@/application/assets/asset-service';

export type LetterheadError =
  | PdfUploadError
  | { readonly kind: 'UNREADABLE' }
  | { readonly kind: 'MULTIPLE_PAGES'; readonly pageCount: number }
  | { readonly kind: 'NOT_A4'; readonly widthMm: number; readonly heightMm: number };

/** Kürzt und entschärft den vom Benutzer gelieferten Anzeigenamen. */
function sanitizeDisplayName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? 'briefpapier.pdf';
  return base.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120) || 'briefpapier.pdf';
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Liest Seitenzahl und Blattmaß.
 *
 * Ein Lesefehler ist ein eigener Fall und keine Ausnahme nach oben: Eine
 * beschädigte Datei ist eine Auskunft an den Benutzer, kein Serverfehler.
 */
async function inspect(
  bytes: Uint8Array,
): Promise<Result<{ pageCount: number; widthPt: number; heightPt: number }, LetterheadError>> {
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages = document.getPages();
    const first = pages[0];

    if (first === undefined) {
      return err({ kind: 'UNREADABLE' });
    }

    const size = first.getSize();
    return ok({ pageCount: pages.length, widthPt: size.width, heightPt: size.height });
  } catch {
    return err({ kind: 'UNREADABLE' });
  }
}

export async function storeLetterheadAsset(
  context: Authorized<'companyProfile.update'>,
  bytes: Uint8Array,
  declaredMimeType: string,
  originalFileName: string,
): Promise<Result<StoredAsset, LetterheadError>> {
  const validated = validatePdfUpload(bytes, declaredMimeType, MAX_LETTERHEAD_BYTES);
  if (!validated.ok) {
    return err(validated.error);
  }

  const inspected = await inspect(bytes);
  if (!inspected.ok) {
    return err(inspected.error);
  }

  const { pageCount, widthPt, heightPt } = inspected.value;

  if (pageCount !== 1) {
    return err({ kind: 'MULTIPLE_PAGES', pageCount });
  }

  if (!isA4(widthPt, heightPt)) {
    return err({
      kind: 'NOT_A4',
      widthMm: round((widthPt * 25.4) / 72),
      heightMm: round((heightPt * 25.4) / 72),
    });
  }

  const stored = await storePdf(bytes);

  const asset = await createAsset(context, {
    fileName: sanitizeDisplayName(originalFileName),
    mimeType: 'application/pdf',
    byteSize: stored.byteSize,
    sha256: stored.sha256,
    storagePath: stored.storagePath,
  });

  return ok(asset);
}

/**
 * Das Briefpapier eines Belegs, gelesen über die Repository-Schicht.
 *
 * Bewusst nicht über `getAsset()`: Jene verlangt `companyProfile.read`, und
 * das Briefpapier wird beim Setzen eines Belegs gebraucht — dieselbe
 * Begründung wie beim Logo (M11).
 */
export async function findLetterheadAsset(
  context: Authorized<'invoice.read'>,
  assetId: string,
): Promise<StoredAsset | null> {
  return findAsset(context, assetId);
}
