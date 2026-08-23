/**
 * Prüfung hochgeladener PDF-Dateien (M12, FA-TPL-11, NFA-SEC-31).
 *
 * Dieselbe Haltung wie bei Bildern (`image-upload.ts`): Der vom Browser
 * gemeldete MIME-Typ ist eine Behauptung des Clients. Maßgeblich sind die
 * ersten Bytes.
 *
 * **Was hier bewusst nicht steht:** die Seitenzahl und das Blattformat. Beides
 * verlangt einen PDF-Leser, und der gehört nicht in die Domain — sie kennt
 * keine Fremdbibliothek. Diese Prüfung sitzt eine Schicht höher
 * (`letterhead-service.ts`) und stützt sich auf dieselbe Regel, die hier
 * beginnt: erst die Bytes, dann der Inhalt.
 *
 * Reine Funktionen über Bytes: kein Dateisystem, kein Netz.
 */
import { err, ok, type Result } from '../shared/result';

/**
 * Briefpapier höchstens 5 MB.
 *
 * Großzügiger als die 2 MB für ein Logo (Spec §11.2) und aus einem anderen
 * Grund: Ein Briefpapier ist ein ganzes Blatt und trägt oft ein
 * Hintergrundbild. Trotzdem eine Grenze — die Datei steckt danach in **jedem**
 * Beleg, den das Unternehmen ausstellt.
 */
export const MAX_LETTERHEAD_BYTES = 5 * 1024 * 1024;

export const PDF_MIME_TYPE = 'application/pdf';

export type PdfUploadError =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'TOO_LARGE'; readonly maxBytes: number; readonly actualBytes: number }
  | { readonly kind: 'NOT_A_PDF' }
  | { readonly kind: 'ACTIVE_CONTENT' };

/** `%PDF-` — die einzige zulässige Eröffnung einer PDF-Datei (ISO 32000-1, 7.5.2). */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function isPdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_SIGNATURE.length) {
    return false;
  }
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/**
 * Sucht nach ausführbaren Bestandteilen im PDF.
 *
 * **Warum das trotz allem geprüft wird.** Das Briefpapier wird nie an einen
 * Betrachter ausgeliefert; es wird von pdf-lib gelesen und als Grund unter den
 * Beleg gezeichnet, und dabei führt niemand etwas aus. Die Prüfung gilt dem
 * Weg danach: Was in den Beleg wandert, wandert in eine Datei, die der
 * Empfänger in seinem Betrachter öffnet. Ein Briefpapier mit JavaScript oder
 * einer eingebetteten Datei hat dort nichts verloren.
 *
 * Grob und absichtlich streng: Die Namen stehen als unverschlüsselte Schlüssel
 * im Objektbaum, und ein Briefpapier braucht keinen von ihnen.
 */
export function containsActivePdfContent(bytes: Uint8Array): boolean {
  const text = new TextDecoder('latin1').decode(bytes);
  return (
    text.includes('/JavaScript') ||
    text.includes('/JS') ||
    text.includes('/Launch') ||
    text.includes('/EmbeddedFile') ||
    text.includes('/OpenAction')
  );
}

export type ValidatedPdf = {
  readonly byteSize: number;
};

export function validatePdfUpload(
  bytes: Uint8Array,
  declaredMimeType: string,
  maxBytes: number = MAX_LETTERHEAD_BYTES,
): Result<ValidatedPdf, PdfUploadError> {
  if (bytes.length === 0) {
    return err({ kind: 'EMPTY' });
  }
  if (bytes.length > maxBytes) {
    return err({ kind: 'TOO_LARGE', maxBytes, actualBytes: bytes.length });
  }

  if (!isPdf(bytes)) {
    return err({ kind: 'NOT_A_PDF' });
  }

  // Der gemeldete Typ darf nicht widersprechen. Anders als bei Bildern gibt es
  // hier nur einen zulässigen Typ, also genügt der Vergleich mit ihm.
  const declared = declaredMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (declared.length > 0 && declared !== PDF_MIME_TYPE) {
    return err({ kind: 'NOT_A_PDF' });
  }

  if (containsActivePdfContent(bytes)) {
    return err({ kind: 'ACTIVE_CONTENT' });
  }

  return ok({ byteSize: bytes.length });
}

/**
 * Das erlaubte Blattformat: A4, mit 2 mm Spielraum.
 *
 * Der Spielraum ist nicht Bequemlichkeit, sondern Arithmetik: A4 misst
 * 595,276 × 841,890 Punkte, und Gestaltungsprogramme runden das
 * unterschiedlich. Ein Bogen, der um einen halben Punkt abweicht, ist derselbe
 * Bogen.
 */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const FORMAT_TOLERANCE_MM = 2;

/** PDF rechnet in Punkten zu 1/72 Zoll. */
export function pointsToMm(points: number): number {
  return (points * 25.4) / 72;
}

export function isA4(widthPoints: number, heightPoints: number): boolean {
  return (
    Math.abs(pointsToMm(widthPoints) - A4_WIDTH_MM) <= FORMAT_TOLERANCE_MM &&
    Math.abs(pointsToMm(heightPoints) - A4_HEIGHT_MM) <= FORMAT_TOLERANCE_MM
  );
}
