/**
 * Keine Daten an Dritte, lauffähig ohne Internet (NFA-COMP-05, NFA-COMP-06).
 *
 * Die Anwendung führt die Buchhaltung eines Unternehmens auf dessen eigenem
 * Server. Dass dabei nichts nach außen geht, ist keine Nebensache, sondern der
 * Grund, warum sie selbst gehostet wird — und es ist eine Zusage, die sich
 * schleichend verliert: ein Schriftpaket von einem CDN hier, ein Aufruf einer
 * Wechselkurs-API dort, und niemand bemerkt es, weil im Entwicklungsnetz alles
 * erreichbar ist.
 *
 * Geprüft wird deshalb an drei Stellen zugleich:
 *
 * 1. **Im Quelltext**: keine Adresse eines fremden Hosts in einem Aufruf.
 * 2. **In der Richtlinie**: `connect-src` und `default-src` lassen den Browser
 *    gar nicht erst nach außen.
 * 3. **Im Renderer**: Eine Vorlage mit externem Bild erzeugt nachweislich
 *    keinen Aufruf — das prüft `tests/integration/rendering.test.ts`
 *    (NFA-SEC-12).
 *
 * Was hier **nicht** geprüft werden kann: dass der Betrieb keinen ausgehenden
 * Verkehr zulässt. Das ist Sache der Firewall, nicht des Quelltextes.
 */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

async function collect(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(projectRoot, directory), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(relative)));
    } else if (/\.(?:ts|tsx)$/u.test(entry.name)) {
      files.push(relative);
    }
  }

  return files;
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

describe('NFA-COMP-05 Keine ausgehende Verbindung', () => {
  it('ruft im Quelltext keinen fremden Host auf', async () => {
    const offenders: string[] = [];

    for (const file of await collect('src')) {
      const code = withoutComments(readFileSync(path.join(projectRoot, file), 'utf8'));

      for (const match of code.matchAll(/https?:\/\/[a-z0-9.-]+/giu)) {
        const url = match[0];
        // Erlaubt sind ausschließlich Bezeichner, die keine Adresse sind:
        // Namensräume in XML und die eigene Anwendung.
        const isNamespace = url.startsWith('http://www.w3.org');
        const isLocal = /(?:localhost|127\.0\.0\.1)/u.test(url);
        if (!isNamespace && !isLocal) {
          offenders.push(`${file}: ${url}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('lässt den Browser über die Richtlinie nicht nach außen', () => {
    const headers = readFileSync(
      path.join(projectRoot, 'src/infrastructure/security/security-headers.ts'),
      'utf8',
    );

    // Alles ist verboten, bis es einzeln erlaubt wird …
    expect(headers).toContain(`"default-src 'none'"`);
    // … und der einzige erlaubte Verbindungsweg ist die eigene Herkunft.
    expect(headers).toMatch(/connect-src \$\{connectSrc\}/u);
    expect(headers).toContain("'self'");
    // Kein Platzhalter, der alles öffnet.
    expect(headers).not.toContain('https://*');
    expect(headers).not.toContain("connect-src *");
  });

  it('bindet keine Abhängigkeit ein, die von sich aus nach außen greift', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    const dependencies = Object.keys(manifest.dependencies ?? {});
    // Analyse-, Fehler- und Telemetriedienste haben in dieser Anwendung
    // nichts zu suchen (NFA-COMP-06).
    const forbidden = /sentry|analytics|posthog|segment|datadog|newrelic|mixpanel|bugsnag/iu;

    expect(dependencies.filter((name) => forbidden.test(name))).toEqual([]);
  });
});
