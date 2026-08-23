/**
 * Das Briefpapier unter dem Beleg (M12 — FA-TPL-11, NFA-ARCH-06).
 *
 * **Wie man „liegt darunter" prüft, ohne hinzusehen.** Ein Bild zu vergleichen
 * hieße, einen Rasterer in den Test zu holen. Die Frage lässt sich aber genau
 * beantworten, ohne zu zeichnen: In einem PDF liegt oben, was zuletzt im
 * Inhaltsstrom steht. Geprüft wird deshalb die **Reihenfolge** der
 * Zeichenoperationen — das Briefpapier muss vor dem Belegtext stehen.
 *
 * Genau diese Reihenfolge war der Fehler, den man am fertigen PDF erst sieht,
 * wenn der Bogen eine Farbfläche trägt: `drawPage` hängt hinten an, und ein
 * gedeckter Bogen verdeckte damit den ganzen Beleg.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { letterheadBackground } from '@/infrastructure/rendering/letterhead';

const A4_WIDTH_PT = 595.276;
const A4_HEIGHT_PT = 841.89;

const BELEG_TEXT = 'Rechnung RE-2026-0001';

async function beleg(pageCount = 1): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    page.drawText(BELEG_TEXT, { x: 60, y: 700, size: 12, font });
  }

  return document.save();
}

async function bogen(width = A4_WIDTH_PT, height = A4_HEIGHT_PT): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document
    .addPage([width, height])
    .drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.85, 0.92, 0.85) });
  return document.save();
}

/** Die Inhaltsströme einer Seite, entpackt und in ihrer Reihenfolge. */
async function contentStreams(pdf: Uint8Array, pageIndex: number): Promise<string[]> {
  const document = await PDFDocument.load(pdf);
  const page = document.getPages()[pageIndex];
  if (page === undefined) {
    throw new Error('Seite fehlt');
  }

  const contents = page.node.normalizedEntries().Contents;
  const streams: string[] = [];

  for (let index = 0; index < (contents?.size() ?? 0); index += 1) {
    const stream = document.context.lookup(contents?.get(index)) as unknown as {
      getContents(): Uint8Array;
    };
    const raw = Buffer.from(stream.getContents());

    let text: string;
    try {
      text = inflateSync(raw).toString('latin1');
    } catch {
      text = raw.toString('latin1');
    }
    streams.push(text);
  }

  return streams;
}

/** Ab welchem Stream ein Suchtext zum ersten Mal vorkommt. */
function firstIndexContaining(streams: readonly string[], needle: string): number {
  return streams.findIndex((stream) => stream.includes(needle));
}

describe('FA-TPL-11 Der Bogen liegt unter dem Beleg', () => {
  it('zeichnet das Briefpapier vor dem Belegtext', async () => {
    const processed = await letterheadBackground(await bogen()).process(await beleg());
    const streams = await contentStreams(processed, 0);

    const bogenIndex = firstIndexContaining(streams, 'Do');
    const textIndex = firstIndexContaining(streams, 'Tj');

    expect(bogenIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThanOrEqual(0);
    // Das ist die ganze Aussage: zuerst der Bogen, dann der Beleg.
    expect(bogenIndex).toBeLessThan(textIndex);
  });

  it('legt ihn auf **jede** Seite', async () => {
    const processed = await letterheadBackground(await bogen()).process(await beleg(3));

    for (const pageIndex of [0, 1, 2]) {
      const streams = await contentStreams(processed, pageIndex);
      expect(firstIndexContaining(streams, 'Do')).toBeGreaterThanOrEqual(0);
      expect(firstIndexContaining(streams, 'Do')).toBeLessThan(
        firstIndexContaining(streams, 'Tj'),
      );
    }
  });

  it('lässt den Belegtext stehen', async () => {
    // Ein Hintergrund, der den Inhalt ersetzt, wäre der schlimmere Fehler.
    const processed = await letterheadBackground(await bogen()).process(await beleg());
    const streams = await contentStreams(processed, 0);
    const hex = Buffer.from(BELEG_TEXT, 'latin1').toString('hex').toUpperCase();

    expect(streams.some((stream) => stream.toUpperCase().includes(hex))).toBe(true);
  });

  it('behält Seitenzahl und Blattmaß', async () => {
    const processed = await letterheadBackground(await bogen()).process(await beleg(2));
    const document = await PDFDocument.load(processed);

    expect(document.getPageCount()).toBe(2);
    const size = document.getPages()[0]?.getSize();
    expect(Math.round(size?.width ?? 0)).toBe(Math.round(A4_WIDTH_PT));
    expect(Math.round(size?.height ?? 0)).toBe(Math.round(A4_HEIGHT_PT));
  });

  it('zieht einen leicht abweichenden Bogen auf das Blattmaß', async () => {
    /*
     * Beim Hochladen sind 2 mm Spielraum erlaubt. Innerhalb davon wird
     * gestreckt statt zentriert — ein zentrierter Bogen ließe an einer Kante
     * einen weißen Streifen, und genau der fiele auf.
     */
    const knapp = await bogen((209 / 25.4) * 72, (298 / 25.4) * 72);
    const processed = await letterheadBackground(knapp).process(await beleg());
    const streams = await contentStreams(processed, 0);

    // Entscheidend ist, dass er überhaupt gezeichnet wird und vor dem Beleg
    // liegt — die Skalierung steckt in der Matrix seines Stroms.
    expect(firstIndexContaining(streams, 'Do')).toBeGreaterThanOrEqual(0);
    expect(firstIndexContaining(streams, 'Do')).toBeLessThan(
      firstIndexContaining(streams, 'Tj'),
    );
  });

  it('gibt den Beleg unverändert zurück, wenn der Bogen unlesbar ist', async () => {
    // Ein Beleg soll nicht an seiner Gestaltung scheitern.
    const kaputt = new TextEncoder().encode('%PDF-1.7 kein Objektbaum');
    const original = await beleg();

    const processed = await letterheadBackground(kaputt).process(original);

    expect(processed).toBe(original);
  });
});
