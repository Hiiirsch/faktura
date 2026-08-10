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
    // ausschließlich von den Architektur-Tests eingelesen.
    exclude: ['tests/architecture/fixtures/**', 'node_modules/**'],
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
