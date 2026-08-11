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

describe('FA-UI-02 Nur das Blatt ist erhaben', () => {
  it('verwendet keine andere Erhebung als `shadow-sheet`', async () => {
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      for (const match of withoutComments(source).matchAll(/\bshadow-[a-z0-9-]+/g)) {
        if (match[0] !== 'shadow-sheet') {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('verwendet keinen anderen Radius als `rounded-control`', async () => {
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      for (const match of withoutComments(source).matchAll(/\brounded(-[a-z0-9-]+)?\b/g)) {
        if (match[0] !== 'rounded-control' && match[0] !== 'rounded-none') {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('definiert genau eine Erhebungsstufe im Tokensatz', () => {
    const css = readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');
    const shadows = [...css.matchAll(/^\s*--shadow-([a-z0-9-]+):/gm)].map((match) => match[1]);

    expect(shadows).toEqual(['sheet']);
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

describe('FA-UI-08 Bewegung nur bei Zustandswechsel und beim Festschreiben', () => {
  it('verwendet ausschließlich die drei festgelegten Dauern', async () => {
    const offenders: string[] = [];

    for (const { file, source } of await componentFiles()) {
      for (const match of withoutComments(source).matchAll(/\bduration-\S*/g)) {
        const allowed = [
          'duration-(--duration-state)',
          'duration-(--duration-dialog)',
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
});
