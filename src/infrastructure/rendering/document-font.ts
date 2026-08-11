/**
 * Die Schrift des Belegs, eingebettet als `data:`-URI.
 *
 * Der Rendering-Browser hat keinen Netzwerkzugriff (NFA-SEC-12) und läuft im
 * Container ohne installierte Schriften. Käme die Schrift nicht mit dem
 * Dokument, setzte Chromium den Beleg in einer Ersatzschrift — mit anderen
 * Laufweiten, anderen Umbrüchen und damit einer anderen Seitenzahl als in der
 * Vorschau.
 *
 * Es ist dieselbe Schrift wie in der Oberfläche (Frontend-Entwurf §2.2). Das
 * ist der Grund, warum die HTML-Vorschau und das PDF gleich aussehen und nicht
 * nur ähnlich: gleiche Datei, gleiche Metrik.
 *
 * Die Dateien liegen im Paket und werden zur Laufzeit gelesen. Die
 * Abhängigkeitsverfolgung von Next.js erfasst nur Importe, keine Dateizugriffe
 * — `next.config.ts` nimmt sie deshalb ausdrücklich ins Bündel auf.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Nur die beiden Schnitte, die der Beleg braucht.
 *
 * Kursiv und weitere Gewichte kämen ungenutzt in jedes PDF; bei einem Dokument,
 * das in ein Archiv wandert und per E-Mail verschickt wird, ist das keine
 * Kleinigkeit.
 */
const FACES: readonly { readonly weight: number; readonly file: string }[] = [
  { weight: 400, file: '@fontsource/fira-sans/files/fira-sans-latin-400-normal.woff2' },
  { weight: 700, file: '@fontsource/fira-sans/files/fira-sans-latin-700-normal.woff2' },
];

let cached: string | undefined;

/**
 * Liefert die `@font-face`-Regeln mit eingebetteter Schrift.
 *
 * Das Ergebnis wird gehalten: Die Base64-Kodierung von rund 50 kB bei jedem
 * Beleg erneut auszuführen wäre reine Verschwendung — die Dateien ändern sich
 * innerhalb eines Prozesses nicht.
 */
export async function documentFontFaces(): Promise<string> {
  if (cached !== undefined) {
    return cached;
  }

  const blocks = await Promise.all(
    FACES.map(async ({ weight, file }) => {
      const bytes = await readFile(require.resolve(file));
      const encoded = bytes.toString('base64');

      return `@font-face {
  font-family: 'Fira Sans';
  font-style: normal;
  font-weight: ${String(weight)};
  src: url(data:font/woff2;base64,${encoded}) format('woff2');
}`;
    }),
  );

  cached = blocks.join('\n');
  return cached;
}
