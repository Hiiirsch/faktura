/**
 * Prüfung hochgeladener PDF-Dateien (M12, FA-TPL-11, NFA-SEC-31).
 *
 * Geprüft wird über Bytes, nicht über Dateien: Die Domain kennt kein
 * Dateisystem, und die Fälle, auf die es ankommt — eine als PDF deklarierte
 * fremde Datei, ein Bogen mit eingebettetem JavaScript — lassen sich als
 * Bytefolge genauer herstellen als durch eine Beispieldatei.
 */
import { describe, expect, it } from 'vitest';

import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  containsActivePdfContent,
  isA4,
  isPdf,
  MAX_LETTERHEAD_BYTES,
  pointsToMm,
  validatePdfUpload,
} from '@/domain/assets/pdf-upload';

function pdfBytes(body = '\n1 0 obj\n<< >>\nendobj\n'): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7${body}%%EOF\n`);
}

const A4_WIDTH_PT = 595.276;
const A4_HEIGHT_PT = 841.89;

describe('isPdf erkennt die Signatur', () => {
  it('nimmt an, was mit %PDF- beginnt', () => {
    expect(isPdf(pdfBytes())).toBe(true);
  });

  it('weist ein PNG ab, auch wenn es als PDF gemeldet wird', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(isPdf(png)).toBe(false);
    expect(validatePdfUpload(png, 'application/pdf').ok).toBe(false);
  });

  it('weist eine zu kurze Datei ab, statt über ihr Ende hinauszulesen', () => {
    expect(isPdf(new Uint8Array([0x25, 0x50]))).toBe(false);
  });
});

describe('validatePdfUpload', () => {
  it('nimmt eine gewöhnliche PDF an', () => {
    const result = validatePdfUpload(pdfBytes(), 'application/pdf');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.byteSize).toBeGreaterThan(0);
  });

  it('nimmt sie auch ohne gemeldeten Typ an', () => {
    // Manche Browser melden für eine per Ziehen abgelegte Datei nichts.
    expect(validatePdfUpload(pdfBytes(), '').ok).toBe(true);
  });

  it('weist eine leere Datei ab', () => {
    const result = validatePdfUpload(new Uint8Array(), 'application/pdf');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('EMPTY');
  });

  it('weist über 5 MB ab', () => {
    const large = new Uint8Array(MAX_LETTERHEAD_BYTES + 1);
    large.set(new TextEncoder().encode('%PDF-'));

    const result = validatePdfUpload(large, 'application/pdf');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('TOO_LARGE');
  });

  it('weist einen widersprechenden Typ ab', () => {
    const result = validatePdfUpload(pdfBytes(), 'image/png');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NOT_A_PDF');
  });

  it.each(['/JavaScript', '/JS', '/Launch', '/EmbeddedFile', '/OpenAction'])(
    'weist ein Briefpapier mit %s ab',
    (marker) => {
      const result = validatePdfUpload(pdfBytes(`\n1 0 obj\n<< ${marker} 2 0 R >>\n`), 'application/pdf');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('ACTIVE_CONTENT');
    },
  );

  it('sieht ausführbare Bestandteile auch ohne die Gesamtprüfung', () => {
    expect(containsActivePdfContent(pdfBytes('\n/OpenAction 1 0 R\n'))).toBe(true);
    expect(containsActivePdfContent(pdfBytes())).toBe(false);
  });
});

describe('isA4 mit 2 mm Spielraum', () => {
  it('nimmt das genaue Maß an', () => {
    expect(isA4(A4_WIDTH_PT, A4_HEIGHT_PT)).toBe(true);
  });

  it('nimmt eine Abweichung innerhalb des Spielraums an', () => {
    // Ein Gestaltungsprogramm, das auf ganze Millimeter rundet.
    const width = (209 / 25.4) * 72;
    const height = (298 / 25.4) * 72;
    expect(isA4(width, height)).toBe(true);
  });

  it('weist A5 ab', () => {
    expect(isA4((148 / 25.4) * 72, (210 / 25.4) * 72)).toBe(false);
  });

  it('weist Querformat ab — ein gedrehter Bogen ist nicht derselbe', () => {
    expect(isA4(A4_HEIGHT_PT, A4_WIDTH_PT)).toBe(false);
  });

  it('rechnet Punkte in Millimeter um', () => {
    expect(Math.round(pointsToMm(A4_WIDTH_PT))).toBe(A4_WIDTH_MM);
    expect(Math.round(pointsToMm(A4_HEIGHT_PT))).toBe(A4_HEIGHT_MM);
  });
});
