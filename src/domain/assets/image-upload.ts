/**
 * Prüfung hochgeladener Bilder (FA-STAMM-05, NFA-SEC-15).
 *
 * Der vom Browser gemeldete MIME-Typ ist eine Behauptung des Clients und für
 * sich genommen wertlos. Maßgeblich sind die ersten Bytes der Datei — sie
 * lassen sich nicht fälschen, ohne die Datei unbrauchbar zu machen.
 *
 * Reine Funktionen über Bytes: kein Dateisystem, keine Netzwerkzugriffe.
 */
import { err, ok, type Result } from '../shared/result';

/** Spec §11.2: Logo höchstens 2 MB. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;

export type ImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export type ImageUploadError =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'TOO_LARGE'; readonly maxBytes: number; readonly actualBytes: number }
  | { readonly kind: 'UNRECOGNIZED_CONTENT' }
  | { readonly kind: 'TYPE_MISMATCH'; readonly declared: string; readonly detected: ImageType }
  | { readonly kind: 'ACTIVE_CONTENT' };

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[index] === byte);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/**
 * Ermittelt den Typ anhand der Signatur. SVG ist Text und hat keine feste
 * Signatur — hier entscheidet der Beginn des Dokuments.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }

  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 512))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();

  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!doctype svg')) {
    return 'image/svg+xml';
  }

  return null;
}

/**
 * Sucht in einer SVG-Datei nach ausführbaren Bestandteilen.
 *
 * Die Auslieferung erfolgt ohnehin nur über eine Route, die jede Ausführung
 * unterbindet, und die Einbindung ausschließlich als `<img>`. Diese Prüfung
 * ist die zweite Ebene: Ein Logo mit eingebettetem Skript ist kein Logo,
 * sondern ein Angriffsversuch, und wird gar nicht erst gespeichert.
 */
export function containsActiveSvgContent(bytes: Uint8Array): boolean {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).toLowerCase();
  return (
    text.includes('<script') ||
    text.includes('javascript:') ||
    text.includes('<foreignobject') ||
    /\son\w+\s*=/.test(text)
  );
}

export type ValidatedImage = {
  readonly type: ImageType;
  readonly byteSize: number;
};

export function validateImageUpload(
  bytes: Uint8Array,
  declaredMimeType: string,
  maxBytes: number = MAX_LOGO_BYTES,
): Result<ValidatedImage, ImageUploadError> {
  if (bytes.length === 0) {
    return err({ kind: 'EMPTY' });
  }
  if (bytes.length > maxBytes) {
    return err({ kind: 'TOO_LARGE', maxBytes, actualBytes: bytes.length });
  }

  const detected = detectImageType(bytes);
  if (detected === null) {
    return err({ kind: 'UNRECOGNIZED_CONTENT' });
  }

  // Der gemeldete Typ muss zum Inhalt passen. Eine als PNG deklarierte
  // SVG-Datei ist entweder ein Fehler oder ein Umgehungsversuch.
  const declared = declaredMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (declared.length > 0 && declared !== detected) {
    return err({ kind: 'TYPE_MISMATCH', declared, detected });
  }

  if (detected === 'image/svg+xml' && containsActiveSvgContent(bytes)) {
    return err({ kind: 'ACTIVE_CONTENT' });
  }

  return ok({ type: detected, byteSize: bytes.length });
}

/** Dateiendung zum geprüften Typ — für den erzeugten Speichernamen. */
export function extensionForImageType(type: ImageType): string {
  switch (type) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
  }
}
