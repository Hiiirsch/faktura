import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Fixtures enthalten absichtlich regelwidrigen Code und werden
    // ausschließlich von den Architektur-Tests eingelesen. Die
    // Integrationstests brauchen einen Produktionsbuild und laufen über
    // vitest.integration.config.ts (`npm run test:integration`).
    exclude: ['tests/architecture/fixtures/**', 'tests/integration/**', 'node_modules/**'],
    // Die Architektur-Tests führen ESLint programmatisch über den gesamten
    // Quellbaum aus; mit dem Standardwert von fünf Sekunden reicht das nicht.
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Die Schwelle gilt gezielt für die Domain-Schicht (NFA-QUAL-01).
      include: ['src/domain/**/*.ts'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
