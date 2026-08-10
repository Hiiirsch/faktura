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
    // Der Server wird einmal gestartet; parallele Läufe würden sich denselben
    // Port und dieselbe Datenbankdatei streitig machen.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
