/**
 * Die Zusagen des Frontend-Entwurfs, soweit sie sich am Quellcode belegen
 * lassen (FA-UI-01, -02, -04, -08; NFA-UI-02, -04).
 *
 * Der Compiler trägt den größten Teil davon schon: `globals.css` löscht die
 * Standardpalette von Tailwind mit `--color-*: initial`, sodass `bg-red-500`
 * keine Klasse mehr erzeugt. Dieser Test ist die zweite Ebene — er nennt den
 * Verstoß beim Namen, statt ihn als fehlende Farbe im Browser enden zu lassen,
 * und er deckt ab, was der Compiler nicht sieht: Literalwerte in Attributen,
 * `outline: none` ohne Ersatz und Verweise ins Netz.
 */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

async function collect(directory: string, extensions: readonly string[]): Promise<string[]> {
  const entries = await readdir(path.join(projectRoot, directory), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(relative, extensions)));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(relative);
    }
  }

  return files;
}

async function componentFiles(): Promise<readonly { file: string; source: string }[]> {
  const files = [
    ...(await collect('src/app', ['.tsx'])),
    ...(await collect('src/ui', ['.tsx'])),
  ];

  return files.map((file) => ({
    file,
    source: readFileSync(path.join(projectRoot, file), 'utf8'),
  }));
}

/** Entfernt Blockkommentare — dort stehen Erläuterungen, kein Markup. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('FA-UI-01 Alle Werte stammen aus den Tokens', () => {
  it('enthält keine Farbliterale im Komponentencode', async () => {
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      const code = withoutComments(source);
      // Hexfarben, rgb()/hsl() und die Standardpalette von Tailwind.
      const literals = [
        ...code.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
        ...code.matchAll(/\b(?:rgba?|hsla?)\(/g),
        ...code.matchAll(
          /\b(?:bg|text|border|ring|divide|placeholder|accent|outline|from|via|to)-(?:neutral|gray|zinc|stone|slate|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d+)?\b/g,
        ),
      ];

      for (const match of literals) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('verwendet keine willkürlichen Farben, Abstände, Radien oder Schriftgrößen', async () => {
    const offenders: string[] = [];

    // Genau die vier Größen, die FA-UI-01 nennt. Ein Rasterverhältnis wie
    // `grid-cols-[1fr_2fr]` ist keine davon — es beschreibt die Aufteilung
    // einer Fläche, nicht einen Wert aus dem Tokensatz, und bleibt erlaubt.
    const pattern =
      /\b(?:bg|text|border|ring|divide|outline|fill|stroke|accent|shadow|rounded|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|inset|top|right|bottom|left|leading|tracking)-\[[^\]]+\]/g;

    for (const { file, source } of await componentFiles()) {
      for (const match of withoutComments(source).matchAll(pattern)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * Schriftgrößen außerhalb des Tokensatzes.
   *
   * `--text-*: initial` löscht die Standardskala von Tailwind, also erzeugt
   * `text-3xl` keine Regel mehr — die Überschrift erschien in der geerbten
   * Größe. Das ist der unangenehme Fall: kein Fehler, keine falsche Farbe, nur
   * eine Seite, die etwas anders aussieht als gedacht. Drei Überschriften
   * standen so seit M5.5b im Quelltext.
   */
  it('verwendet keine Schriftgröße außerhalb des Tokensatzes', async () => {
    const offenders: string[] = [];
    const scale = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g;

    for (const { file, source } of await componentFiles()) {
      for (const match of withoutComments(source).matchAll(scale)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * Klassen, die auf eine gelöschte Skala zeigen.
   *
   * `--container-*: initial` löscht die Breitenskala, `--radius-*` und
   * `--shadow-*` ihre jeweilige. Eine Klasse wie `max-w-md` erzeugt danach
   * **keine Regel** — sie ist kein Fehler, sie tut nur nichts. Die
   * Anmeldeseite stand deshalb über die volle Fensterbreite, ohne dass im
   * Quelltext etwas falsch aussah.
   *
   * Diese Prüfung ist der Preis dafür, die Standardskalen gelöscht zu haben:
   * Was der Compiler nicht mehr meldet, muss der Test melden.
   */
  it('verweist auf keine gelöschte Größenskala', async () => {
    const offenders: string[] = [];
    const deleted =
      /\b(?:max-w|min-w|w|h|max-h|min-h)-(?:3xs|2xs|xs|sm|md|lg|xl|[2-7]xl|prose|screen-[a-z]+)\b/g;

    for (const { file, source } of await componentFiles()) {
      for (const match of withoutComments(source).matchAll(deleted)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('kennt keine `dark:`-Variante — das Schema tauscht Tokens, nicht Klassen', async () => {
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      if (withoutComments(source).includes('dark:')) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Drei Erhebungsstufen, nicht mehr (§1, §2.3).
 *
 * Die erste Fassung des Entwurfs erlaubte neben dem Blatt gar keine Erhebung.
 * Diese Regel ließ keinen Platz für Flächen, die *über* dem Inhalt liegen —
 * Dialog, Toast, Auswahlleiste. Seit M5.8 gibt es dafür eine mittlere Stufe.
 *
 * Was der Test weiterhin verhindert: eine vierte Stufe, ein frei gewählter
 * Schatten und der Rückfall in die Kartenwut. `shadow-raised` ist eine
 * Ausnahme mit Begründungspflicht — der Test zählt sie, damit ihre Ausbreitung
 * im Diff sichtbar wird.
 */
describe('FA-UI-02 Drei Erhebungsstufen', () => {
  const RAISED_SURFACES = [
    'src/ui/components/dialog.tsx',
    'src/ui/components/toast.tsx',
    'src/app/invoices/selection-bar.tsx',
    'src/ui/components/metric.tsx',
  ];

  it('verwendet keine andere Erhebung als `shadow-sheet` und `shadow-raised`', async () => {
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      for (const match of withoutComments(source).matchAll(/\bshadow-[a-z0-9-]+/g)) {
        if (match[0] !== 'shadow-sheet' && match[0] !== 'shadow-raised') {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('hebt nur die Flächen, die über dem Inhalt liegen', async () => {
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      if (withoutComments(source).includes('shadow-raised') && !RAISED_SURFACES.includes(file)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('trägt `shadow-sheet` nur dort, wo wirklich ein Beleg steht', async () => {
    // Beide Stellen zeigen dieselbe Sache: das gesetzte Dokument. Die eine im
    // Beleg, die andere in der Vorschau der Vorlage, die ihn setzt.
    const sheets = ['src/app/invoices/[id]/page.tsx', 'src/app/settings/templates/template-forms.tsx'];
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      if (withoutComments(source).includes('shadow-sheet') && !sheets.includes(file)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('verwendet keinen anderen Radius als die beiden aus dem Tokensatz', async () => {
    const offenders: string[] = [];
    const allowed = ['rounded-control', 'rounded-surface', 'rounded-none'];

    for (const { file, source } of await componentFiles()) {
      for (const match of withoutComments(source).matchAll(/\brounded(-[a-z0-9-]+)?\b/g)) {
        if (!allowed.includes(match[0])) {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('definiert genau drei Erhebungsstufen im Tokensatz', () => {
    const css = readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');
    const shadows = [...css.matchAll(/^\s*--shadow-([a-z0-9-]+):/gm)].map((match) => match[1]);

    // Die dritte Stufe ist „keine" und steht nicht im Tokensatz. Jeder Name
    // darf mehrfach vorkommen — das dunkle Schema überschreibt beide.
    expect([...new Set(shadows)].sort()).toEqual(['raised', 'sheet']);
  });

  it('überschreibt beide Erhebungen im dunklen Schema', () => {
    const css = readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');
    const dark = css.slice(css.indexOf('prefers-color-scheme: dark'));

    // Ein Schatten aus dunklem Grün auf dunklem Grund ist keiner.
    expect(dark).toContain('--shadow-raised');
    expect(dark).toContain('--shadow-sheet');
  });
});

describe('NFA-UI-02 Jedes fokussierbare Element zeigt einen Fokusring', () => {
  it('setzt `outline-none` nirgends ohne Ersatz', async () => {
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      const code = withoutComments(source);
      if (/\boutline-none\b/.test(code) || /outline:\s*none/.test(code)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('legt den Ring als echte `outline` fest, nicht als Schatten', () => {
    const form = readFileSync(path.join(projectRoot, 'src/ui/components/form.tsx'), 'utf8');

    expect(form).toContain('focus-visible:outline-2');
    expect(form).toContain('focus-visible:outline-offset-2');
    expect(form).toContain('focus-visible:outline-accent');
  });
});

describe('FA-UI-04 / NFA-UI-04 Keine Anfrage nach außen', () => {
  it('bindet die Schriften aus dem Paket ein, nicht von einem CDN', () => {
    const css = readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');
    const imports = [...css.matchAll(/@import '([^']+)'/g)].map((match) => match[1] ?? '');

    const fontImports = imports.filter((value) => value.includes('fontsource'));
    expect(fontImports.length).toBeGreaterThan(0);

    for (const value of imports) {
      expect(value.startsWith('http')).toBe(false);
    }

    // Und die eingebundenen Dateien verweisen ihrerseits nur auf Nachbardateien.
    for (const value of fontImports) {
      const file = path.join(projectRoot, 'node_modules', value);
      const source = readFileSync(file, 'utf8');
      const urls = [...source.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1] ?? '');

      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url.startsWith('./')).toBe(true);
      }
    }
  });

  it('enthält keine Adresse eines fremden Hosts im Frontend', async () => {
    const offenders: string[] = [];
    const files = [
      ...(await componentFiles()),
      {
        file: 'src/app/globals.css',
        source: readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8'),
      },
    ];

    for (const { file, source } of files) {
      const code = withoutComments(source);
      const patterns = [
        /(?:src|href)=["'`]https?:\/\//g,
        /url\(\s*["']?https?:\/\//g,
        /fetch\(\s*["'`]https?:\/\//g,
      ];

      for (const pattern of patterns) {
        for (const match of code.matchAll(pattern)) {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Kein `require.resolve` in der Quellschicht.
 *
 * Steht hier, weil es dieselbe Klasse von Fehler ist wie die übrigen Prüfungen
 * dieser Datei: etwas, das in Entwicklung und Test funktioniert und erst im
 * gebündelten Serverchunk auseinanderfällt. Der Bündler ersetzt
 * `require.resolve` durch seine eigene Modulauflösung und liefert eine
 * Modulnummer statt eines Dateipfads — `readFile` scheitert dann zur Laufzeit
 * mit `ERR_INVALID_ARG_TYPE`, und zwar erst im Container.
 *
 * Dateipfade werden stattdessen aus `process.cwd()` gebaut, wie in
 * `compromised-passwords.ts` und `document-font.ts`.
 */
describe('Dateizugriffe überstehen das Bündeln', () => {
  it('verwendet nirgends `require.resolve`', async () => {
    const offenders: string[] = [];

    const files = [
      ...(await collect('src', ['.ts', '.tsx'])),
      ...(await collect('scripts', ['.ts'])),
    ];

    for (const file of files) {
      const source = withoutComments(readFileSync(path.join(projectRoot, file), 'utf8'));
      if (/\brequire\s*\.\s*resolve\s*\(/.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Protokolliert wird strukturiert, nicht per `console` (NFA-BETR-09).
 *
 * Ein `console.error('…', user)` ist in einer Sekunde geschrieben und umgeht
 * beides, was das Log leisten soll: die maschinenlesbare Form **und** die
 * Entfernung von Geheimnissen (NFA-BETR-10). Der Logger sitzt im Schreibweg;
 * diese Prüfung sorgt dafür, dass niemand daran vorbeischreibt.
 */
describe('NFA-BETR-09 Protokolliert wird über den Logger', () => {
  it('verwendet `console` nirgends in der Anwendungsschicht', async () => {
    const offenders: string[] = [];

    for (const file of await collect('src', ['.ts', '.tsx'])) {
      // Der Logger selbst schreibt am Ende über `console.log` — er ist die
      // eine Stelle, an der das richtig ist.
      if (file.endsWith('logging/logger.ts')) {
        continue;
      }

      const source = withoutComments(readFileSync(path.join(projectRoot, file), 'utf8'));
      for (const match of source.matchAll(/\bconsole\.(?:log|info|warn|error|debug)\s*\(/g)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('FA-UI-08 Bewegung nur aus dem Katalog des Entwurfs', () => {
  it('verwendet ausschließlich die festgelegten Dauern', async () => {
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      for (const match of withoutComments(source).matchAll(/\bduration-\S*/g)) {
        // Der Katalog aus §2.4. Der Ladebalken steht nicht darin: Er läuft
        // fortlaufend und trägt seine Dauer in `globals.css`, nicht als
        // Utility am Element.
        const allowed = [
          'duration-(--duration-state)',
          'duration-(--duration-dialog)',
          'duration-(--duration-toast)',
          'duration-(--duration-stamp)',
        ];
        const value = match[0].replace(/["'`}].*$/, '');
        if (!allowed.includes(value)) {
          offenders.push(`${file}: ${value}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('schaltet jede Bewegung bei `prefers-reduced-motion` ab', () => {
    const css = readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');

    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('transition-duration: 0ms !important');
    expect(css).toContain('animation-duration: 0ms !important');
  });

  it('nennt jede Dauer als Token, keine als Zahl', () => {
    const css = readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');
    const durations = [...css.matchAll(/^\s*--duration-([a-z]+):/gm)].map((match) => match[1]);

    expect(durations.sort()).toEqual(['dialog', 'progress', 'stamp', 'state', 'toast']);
  });

  /**
   * Keyframes sind Bewegung, die kein `duration-`-Utility trägt.
   *
   * Ohne diese Prüfung wäre der Katalog aus §2.4 an einer Stelle offen: Eine
   * Animation ließe sich in `globals.css` erfinden, ohne dass eine der übrigen
   * Prüfungen anschlüge.
   */
  it('kennt nur die beiden benannten Keyframes', () => {
    const css = readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');
    const frames = [...css.matchAll(/@keyframes\s+([a-z-]+)/g)].map((match) => match[1]);

    expect(frames.sort()).toEqual(['faktura-progress', 'faktura-stamp']);
  });
});
