/**
 * Regeln für hochgeladene Vorlagen (FA-TPL-01; NFA-SEC-15, Spec §8.4).
 *
 * Eine hochgeladene Vorlage ist fremder Inhalt. Die Prüfungen hier sind rein
 * und damit einzeln nachweisbar; das Auspacken selbst liegt in der
 * Infrastruktur.
 *
 * Der wichtigste Punkt ist der ZIP-Slip: Ein Archiveintrag darf seinen Namen
 * frei wählen, auch `../../etc/cron.d/job`. Wer ihn ungeprüft an `path.join`
 * weiterreicht, schreibt außerhalb des Zielverzeichnisses. Wir packen zwar
 * nichts ins Dateisystem aus — die Quelltexte wandern in die Datenbank —, aber
 * die Prüfung steht trotzdem hier: Sie ist die Voraussetzung dafür, dass ein
 * späteres `assets/`-Verzeichnis (Spec §8.1) gefahrlos nachgerüstet werden kann.
 */

/** Spec §11: Größenlimit für Vorlagen. */
export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;

export const ARCHIVE_HTML_ENTRY = 'template.html';
export const ARCHIVE_CSS_ENTRY = 'style.css';

export type TemplateUploadKind = 'html' | 'css' | 'zip';

export type TemplateUploadError =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'TOO_LARGE'; readonly maxBytes: number }
  | { readonly kind: 'UNKNOWN_TYPE' }
  | { readonly kind: 'MISSING_ENTRIES' }
  | { readonly kind: 'UNSAFE_ENTRY'; readonly entryName: string }
  | { readonly kind: 'NOT_UTF8' };

/** Leitet die Art aus der Dateiendung ab. */
export function uploadKindOf(fileName: string): TemplateUploadKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.zip')) return 'zip';
  return null;
}

/**
 * Ob ein Archiveintrag im Zielverzeichnis bleibt.
 *
 * Abgewiesen werden absolute Pfade, Laufwerksbuchstaben, Rückwärtsschritte und
 * Backslashes. Letztere, weil ein unter Windows erzeugtes Archiv `..\\..\\x`
 * enthalten kann und `path.normalize` unter Linux den Backslash als
 * gewöhnliches Zeichen behandelt — der Eintrag käme durch die Prüfung und
 * landete unter einem Namen, den niemand erwartet hat.
 */
export function isSafeArchiveEntry(entryName: string): boolean {
  if (entryName.length === 0 || entryName.length > 255) {
    return false;
  }
  if (entryName.includes('\\') || entryName.includes('\0')) {
    return false;
  }
  if (entryName.startsWith('/') || /^[A-Za-z]:/.test(entryName)) {
    return false;
  }

  const segments = entryName.split('/');
  return !segments.includes('..') && !segments.includes('.');
}

/**
 * Prüft die Bytes eines Uploads, bevor sie ausgepackt oder gelesen werden.
 *
 * Die Größe wird **vor** dem Entpacken geprüft; die Grenze für die entpackten
 * Inhalte prüft der Aufrufer erneut, weil ein Archiv beliebig komprimiert sein
 * kann.
 */
export function validateTemplateUpload(
  bytes: Uint8Array,
  fileName: string,
  maxBytes: number = MAX_TEMPLATE_BYTES,
): { ok: true; kind: TemplateUploadKind } | { ok: false; error: TemplateUploadError } {
  if (bytes.length === 0) {
    return { ok: false, error: { kind: 'EMPTY' } };
  }
  if (bytes.length > maxBytes) {
    return { ok: false, error: { kind: 'TOO_LARGE', maxBytes } };
  }

  const kind = uploadKindOf(fileName);
  if (kind === null) {
    return { ok: false, error: { kind: 'UNKNOWN_TYPE' } };
  }

  // Magic Bytes des ZIP-Formats: `PK\003\004`. Ein Archiv, das anders beginnt,
  // ist keines — unabhängig davon, wie die Datei heißt.
  if (kind === 'zip') {
    const header = [bytes[0], bytes[1], bytes[2], bytes[3]];
    const isZip = header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
    if (!isZip) {
      return { ok: false, error: { kind: 'UNKNOWN_TYPE' } };
    }
  }

  return { ok: true, kind };
}

/**
 * Liest Bytes als UTF-8 — streng.
 *
 * Ohne `fatal` ersetzte der Decoder ungültige Folgen still durch U+FFFD, und
 * die Vorlage enthielte Ersatzzeichen an Stellen, an denen jemand Umlaute
 * erwartet hat.
 */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
