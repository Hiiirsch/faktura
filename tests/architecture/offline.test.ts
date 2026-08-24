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
 * **Seit M14 gibt es genau eine Ausnahme**, und sie ist benannt: der Versand
 * per E-Mail an einen Mailserver, den der Betreiber selbst konfiguriert. Ohne
 * Konfiguration bleibt die Anwendung vollständig offline. Die Regel wurde
 * dafür **enger** gefasst statt gestrichen: Es wird jetzt zusätzlich geprüft,
 * dass außer `infrastructure/mail/**` kein Modul einen Netzwerkverkehr
 * aufbaut. Eine Zusage, die man lockert, verliert man; eine, die man
 * einschränkt und dabei schärft, behält man.
 *
 * Geprüft wird deshalb an vier Stellen zugleich:
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

  it('baut außerhalb des Mailmoduls keine Verbindung nach außen auf', async () => {
    /*
     * **Die benannte Ausnahme, und nur sie** (M14).
     *
     * Gesucht wird nach den Werkzeugen, mit denen man **hinaus** greift: die
     * Netzmodule von Node, der Mailversender, und ein `fetch` auf eine
     * absolute Adresse. Erlaubt ist das ausschließlich unter
     * `infrastructure/mail/**` — und dort auch nur mit einer Adresse aus der
     * Umgebung.
     *
     * **Ein `fetch` auf einen eigenen Pfad zählt nicht.** Die Passkey-Zeremonie
     * ruft `/api/passkeys` — dieselbe Herkunft, und der Browser käme über
     * `connect-src 'self'` ohnehin nicht weiter. Der erste Anlauf dieser Regel
     * hat genau das gemeldet und wäre damit eine Regel gewesen, die man
     * abschaltet statt befolgt.
     *
     * `playwright` fällt ebenfalls nicht darunter: Der Renderer spricht mit
     * einem Browser auf demselben Rechner, und dass der nicht nach außen
     * greift, prüft `tests/integration/rendering.test.ts` am erzeugten Beleg.
     */
    const erlaubt = /^src\/infrastructure\/mail\//u;
    const werkzeuge =
      /\b(?:fetch\(\s*[`'"]https?:|createTransport\(|from 'node:(?:net|https|http|dgram|tls)')/u;

    const offenders: string[] = [];

    for (const file of await collect('src')) {
      if (erlaubt.test(file)) {
        continue;
      }

      const code = withoutComments(readFileSync(path.join(projectRoot, file), 'utf8'));
      if (werkzeuge.test(code)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('stellt ohne Konfiguration nichts zu', () => {
    /*
     * Die Bedingung, unter der die alte Zusage weitergilt: Wer keinen
     * Mailserver einträgt, hat eine Anwendung, die nichts hinausschickt. Das
     * steht im Mailmodul als Rückgabewert `not-configured` — hier wird
     * festgehalten, dass es diesen Zweig überhaupt gibt.
     */
    const mailer = readFileSync(
      path.join(projectRoot, 'src/infrastructure/mail/mailer.ts'),
      'utf8',
    );

    expect(mailer).toContain("reason: 'not-configured'");
    // Die Adresse kommt aus der Umgebung, nie aus dem Quelltext (NFA-SEC-21).
    expect(mailer).toContain('env.SMTP_URL');
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
