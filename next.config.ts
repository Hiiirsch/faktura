import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Erzeugt ein eigenständiges Serverbündel für das Container-Image (Spec §12).
  output: 'standalone',

  /**
   * Die Liste kompromittierter Passwörter (NFA-SEC-04) wird zur Laufzeit als
   * Datei gelesen. Die Abhängigkeitsverfolgung von Next.js erfasst nur
   * Importe, keine Dateizugriffe — ohne diesen Eintrag fehlte die Liste im
   * Standalone-Bündel und die Passwortprüfung schlüge im Container fehl.
   */
  outputFileTracingIncludes: {
    '/**': ['./resources/**'],
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
