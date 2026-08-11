/**
 * Auspacken hochgeladener Vorlagenarchive (FA-TPL-01, NFA-SEC-15, Spec §8.4).
 *
 * Es wird **nichts** ins Dateisystem geschrieben: Gelesen werden genau die
 * beiden bekannten Einträge, und ihr Inhalt wandert als Text in die Datenbank.
 * Damit gibt es keinen Pfad, über den ein Archiveintrag irgendwo landen könnte.
 *
 * Die Namensprüfung läuft trotzdem über **alle** Einträge, nicht nur über die
 * beiden gesuchten. Ein Archiv, das `../../etc/cron.d/job` mitbringt, wird
 * abgewiesen statt teilweise verarbeitet — es ist kein Versehen, sondern ein
 * Angriffsversuch, und die Vorlage darin ist nichts, was man haben will.
 */
import AdmZip from 'adm-zip';

import {
  ARCHIVE_CSS_ENTRY,
  ARCHIVE_HTML_ENTRY,
  decodeUtf8,
  isSafeArchiveEntry,
  MAX_TEMPLATE_BYTES,
  type TemplateUploadError,
} from '@/domain/rendering/template-upload';

export type ExtractedTemplate = {
  readonly htmlSource: string;
  readonly cssSource: string;
};

export type ExtractResult =
  | { readonly ok: true; readonly value: ExtractedTemplate }
  | { readonly ok: false; readonly error: TemplateUploadError };

export function extractTemplateArchive(bytes: Uint8Array): ExtractResult {
  let archive: AdmZip;
  try {
    archive = new AdmZip(Buffer.from(bytes));
  } catch {
    return { ok: false, error: { kind: 'UNKNOWN_TYPE' } };
  }

  const entries = archive.getEntries();

  for (const entry of entries) {
    if (!isSafeArchiveEntry(entry.entryName.replace(/\/$/, ''))) {
      return { ok: false, error: { kind: 'UNSAFE_ENTRY', entryName: entry.entryName } };
    }
  }

  // Die entpackte Größe kann die des Archivs weit übersteigen; die Grenze gilt
  // deshalb noch einmal für den Inhalt (Zip-Bombe).
  const uncompressed = entries.reduce((sum, entry) => sum + entry.header.size, 0);
  if (uncompressed > MAX_TEMPLATE_BYTES) {
    return { ok: false, error: { kind: 'TOO_LARGE', maxBytes: MAX_TEMPLATE_BYTES } };
  }

  const html = entries.find((entry) => entry.entryName === ARCHIVE_HTML_ENTRY);
  const css = entries.find((entry) => entry.entryName === ARCHIVE_CSS_ENTRY);

  if (html === undefined || css === undefined) {
    return { ok: false, error: { kind: 'MISSING_ENTRIES' } };
  }

  const htmlSource = decodeUtf8(new Uint8Array(html.getData()));
  const cssSource = decodeUtf8(new Uint8Array(css.getData()));

  if (htmlSource === null || cssSource === null) {
    return { ok: false, error: { kind: 'NOT_UTF8' } };
  }

  return { ok: true, value: { htmlSource, cssSource } };
}
