/**
 * Hochgeladene Vorlagen und Dateinamen
 * (FA-TPL-01, FA-PDF-09; NFA-SEC-15, Spec §8.4).
 *
 * Der Kern ist der ZIP-Slip: Ein Archiveintrag darf seinen Namen frei wählen.
 * Die Prüfung ist rein und wird deshalb hier einzeln durchgespielt — an der
 * Stelle, an der sie im Betrieb greift, ließe sich ein durchgerutschter Name
 * nur an seinen Folgen erkennen.
 */
import { describe, expect, it } from 'vitest';

import {
  buildFileName,
  DEFAULT_FILE_NAME_PATTERN,
  isValidFileNamePattern,
} from '@/domain/document/file-name';
import {
  decodeUtf8,
  isSafeArchiveEntry,
  MAX_TEMPLATE_BYTES,
  uploadKindOf,
  validateTemplateUpload,
} from '@/domain/rendering/template-upload';

describe('NFA-SEC-15 ZIP-Slip', () => {
  it('lässt gewöhnliche Einträge zu', () => {
    expect(isSafeArchiveEntry('template.html')).toBe(true);
    expect(isSafeArchiveEntry('style.css')).toBe(true);
    expect(isSafeArchiveEntry('assets/logo.png')).toBe(true);
    expect(isSafeArchiveEntry('assets/bilder/kopf.svg')).toBe(true);
  });

  it('weist Rückwärtsschritte ab', () => {
    expect(isSafeArchiveEntry('../template.html')).toBe(false);
    expect(isSafeArchiveEntry('assets/../../etc/passwd')).toBe(false);
    expect(isSafeArchiveEntry('..')).toBe(false);
    expect(isSafeArchiveEntry('a/../../b')).toBe(false);
  });

  it('weist absolute Pfade und Laufwerksbuchstaben ab', () => {
    expect(isSafeArchiveEntry('/etc/cron.d/job')).toBe(false);
    expect(isSafeArchiveEntry('C:\\Windows\\system32')).toBe(false);
    expect(isSafeArchiveEntry('/template.html')).toBe(false);
  });

  it('weist Backslashes ab, auch ohne Rückwärtsschritt', () => {
    // Unter Linux ist der Backslash ein gewöhnliches Zeichen; ein unter
    // Windows erzeugtes Archiv könnte darüber eine Verzeichnisebene
    // mitbringen, die die Prüfung sonst nicht sieht.
    expect(isSafeArchiveEntry('assets\\logo.png')).toBe(false);
    expect(isSafeArchiveEntry('..\\..\\x')).toBe(false);
  });

  it('weist Nullbytes und leere oder überlange Namen ab', () => {
    expect(isSafeArchiveEntry('tem\0plate.html')).toBe(false);
    expect(isSafeArchiveEntry('')).toBe(false);
    expect(isSafeArchiveEntry(`${'a'.repeat(256)}.html`)).toBe(false);
  });

  it('weist den Einzelpunkt als Segment ab', () => {
    expect(isSafeArchiveEntry('./template.html')).toBe(false);
    expect(isSafeArchiveEntry('assets/./logo.png')).toBe(false);
  });
});

describe('Upload-Prüfung', () => {
  const html = new TextEncoder().encode('<p>{{ invoice.number }}</p>');

  it('erkennt die Art an der Endung', () => {
    expect(uploadKindOf('template.html')).toBe('html');
    expect(uploadKindOf('TEMPLATE.HTM')).toBe('html');
    expect(uploadKindOf('style.css')).toBe('css');
    expect(uploadKindOf('vorlage.zip')).toBe('zip');
    expect(uploadKindOf('schadcode.js')).toBeNull();
    expect(uploadKindOf('ohne-endung')).toBeNull();
  });

  it('nimmt eine gewöhnliche HTML-Datei an', () => {
    const result = validateTemplateUpload(html, 'template.html');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('html');
  });

  it('weist leere und zu große Dateien ab', () => {
    expect(validateTemplateUpload(new Uint8Array(0), 'template.html')).toEqual({
      ok: false,
      error: { kind: 'EMPTY' },
    });

    const oversized = new Uint8Array(MAX_TEMPLATE_BYTES + 1).fill(0x61);
    const result = validateTemplateUpload(oversized, 'template.html');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('TOO_LARGE');
  });

  it('weist eine unbekannte Endung ab', () => {
    const result = validateTemplateUpload(html, 'schadcode.js');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('UNKNOWN_TYPE');
  });

  it('prüft bei .zip die Magic Bytes, nicht nur den Namen', () => {
    const notAnArchive = validateTemplateUpload(html, 'vorlage.zip');
    expect(notAnArchive.ok).toBe(false);

    const archive = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const result = validateTemplateUpload(archive, 'vorlage.zip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('zip');
  });

  it('liest UTF-8 streng — ungültige Folgen ergeben null', () => {
    expect(decodeUtf8(new TextEncoder().encode('Grüße'))).toBe('Grüße');
    // 0xFF ist in UTF-8 nie gültig.
    expect(decodeUtf8(new Uint8Array([0x41, 0xff, 0x42]))).toBeNull();
  });
});

describe('FA-PDF-09 Dateinamenmuster', () => {
  const input = {
    invoiceNumber: 'RE-2026-0044',
    issueDate: '2026-08-01',
    customerName: 'Schulz KG',
    documentTypeLabel: 'Rechnung',
  };

  it('setzt die Platzhalter ein', () => {
    expect(buildFileName('{NUMBER}', input)).toBe('RE-2026-0044.pdf');
    expect(buildFileName('{TYPE}_{NUMBER}', input)).toBe('Rechnung_RE-2026-0044.pdf');
    expect(buildFileName('{YYYY}-{MM}-{DD}_{NUMBER}', input)).toBe(
      '2026-08-01_RE-2026-0044.pdf',
    );
    expect(buildFileName('{CUSTOMER}_{NUMBER}', input)).toBe('Schulz_KG_RE-2026-0044.pdf');
  });

  it('nennt einen Entwurf als solchen', () => {
    expect(buildFileName('{NUMBER}', { ...input, invoiceNumber: null })).toBe('Entwurf.pdf');
  });

  it('entfernt alles, was in einem Dateinamen Schaden anrichtet', () => {
    const dangerous = {
      ...input,
      customerName: '../../etc/passwd',
    };
    const name = buildFileName('{CUSTOMER}', dangerous);

    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('lässt keinen Zeilenumbruch und kein Anführungszeichen durch', () => {
    // Beides landete sonst im Content-Disposition-Header.
    const name = buildFileName('{CUSTOMER}', {
      ...input,
      customerName: 'Schulz"\r\nX-Injected: 1',
    });

    expect(name).not.toContain('"');
    expect(name).not.toContain('\r');
    expect(name).not.toContain('\n');
  });

  it('erzeugt nie eine versteckte Datei', () => {
    const name = buildFileName('{CUSTOMER}', { ...input, customerName: '...geheim' });
    expect(name.startsWith('.')).toBe(false);
  });

  it('fällt auf einen brauchbaren Namen zurück, wenn nichts übrig bleibt', () => {
    const name = buildFileName('{CUSTOMER}', { ...input, customerName: '///' });
    expect(name).toBe('Beleg.pdf');
  });

  it('erkennt gültige und ungültige Muster', () => {
    expect(isValidFileNamePattern(DEFAULT_FILE_NAME_PATTERN)).toBe(true);
    expect(isValidFileNamePattern('{TYPE}-{NUMBER}')).toBe(true);
    // Ohne Platzhalter hießen alle Belege gleich und überschrieben sich beim
    // Empfänger gegenseitig.
    expect(isValidFileNamePattern('Rechnung')).toBe(false);
    expect(isValidFileNamePattern('{NUMMER}')).toBe(false);
    expect(isValidFileNamePattern('{NUMBER}{UNBEKANNT}')).toBe(false);
  });
});
