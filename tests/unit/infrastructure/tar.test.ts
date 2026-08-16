/**
 * Der handgeschriebene tar-Schreiber (NFA-BETR-03).
 *
 * Dass das Format stimmt, beweist `tests/integration/backup.test.ts`, indem
 * es das Archiv mit dem `tar` des Systems auspackt — das ist der Nachweis, auf
 * den es ankommt. Hier stehen die Ränder, die ein Auspacken nicht zeigt:
 * Blockgrenzen, Prüfsumme und die Grenze, an der das Format aufhört.
 */
import { describe, expect, it } from 'vitest';

import { createTar, tarEnd, tarEntry } from '@/infrastructure/backup/tar';

const NOW = new Date('2026-08-16T10:00:00Z');

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('Blockstruktur', () => {
  it('füllt jeden Eintrag auf ein Vielfaches von 512 auf', () => {
    // 5 Byte Inhalt: ein Kopfblock plus ein aufgefüllter Inhaltsblock.
    const entry = tarEntry({ name: 'a.txt', content: bytes('hallo') }, NOW);

    expect(entry.length).toBe(1024);
  });

  it('braucht für leeren Inhalt keinen Inhaltsblock', () => {
    const entry = tarEntry({ name: 'leer.txt', content: new Uint8Array(0) }, NOW);

    expect(entry.length).toBe(512);
  });

  it('schließt das Archiv mit zwei Nullblöcken ab', () => {
    const end = tarEnd();

    expect(end.length).toBe(1024);
    expect(end.every((byte) => byte === 0)).toBe(true);
  });
});

describe('Kopfdaten', () => {
  it('schreibt den Namen an den Anfang des Kopfes', () => {
    const entry = tarEntry({ name: 'storage/logo.png', content: bytes('x') }, NOW);
    const name = new TextDecoder().decode(entry.subarray(0, 16));

    expect(name).toBe('storage/logo.png');
  });

  it('trägt die Größe oktal ein', () => {
    const entry = tarEntry({ name: 'a', content: new Uint8Array(8) }, NOW);
    const size = new TextDecoder().decode(entry.subarray(124, 135));

    // 8 dezimal ist 10 oktal, nullgefüllt auf elf Stellen.
    expect(size).toBe('00000000010');
  });

  it('rechnet eine Prüfsumme, die zum Kopf passt', () => {
    const entry = tarEntry({ name: 'a', content: bytes('x') }, NOW);
    const header = entry.subarray(0, 512);
    const stored = Number.parseInt(new TextDecoder().decode(header.subarray(148, 154)), 8);

    // Nachgerechnet nach derselben Regel: das Prüfsummenfeld als Leerzeichen.
    const copy = Uint8Array.from(header);
    copy.fill(0x20, 148, 156);
    const computed = copy.reduce((sum, byte) => sum + byte, 0);

    expect(stored).toBe(computed);
  });

  it('kennzeichnet sich als ustar', () => {
    const entry = tarEntry({ name: 'a', content: bytes('x') }, NOW);

    expect(new TextDecoder().decode(entry.subarray(257, 262))).toBe('ustar');
  });
});

describe('Grenzen des Formats', () => {
  it('weist einen zu langen Pfad ab, statt ihn zu kürzen', () => {
    // Ein gekürzter Pfad ergäbe ein Archiv, das sich auspacken lässt und die
    // Datei am falschen Ort ablegt — schlimmer als ein klarer Fehlschlag.
    const tooLong = `storage/${'a'.repeat(120)}.pdf`;

    expect(() => tarEntry({ name: tooLong, content: bytes('x') }, NOW)).toThrow(/zu lang/u);
  });
});

describe('Vollständiges Archiv', () => {
  it('reiht Einträge aneinander und schließt ab', () => {
    const archive = createTar(
      [
        { name: 'faktura.db', content: new Uint8Array(600) },
        { name: 'storage/a.pdf', content: bytes('pdf') },
      ],
      NOW,
    );

    // 512+1024 für den ersten, 512+512 für den zweiten, 1024 Abschluss.
    expect(archive.length).toBe(1536 + 1024 + 1024);
    expect(new TextDecoder().decode(archive.subarray(0, 10))).toBe('faktura.db');
  });
});
