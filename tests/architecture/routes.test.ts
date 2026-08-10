/**
 * Vollständigkeit des Routenverzeichnisses.
 *
 * Vorarbeit für NFA-SEC-01: Der Test, der ab M1 jede Route ohne Sitzung
 * aufruft, kann nur so vollständig sein wie src/routes.ts. Dieser Test gleicht
 * das Verzeichnis gegen das Dateisystem ab — eine neue Route, die niemand
 * eingetragen hat, lässt den Build scheitern, statt unbemerkt ungeschützt zu
 * bleiben.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { routes } from '@/routes';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const appRoot = path.join(projectRoot, 'src', 'app');

const ROUTE_FILES = new Set(['page.tsx', 'route.ts']);

/** Ermittelt aus dem Dateipfad die URL, unter der Next.js die Route ausliefert. */
function toRoutePath(filePath: string): string {
  const relativeDir = path.relative(appRoot, path.dirname(filePath));
  const segments = relativeDir
    .split(path.sep)
    .filter((segment) => segment.length > 0)
    // Routengruppen wie (dashboard) erscheinen nicht in der URL.
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

async function discoverRoutes(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const discovered = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return discoverRoutes(fullPath);
      }
      return ROUTE_FILES.has(entry.name) ? [toRoutePath(fullPath)] : [];
    }),
  );
  return discovered.flat();
}

describe('Routenverzeichnis', () => {
  it('enthält jede im Dateisystem angelegte Route', async () => {
    const discovered = await discoverRoutes(appRoot);
    const declared = routes.map((route) => route.path);

    expect(discovered.length).toBeGreaterThan(0);
    expect([...discovered].sort()).toEqual([...declared].sort());
  });

  it('begründet jede ohne Anmeldung erreichbare Route', () => {
    const publicWithoutReason = routes.filter(
      (route) => route.access === 'public' && (route.publicReason ?? '').trim().length === 0,
    );

    expect(publicWithoutReason).toEqual([]);
  });

  it('führt jeden Pfad nur einmal', () => {
    const paths = routes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
