/**
 * Briefpapier hochladen und verknüpfen (M12 — FA-TPL-11, NFA-SEC-31).
 *
 * Die Prüfung liegt auf zwei Schichten, und beide werden hier gegen **echte
 * PDF-Dateien** gehalten statt gegen Bytefolgen: Seitenzahl und Blattmaß sind
 * genau die Eigenschaften, die man einer erfundenen Datei nicht ansieht. Die
 * Dateien entstehen im Test mit pdf-lib — derselben Bibliothek, die sie später
 * unter den Beleg legt.
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, beforeEach } from 'vitest';

import {
  EMPTY_COMPANY_PROFILE,
  getCompanyProfile,
  saveCompanyProfile,
  setCompanyLetterhead,
} from '@/application/company/company-profile';
import { storeLetterheadAsset } from '@/application/company/letterhead';
import { readAssetContent } from '@/application/assets/asset-service';
import { MAX_LETTERHEAD_BYTES } from '@/domain/assets/pdf-upload';

import { resetDatabase, TEST_ACTOR_ID } from './setup/database';
import { testOrganization as org } from './setup/organization';

const ACTOR = TEST_ACTOR_ID;

const COMPANY = {
  ...EMPTY_COMPANY_PROFILE,
  legalName: 'Musterbetrieb Tim',
  addressLine1: 'Hauptstr. 1',
  postalCode: '89518',
  city: 'Heidenheim',
};

/** Ein Bogen in Punkten — A4 misst 595,276 × 841,890. */
async function pdfWithPages(sizes: readonly (readonly [number, number])[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (const [width, height] of sizes) {
    document.addPage([width, height]);
  }
  return document.save();
}

const A4: readonly [number, number] = [595.276, 841.89];
const A5: readonly [number, number] = [419.528, 595.276];

async function a4Letterhead(): Promise<Uint8Array> {
  return pdfWithPages([A4]);
}

beforeEach(async () => {
  await resetDatabase();
  await saveCompanyProfile(org, COMPANY, ACTOR, null);
});

describe('FA-TPL-11 Ein Briefpapier ist eine einseitige A4-PDF', () => {
  it('nimmt einen A4-Bogen an und legt ihn ab', async () => {
    const result = await storeLetterheadAsset(
      org,
      await a4Letterhead(),
      'application/pdf',
      'briefpapier.pdf',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mimeType).toBe('application/pdf');
    expect(result.value.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Die Datei liegt wirklich da und ist die hochgeladene.
    const content = await readAssetContent(result.value);
    expect(content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(content.byteLength).toBe(result.value.byteSize);
  });

  it('weist ein zweiseitiges Briefpapier ab — die zweite Seite sähe niemand', async () => {
    const result = await storeLetterheadAsset(
      org,
      await pdfWithPages([A4, A4]),
      'application/pdf',
      'zwei-seiten.pdf',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('MULTIPLE_PAGES');
    if (result.error.kind !== 'MULTIPLE_PAGES') return;
    expect(result.error.pageCount).toBe(2);
  });

  it('weist A5 ab und nennt das gefundene Maß', async () => {
    const result = await storeLetterheadAsset(
      org,
      await pdfWithPages([A5]),
      'application/pdf',
      'zu-klein.pdf',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NOT_A4');
    if (result.error.kind !== 'NOT_A4') return;
    expect(Math.round(result.error.widthMm)).toBe(148);
    expect(Math.round(result.error.heightMm)).toBe(210);
  });

  it('weist eine beschädigte Datei als solche ab, nicht als Serverfehler', async () => {
    // Signatur stimmt, der Rest ist Unsinn — pdf-lib scheitert beim Lesen.
    const kaputt = new TextEncoder().encode('%PDF-1.7\nkein gültiger Objektbaum\n%%EOF');

    const result = await storeLetterheadAsset(org, kaputt, 'application/pdf', 'kaputt.pdf');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('UNREADABLE');
  });

  it('weist ein PNG mit gefälschtem Typ ab, bevor pdf-lib es anfasst', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

    const result = await storeLetterheadAsset(org, png, 'application/pdf', 'logo.pdf');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NOT_A_PDF');
  });

  it('weist eine zu große Datei ab', async () => {
    const gross = new Uint8Array(MAX_LETTERHEAD_BYTES + 1);
    gross.set(new TextEncoder().encode('%PDF-'));

    const result = await storeLetterheadAsset(org, gross, 'application/pdf', 'gross.pdf');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('TOO_LARGE');
  });

  it('legt bei jeder Ablehnung nichts ab — kein Datensatz, keine Datei', async () => {
    const vorher = await getCompanyProfile(org);
    expect(vorher?.letterheadAssetId ?? null).toBeNull();

    await storeLetterheadAsset(org, await pdfWithPages([A4, A4]), 'application/pdf', 'zwei.pdf');

    const nachher = await getCompanyProfile(org);
    expect(nachher?.letterheadAssetId ?? null).toBeNull();
  });
});

describe('FA-TPL-11 Das Briefpapier hängt am Unternehmen', () => {
  it('lässt sich verknüpfen und wieder lösen', async () => {
    const stored = await storeLetterheadAsset(
      org,
      await a4Letterhead(),
      'application/pdf',
      'briefpapier.pdf',
    );
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    await setCompanyLetterhead(org, stored.value.id, ACTOR, null);
    expect((await getCompanyProfile(org))?.letterheadAssetId).toBe(stored.value.id);

    await setCompanyLetterhead(org, null, ACTOR, null);
    expect((await getCompanyProfile(org))?.letterheadAssetId).toBeNull();
  });

  it('lässt sich hinterlegen, bevor die Firmendaten erfasst sind', async () => {
    /*
     * Dieselbe Falle wie beim Logo (M10): Ein `update` setzte voraus, dass die
     * Zeile schon existiert, und wer die Reihenfolge nicht kannte, bekam eine
     * Datenbankausnahme statt einer Meldung.
     */
    await resetDatabase();

    const stored = await storeLetterheadAsset(
      org,
      await a4Letterhead(),
      'application/pdf',
      'briefpapier.pdf',
    );
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    await setCompanyLetterhead(org, stored.value.id, ACTOR, null);
    expect((await getCompanyProfile(org))?.letterheadAssetId).toBe(stored.value.id);
  });
});
