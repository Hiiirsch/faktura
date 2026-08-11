/**
 * FA-PDF-06 / NFA-ARCH-06 — die Seitenangabe als Nachbearbeiter.
 *
 * Geprüft am fertigen PDF und nicht an der Absicht: Der Stempel schreibt in
 * ein bestehendes Dokument, und ob dabei die richtige Seite getroffen wird,
 * lässt sich nur am Ergebnis sehen.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { pageNumberStamp } from '@/infrastructure/rendering/page-number-stamp';

import { pdfContainsText } from '../../support/pdf-text';

async function documentWithPages(count: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < count; index += 1) {
    document
      .addPage([595, 842])
      .drawText(`Inhalt ${String(index + 1)}`, {
        x: 60,
        y: 700,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
  }

  return document.save({ useObjectStreams: false });
}

describe('Seitenangabe stempeln', () => {
  it('lässt ein einseitiges Dokument unangetastet', async () => {
    const source = await documentWithPages(1);
    const result = await pageNumberStamp.process(source);

    // Bytegleich: Ein einseitiger Beleg darf nicht durch pdf-lib laufen,
    // sonst hinge der Hash des Artefakts an dessen Version.
    expect(result).toBe(source);
    expect(pdfContainsText(result, 'Seite 1 von')).toBe(false);
  });

  it('nummeriert ab Seite 2 und lässt Seite 1 frei', async () => {
    const result = await pageNumberStamp.process(await documentWithPages(3));

    expect(pdfContainsText(result, 'Seite 1 von 3')).toBe(false);
    expect(pdfContainsText(result, 'Seite 2 von 3')).toBe(true);
    expect(pdfContainsText(result, 'Seite 3 von 3')).toBe(true);
  });

  it('behält Seitenzahl und vorhandenen Inhalt', async () => {
    const result = await pageNumberStamp.process(await documentWithPages(4));

    const reloaded = await PDFDocument.load(result);
    expect(reloaded.getPageCount()).toBe(4);

    for (const page of [1, 2, 3, 4]) {
      expect(pdfContainsText(result, `Inhalt ${String(page)}`), `Seite ${String(page)}`).toBe(true);
    }
  });

  it('trägt einen sprechenden Namen für die Kette', () => {
    expect(pageNumberStamp.name).toBe('page-number');
  });
});
