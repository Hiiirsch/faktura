/**
 * Erzeugt den Suchindex des Handbuchs (M16, FA-DOC-03).
 *
 * **Warum ein erzeugter Index und keine Suche über den gerenderten Text.** MDX
 * wird zu React-Komponenten übersetzt; der Fließtext liegt danach nicht mehr
 * als Zeichenkette vor, die man durchsuchen könnte. Der Index entsteht deshalb
 * aus den **Quellen**, beim Erzeugen, und wird eingecheckt.
 *
 * **Eingecheckt und nicht beim Bauen erzeugt.** Der Containerbau soll nichts
 * herstellen müssen, und ein Build, der Dateien schreibt, ist nicht mehr
 * reproduzierbar. Dass die eingecheckte Fassung zu den Quellen passt, hält
 * `tests/architecture/docs-index.test.ts` fest: Er erzeugt sie im Speicher neu
 * und vergleicht. Wer eine MDX-Datei ändert und `npm run docs:index` vergisst,
 * kommt dort nicht vorbei — ohne diesen Wächter wäre die Suche nach der
 * zweiten Änderung stumm falsch.
 *
 * **Bekannte Grenze:** Eingesetzte Konstanten stehen nicht als Wert im Index.
 * Aus `Eine Sitzung gilt {formatRetention(SESSION_LIFETIME_MS)}.` wird
 * `Eine Sitzung gilt .` — eine Suche nach „7 Tage" findet den Satz also nicht,
 * eine nach „Sitzung" schon. Die Werte beim Erzeugen auszuwerten hieße, den
 * Index gegen die laufende Anwendung zu bauen; dafür ist der Gewinn zu klein.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const contentDir = path.join(projectRoot, 'src', 'content', 'hilfe');
const targetFile = path.join(projectRoot, 'src', 'domain', 'docs', 'search-index.generated.ts');

/** Ein durchsuchbarer Abschnitt: eine Überschrift samt ihrem Text. */
export type HelpIndexEntry = {
  readonly topicId: string;
  readonly topicTitle: string;
  /** Die Überschrift, unter der der Text steht. */
  readonly heading: string;
  /** Der Fließtext, von Markdown befreit. */
  readonly text: string;
};

/** Liest `id` und `title` aus dem `meta`-Block der Datei. */
function readMeta(source: string): { id: string; title: string } | null {
  const id = /id:\s*'([^']+)'/u.exec(source)?.[1];
  const title = /title:\s*'([^']+)'/u.exec(source)?.[1];

  return id === undefined || title === undefined ? null : { id, title };
}

/**
 * Entfernt alles, was kein Fließtext ist.
 *
 * Die Reihenfolge ist wesentlich: Erst gehen Importe und der `meta`-Block, dann
 * die Ausdrücke in geschweiften Klammern, zuletzt die Auszeichnungszeichen.
 * Andersherum risse das Entfernen von `*` mitten in einen Ausdruck.
 */
function toPlainText(source: string): string {
  return source
    .replace(/^import .*$/gmu, '')
    .replace(/^export const meta = \{[\s\S]*?\};$/mu, '')
    /*
     * Ein eingesetzter Wert wird zur **Auslassungsmarke**, nicht zur Lücke.
     * „Ein Passwort ist mindestens Zeichen lang" liest sich in einem Suchtreffer
     * wie ein Fehler im Programm; „mindestens … Zeichen lang" liest sich als
     * das, was es ist — eine Stelle, deren Wert auf der Seite steht.
     */
    .replace(/\{[^{}]*\}/gu, '…')
    .replace(/\s+([.,;:])/gu, '$1')
    .replace(/…\./gu, '…')
    .replace(/^[-*]\s+/gmu, '')
    .replace(/^\d+\.\s+/gmu, '')
    .replace(/\*\*/gu, '')
    .replace(/`/gu, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/[ \t]+/gu, ' ')
    .trim();
}

/** Zerlegt eine Datei in ihre Abschnitte — je Überschrift einer. */
export function entriesOf(source: string): readonly HelpIndexEntry[] {
  const meta = readMeta(source);
  if (meta === null) {
    throw new Error('Eine Handbuchdatei ohne `meta` mit `id` und `title`');
  }

  const plain = toPlainText(source);
  const entries: HelpIndexEntry[] = [];

  /*
   * Aufgeteilt an den Überschriften, nicht an Leerzeilen: Ein Treffer soll
   * sagen können, **wo** er steht. „Mahnungen › Wenn nicht gemahnt wird" ist
   * eine Auskunft, „Mahnungen, Absatz 4" ist keine.
   */
  const parts = plain.split(/^#{2,3}\s+/mu).filter((part) => part.trim().length > 0);

  for (const part of parts) {
    const [headingLine, ...rest] = part.split('\n');
    const text = rest.join(' ').replace(/\s+/gu, ' ').trim();

    if (text.length === 0) {
      continue;
    }

    entries.push({
      topicId: meta.id,
      topicTitle: meta.title,
      heading: (headingLine ?? '').trim(),
      text,
    });
  }

  return entries;
}

export async function buildIndex(): Promise<readonly HelpIndexEntry[]> {
  const files = (await readdir(contentDir))
    .filter((name) => name.endsWith('.mdx'))
    .sort((a, b) => a.localeCompare(b, 'de'));

  const entries: HelpIndexEntry[] = [];
  for (const file of files) {
    const source = await readFile(path.join(contentDir, file), 'utf8');
    entries.push(...entriesOf(source));
  }

  return entries;
}

export function renderModule(entries: readonly HelpIndexEntry[]): string {
  return `/**
 * Der Suchindex des Handbuchs — **erzeugt, nicht von Hand geschrieben**.
 *
 * Quelle sind die MDX-Dateien in \`src/content/hilfe/\`. Neu erzeugt wird er mit
 * \`npm run docs:index\`; dass er zu den Quellen passt, hält
 * \`tests/architecture/docs-index.test.ts\` fest.
 *
 * Änderungen an dieser Datei gehen beim nächsten Lauf verloren.
 */
import type { HelpIndexEntry } from './search';

export const HELP_INDEX: readonly HelpIndexEntry[] = ${JSON.stringify(entries, null, 2)};
`;
}

const isEntryPoint = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  const entries = await buildIndex();
  await writeFile(targetFile, renderModule(entries), 'utf8');
  process.stdout.write(`${String(entries.length)} Abschnitte in den Suchindex geschrieben.\n`);
}
