/**
 * NFA-UI-01 — Kontrast mindestens 4.5:1 für Text und 3:1 für Bedienelemente,
 * geprüft über alle Tokenkombinationen.
 *
 * Der Test liest die Werte aus `globals.css` statt sie zu wiederholen: Eine
 * Kopie der Palette im Test würde beim ersten Nachjustieren einer Farbe
 * auseinanderlaufen, und dann prüfte er den alten Stand.
 *
 * Geprüft werden **beide** Schemata. Das dunkle ist abgeleitet und nicht im
 * Entwurf vorgegeben — gerade deshalb braucht es den Nachweis.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const css = readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');

/**
 * Die Farbtokens eines Blocks.
 *
 * `@theme { … }` trägt das helle Schema, der `@media`-Block überschreibt für
 * das dunkle. Das dunkle Schema erbt alles, was es nicht selbst nennt.
 */
function tokensOf(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    result[match[1] ?? ''] = match[2] ?? '';
  }
  return result;
}

const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
const darkBlock = /prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n\s*\}/.exec(css)?.[1] ?? '';

const light = tokensOf(themeBlock);
const dark = { ...light, ...tokensOf(darkBlock) };

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** Relative Leuchtdichte nach WCAG 2.1. */
function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);

  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [brighter, darker] = a > b ? [a, b] : [b, a];
  return (brighter + 0.05) / (darker + 0.05);
}

/** Text auf Fläche — 4.5:1. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['ink', 'surface'],
  ['ink', 'surface-sunken'],
  ['ink', 'accent-wash'],
  ['ink', 'ocker-wash'],
  ['ink', 'moss-wash'],
  // Die rote Fläche entsteht seit M5.8 beim Überfahren einer zerstörenden
  // Zeilenaktion — vorher gab es sie nur im Dialogknopf.
  ['ink', 'danger-wash'],
  ['ink-muted', 'surface'],
  ['ink-muted', 'surface-sunken'],
  ['sheet-ink', 'sheet'],
  ['accent', 'surface'],
  ['accent', 'surface-sunken'],
  ['danger', 'surface'],
];

/**
 * Bedienelemente und Bedeutungsträger — 3:1.
 *
 * Hierher gehören der Statuspunkt, der Fokusring, Trennlinien mit Bedeutung
 * und die Schrift auf gefüllten Knöpfen: Sie tragen Information über ihre
 * Form oder Fläche, nicht über einen Buchstaben in Textgröße.
 */
const CONTROL_PAIRS: readonly (readonly [string, string])[] = [
  ['accent', 'surface'],
  ['accent', 'accent-wash'],
  ['accent-hover', 'surface'],
  ['ocker', 'surface'],
  ['ocker', 'ocker-wash'],
  ['moss', 'surface'],
  ['moss', 'moss-wash'],
  ['ink-faint', 'surface'],
  ['ink-faint', 'surface-sunken'],
  ['danger', 'surface'],
  ['danger', 'danger-wash'],
  ['surface', 'accent'],
  ['surface', 'danger'],
];

function check(
  scheme: Readonly<Record<string, string>>,
  pairs: readonly (readonly [string, string])[],
  minimum: number,
): readonly string[] {
  const failures: string[] = [];

  for (const [foreground, background] of pairs) {
    const front = scheme[foreground];
    const back = scheme[background];

    if (front === undefined || back === undefined) {
      failures.push(`${foreground} auf ${background}: Token fehlt`);
      continue;
    }

    const ratio = contrast(front, back);
    if (ratio < minimum) {
      failures.push(`${foreground} auf ${background}: ${ratio.toFixed(2)}:1 < ${String(minimum)}:1`);
    }
  }

  return failures;
}

describe('NFA-UI-01 Kontrast', () => {
  it('liest beide Schemata aus dem Tokensatz', () => {
    expect(Object.keys(light).length).toBeGreaterThan(10);
    expect(Object.keys(tokensOf(darkBlock)).length).toBeGreaterThan(5);
    // Das Blatt bleibt auch im dunklen Schema weiß (NFA-UI-05).
    expect(dark.sheet).toBe('#ffffff');
    expect(dark['sheet-ink']).toBe(light['sheet-ink']);
  });

  it('erreicht 4.5:1 für Text im hellen Schema', () => {
    expect(check(light, TEXT_PAIRS, 4.5)).toEqual([]);
  });

  it('erreicht 4.5:1 für Text im dunklen Schema', () => {
    expect(check(dark, TEXT_PAIRS, 4.5)).toEqual([]);
  });

  it('erreicht 3:1 für Bedienelemente im hellen Schema', () => {
    expect(check(light, CONTROL_PAIRS, 3)).toEqual([]);
  });

  it('erreicht 3:1 für Bedienelemente im dunklen Schema', () => {
    expect(check(dark, CONTROL_PAIRS, 3)).toEqual([]);
  });
});
