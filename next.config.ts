import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Erzeugt ein eigenständiges Serverbündel für das Container-Image (Spec §12).
  output: 'standalone',

  /**
   * Zwei Dateizugriffe, die zur Laufzeit stattfinden und die die
   * Abhängigkeitsverfolgung von Next.js nicht sieht — sie erfasst Importe,
   * keine `readFile`-Aufrufe:
   *
   * - die Liste kompromittierter Passwörter (NFA-SEC-04); ohne sie schlüge die
   *   Passwortprüfung im Container fehl,
   * - die Schriftdateien des Belegs, die als `data:`-URI in jedes PDF
   *   eingebettet werden. Ohne sie setzte Chromium den Beleg in einer
   *   Ersatzschrift, mit anderen Umbrüchen als in der Vorschau.
   */
  outputFileTracingIncludes: {
    '/**': [
      './resources/**',
      './node_modules/@fontsource/fira-sans/files/*.woff2',
      // Playwright liest `browsers.json` zur Laufzeit, um die erwartete
      // Browserversion zu bestimmen. Die Datei wird nirgends importiert und
      // fehlte deshalb im Standalone-Bündel — der Renderer scheiterte im
      // Container bereits beim Laden des Moduls.
      './node_modules/playwright-core/browsers.json',
    ],
  },

  // Die Anwendung liefert keine Fremdinhalte aus und lädt keine externen
  // Ressourcen (NFA-COMP-05, NFA-COMP-06).
  poweredByHeader: false,

  // TypeScript-Fehler dürfen den Build nicht passieren (NFA-QUAL-03).
  // Der Lint-Lauf ist eigenständig (`npm run lint`) und Teil von `npm run verify`
  // sowie des CI-Schritts, damit auch Testdateien und Konfiguration erfasst
  // werden — der Build sieht nur den gebündelten Anwendungscode.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
