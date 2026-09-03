import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Integrationstests gegen die gebaute Anwendung.
 *
 * Getrennt von der schnellen Suite, weil sie einen Produktionsbuild und einen
 * laufenden Server voraussetzen. `npm run verify` bleibt dadurch schnell;
 * `npm run test:integration` ist der Nachweis für NFA-SEC-01.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/setup/server.ts'],
    // Schließt den Browser nach jeder Testdatei — seit M12 startet schon das
    // Festschreiben einen (FA-PDF-13), und ein offener Browser lässt den Lauf
    // hängen statt fehlschlagen.
    setupFiles: ['tests/integration/setup/renderer.ts'],
    // Der Testprozess greift für die Fachlogik auf dieselbe Datenbank zu wie
    // der gestartete Server.
    env: {
      // Der Testprozess arbeitet auf einer eigenen Datenbank, die vor jedem
      // Test aus einer Vorlage neu entsteht.
      DATABASE_URL: 'file:../data/integration-data.db',
      APP_URL: 'http://127.0.0.1:3987',
      APP_TIMEZONE: 'Europe/Berlin',
      APP_NAME: 'Faktura',
      STORAGE_DIR: './data/integration-storage',
      /*
       * **Kein Versand aus einem Testlauf.**
       *
       * Vitest liest die `.env` des Entwicklers mit. Sobald dort echte
       * Zugangsdaten stehen, gingen Einladungen an `ohne-mail@example.org` und
       * `mitglied@example.org` tatsächlich hinaus — an eine reservierte
       * Domäne, also als Rückläufer, die den Absenderruf beschädigen und das
       * Kontingent verbrauchen. Genau das ist passiert.
       *
       * Leer statt gelöscht: Ein `setupFiles`-Eintrag, der die Variablen
       * entfernt, wirkt nur bis zum nächsten Mal, dass Vitest die Umgebung aus
       * der `.env` ergänzt — im Versuch war er nach knapp dreißig Tests wieder
       * überschrieben. Was hier steht, gilt für den ganzen Lauf.
       *
       * Und leer statt eines erfundenen Servers: Ein Wert, der auf niemanden
       * zeigt, liefe je Versuch zehn Sekunden in die Zeitgrenze.
       */
      SMTP_URL: '',
      MAIL_FROM: '',
    },
    // Der Server wird einmal gestartet; parallele Läufe würden sich denselben
    // Port und dieselbe Datenbankdatei streitig machen.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
