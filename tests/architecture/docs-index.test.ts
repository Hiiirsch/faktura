/**
 * Der Suchindex des Handbuchs gegen seine Quellen (M16, FA-DOC-03).
 *
 * **Das ist der eigentliche Punkt des Bausteins.** Der Index wird erzeugt und
 * eingecheckt, damit der Containerbau nichts herstellen muss. Der Preis dafür
 * ist eine zweite Fassung desselben Textes — und die zweite ist die, die nach
 * einer Änderung nicht mehr stimmt. Wer eine MDX-Datei ändert und
 * `npm run docs:index` vergisst, hätte eine Suche, die stumm veraltet: Sie
 * findet noch, was gestern dastand.
 *
 * Hier wird deshalb neu erzeugt und verglichen. Der Test ist die einzige
 * Stelle, die das bemerken kann.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildIndex, entriesOf, renderModule } from '../../scripts/build-docs-index';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const generatedFile = path.join(projectRoot, 'src', 'domain', 'docs', 'search-index.generated.ts');

describe('FA-DOC-03 Der Suchindex passt zu den Quellen', () => {
  it('stimmt mit der eingecheckten Fassung überein', async () => {
    const erwartet = renderModule(await buildIndex());
    const eingecheckt = await readFile(generatedFile, 'utf8');

    expect(
      eingecheckt,
      'Der Suchindex ist veraltet — `npm run docs:index` ausführen.',
    ).toBe(erwartet);
  });

  it('findet überhaupt Abschnitte', async () => {
    // Ohne diese Prüfung wäre der Vergleich oben auch dann grün, wenn der
    // Erzeuger nichts mehr fände und die eingecheckte Datei leer wäre.
    const entries = await buildIndex();

    expect(entries.length).toBeGreaterThanOrEqual(20);
    expect(new Set(entries.map((entry) => entry.topicId)).size).toBeGreaterThanOrEqual(10);
  });

  it('nimmt Importe, Metadaten und Auszeichnung aus dem Text', () => {
    const quelle = [
      "import { X } from '@/domain/x';",
      '',
      "export const meta = { id: 'probe', title: 'Probe', summary: 'Kurz.' };",
      '',
      '## Überschrift',
      '',
      'Ein Satz mit **Hervorhebung** und `Code`.',
      '',
      '- Ein Punkt',
    ].join('\n');

    const [eintrag] = entriesOf(quelle);

    expect(eintrag?.topicId).toBe('probe');
    expect(eintrag?.heading).toBe('Überschrift');
    expect(eintrag?.text).toBe('Ein Satz mit Hervorhebung und Code. Ein Punkt');
    expect(eintrag?.text).not.toContain('import');
    expect(eintrag?.text).not.toContain('meta');
  });

  it('macht aus einem eingesetzten Wert eine Auslassungsmarke', () => {
    /*
     * Die bekannte Grenze, festgehalten statt verschwiegen: Der Index kennt die
     * Werte nicht. „mindestens … Zeichen" liest sich als Auslassung; „mindestens
     * Zeichen" läse sich wie ein Fehler im Programm.
     */
    const quelle = [
      "export const meta = { id: 'probe', title: 'Probe', summary: 'Kurz.' };",
      '',
      '## Überschrift',
      '',
      'Ein Passwort ist mindestens {MIN_PASSWORD_LENGTH} Zeichen lang.',
    ].join('\n');

    const [eintrag] = entriesOf(quelle);

    expect(eintrag?.text).toBe('Ein Passwort ist mindestens … Zeichen lang.');
  });

  it('führt die Neuerungen als letztes Thema, das Anmelden als erstes', async () => {
    /*
     * Die Reihenfolge ist eine Aussage: Wer das Handbuch zum ersten Mal öffnet,
     * will wissen, wie man sich anmeldet — nicht, was sich seit dem letzten Mal
     * geändert hat. Ein Eintrag, der oben einsortiert wird, kehrt das um.
     *
     * **Gelesen wird der Quelltext, nicht das Modul.** Die schnelle Suite kennt
     * den MDX-Lader nicht; ein `import` von `@/content/hilfe` scheitert dort
     * beim Übersetzen der ersten Überschrift. Für eine Reihenfolge genügt der
     * Text.
     */
    const source = await readFile(
      path.join(projectRoot, 'src', 'content', 'hilfe', 'index.ts'),
      'utf8',
    );

    const liste = source.slice(source.indexOf('HELP_TOPICS'));
    const reihenfolge = [...liste.matchAll(/\{ meta: (\w+), Content:/gu)].map((m) => m[1]);

    expect(reihenfolge[0]).toBe('anmeldung');
    expect(reihenfolge.at(-1)).toBe('neuerungen');
  });

  it('weist eine Datei ohne `meta` ab, statt sie zu überspringen', () => {
    // Eine übersprungene Datei fehlte in der Suche, ohne dass es jemand merkt.
    expect(() => entriesOf('## Nur eine Überschrift\n\nText.')).toThrow();
  });
});
