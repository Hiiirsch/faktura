import js from '@eslint/js';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

/**
 * Schichtenmodell (Spec §3, CLAUDE.md):
 *
 *   app            ──► application, ui, i18n, domain
 *   ui             ──► domain, i18n
 *   i18n           ──► domain
 *   application    ──► domain, infrastructure
 *   infrastructure ──► domain
 *   domain         ──► domain
 *
 * Durchgesetzt mit `no-restricted-imports` je Schicht. Bewusst ohne
 * eslint-plugin-boundaries: dessen Modul-Resolver kollidiert mit dem von
 * eslint-config-next, und die eingebaute Regel deckt dieselben Richtungen ab,
 * ohne eine zusätzliche Auflösungsschicht.
 *
 * Die Muster greifen sowohl für Alias-Importe (`@/infrastructure/...`) als auch
 * für relative (`../../infrastructure/...`), sodass die Regel nicht durch die
 * Wahl der Importschreibweise zu umgehen ist.
 *
 * tests/architecture/layering.test.ts weist nach, dass die Regeln anschlagen.
 */

/** Erzeugt die Importmuster einer Schicht in allen Schreibweisen. */
function layerPatterns(layer) {
  return [`@/${layer}`, `@/${layer}/**`, `**/${layer}/**`];
}

function forbidLayers(layers, message) {
  return { group: layers.flatMap(layerPatterns), message };
}

const OUTWARD = 'Diese Schicht darf nicht auf äußere Schichten zugreifen (NFA-ARCH-01).';

const domainRestrictions = [
  {
    group: [
      'next',
      'next/**',
      'react',
      'react/**',
      'react-dom',
      'react-dom/**',
      'server-only',
      'client-only',
    ],
    message: 'Die Domain-Schicht darf keine Framework- oder UI-Module importieren (NFA-ARCH-01).',
  },
  {
    group: ['@prisma/client', '@prisma/client/**', '.prisma/**', 'prisma', 'prisma/**'],
    message: 'Die Domain-Schicht darf keine Persistenzmodule importieren (NFA-ARCH-01).',
  },
  {
    group: [
      'node:*',
      'node:**',
      'fs',
      'fs/**',
      'path',
      'os',
      'crypto',
      'http',
      'https',
      'child_process',
      'worker_threads',
    ],
    message:
      'Die Domain-Schicht muss laufzeitunabhängig bleiben und darf keine Node-Builtins importieren (NFA-ARCH-01).',
  },
  forbidLayers(['app', 'ui', 'i18n', 'application', 'infrastructure'], OUTWARD),
];

const uiRestrictions = [
  forbidLayers(['app', 'application', 'infrastructure'], OUTWARD),
  {
    group: ['@prisma/client', '@prisma/client/**', '.prisma/**'],
    message: 'Die Anzeigeschicht greift nicht auf die Persistenz zu (NFA-ARCH-01).',
  },
];

const i18nRestrictions = [forbidLayers(['app', 'ui', 'application', 'infrastructure'], OUTWARD)];

const applicationRestrictions = [
  forbidLayers(['app', 'ui', 'i18n'], 'Die Anwendungsschicht kennt keine Oberfläche (NFA-ARCH-01).'),
];

const infrastructureRestrictions = [
  forbidLayers(
    ['app', 'ui', 'i18n', 'application'],
    'Die Infrastrukturschicht ist die innerste Ausführungsschicht (NFA-ARCH-01).',
  ),
];

const appRestrictions = [
  forbidLayers(
    ['infrastructure'],
    'Routen greifen nicht unmittelbar auf die Persistenz zu, sondern über die Anwendungsschicht (NFA-ARCH-01).',
  ),
];

/** Dateien einer Schicht — jeweils inklusive der zugehörigen Test-Fixture. */
const layerFiles = {
  domain: ['src/domain/**/*.ts', 'tests/architecture/fixtures/domain/**/*.ts'],
  ui: ['src/ui/**/*.{ts,tsx}', 'tests/architecture/fixtures/ui/**/*.ts'],
  i18n: ['src/i18n/**/*.ts'],
  application: ['src/application/**/*.ts'],
  infrastructure: ['src/infrastructure/**/*.ts'],
  app: ['src/app/**/*.{ts,tsx}'],
};

function restrictionConfig(files, patterns) {
  return {
    files,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
    },
  };
}

/**
 * Die Regelwerke von Next.js und React gelten nur für die Schichten, die
 * überhaupt React verwenden. Ohne diese Einschränkung würden React-Regeln auch
 * auf die Domain angewandt — fachlich sinnlos und ein unnötiger Kopplungspunkt
 * an das Framework.
 */
const reactLayers = ['src/app/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'];

const scopedNextConfigs = nextCoreWebVitals.map((config) => {
  const isGlobalIgnores = Object.keys(config).length === 1 && config.ignores !== undefined;
  if (isGlobalIgnores || config.files !== undefined) {
    return config;
  }
  return { ...config, files: reactLayers };
});

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      // Fixtures verletzen absichtlich Regeln. Die Architektur-Tests linten sie
      // gezielt mit `ignore: false`; der reguläre Lauf lässt sie aus.
      'tests/architecture/fixtures/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...scopedNextConfigs,

  // ── Typbewusstes Linting für den gesamten Quellcode ───────────────────────
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', '*.ts', '*.mts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Kein `any` (NFA-QUAL-03).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Kein ungeprüftes Roh-SQL (NFA-ARCH-10).
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name=/^\\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe|queryRawTyped)$/]",
          message: 'Datenbankzugriff ausschließlich über den ORM — kein Roh-SQL (NFA-ARCH-10).',
        },
      ],
    },
  },

  // ── Schichtengrenzen ──────────────────────────────────────────────────────
  restrictionConfig(layerFiles.domain, domainRestrictions),
  restrictionConfig(layerFiles.ui, uiRestrictions),
  restrictionConfig(layerFiles.i18n, i18nRestrictions),
  restrictionConfig(layerFiles.application, applicationRestrictions),
  restrictionConfig(layerFiles.infrastructure, infrastructureRestrictions),
  restrictionConfig(layerFiles.app, appRestrictions),

  // ── Domain-Schicht: härteste Stufe ────────────────────────────────────────
  {
    files: layerFiles.domain,
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },

  // ── Testdateien ───────────────────────────────────────────────────────────
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // ── Konfigurationsdateien ohne Typprüfung ────────────────────────────────
  {
    files: ['*.mjs', '*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
