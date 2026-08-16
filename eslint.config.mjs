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

/**
 * Der Prisma-Client ist ab M5.5a nur noch aus der Repository-Schicht
 * erreichbar (`src/infrastructure/repositories/**`).
 *
 * Der Grund ist die Mandantentrennung: Jede Repository-Funktion nimmt den
 * Organisationskontext als Pflichtparameter, eine ungefilterte Abfrage ist dort
 * ein Typfehler. Bliebe `getPrismaClient()` überall importierbar, ließe sich
 * genau daran vorbeigehen — der Typ schützt vor Vergessen, diese Regel vor
 * Umgehen.
 */
const persistenceRestriction = {
  group: [
    '@/infrastructure/db',
    '@/infrastructure/db/**',
    '**/infrastructure/db/**',
    '@prisma/client',
    '@prisma/client/**',
    '.prisma/**',
  ],
  message:
    'Datenbankzugriff ausschließlich über src/infrastructure/repositories/** — ' +
    'nur dort ist der Organisationskontext Pflicht (NFA-ARCH-01, M5.5a).',
};

const applicationRestrictions = [
  forbidLayers(['app', 'ui', 'i18n'], 'Die Anwendungsschicht kennt keine Oberfläche (NFA-ARCH-01).'),
  persistenceRestriction,
];

const infrastructureRestrictions = [
  forbidLayers(
    ['app', 'ui', 'i18n', 'application'],
    'Die Infrastrukturschicht ist die innerste Ausführungsschicht (NFA-ARCH-01).',
  ),
];

/**
 * Routen und Server Actions dürfen Infrastruktur-Hilfsmittel verwenden
 * (Cookie-Optionen, Sicherheits-Header), aber niemals unmittelbar auf die
 * Persistenz zugreifen — Datenzugriff läuft ausschließlich über die
 * Anwendungsschicht.
 */
const appRestrictions = [
  {
    group: [
      '@/infrastructure/db',
      '@/infrastructure/db/**',
      '**/infrastructure/db/**',
      '@/infrastructure/repositories',
      '@/infrastructure/repositories/**',
      '**/infrastructure/repositories/**',
      '@prisma/client',
      '@prisma/client/**',
    ],
    message:
      'Routen greifen nicht unmittelbar auf die Persistenz zu, sondern über die Anwendungsschicht (NFA-ARCH-01).',
  },
];

/**
 * Die einzige Schicht, die den Prisma-Client sehen darf — und die Datei, die
 * ihn erzeugt.
 *
 * Seit M7 gehört die Sicherung dazu: Sie setzt den Datenbankabzug und den
 * Dateispeicher zu einem Archiv zusammen und muss dafür `infrastructure/db`
 * erreichen. Sie liest keine Fachdaten — sie kopiert die Datei als Ganzes —,
 * weshalb der Organisationskontext hier nichts zu erzwingen hat.
 */
const persistenceFiles = [
  'src/infrastructure/db/**/*.ts',
  'src/infrastructure/repositories/**/*.ts',
  'src/infrastructure/backup/**/*.ts',
];

/** Dateien einer Schicht — jeweils inklusive der zugehörigen Test-Fixture. */
const layerFiles = {
  domain: ['src/domain/**/*.ts', 'tests/architecture/fixtures/domain/**/*.ts'],
  ui: ['src/ui/**/*.{ts,tsx}', 'tests/architecture/fixtures/ui/**/*.ts'],
  i18n: ['src/i18n/**/*.ts'],
  application: [
    'src/application/**/*.ts',
    'tests/architecture/fixtures/persistence/**/*.ts',
  ],
  infrastructure: ['src/infrastructure/**/*.ts'],
  app: ['src/app/**/*.{ts,tsx}', 'src/proxy.ts'],
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
      // Erzeugtes Bündel des Erstbenutzer-Kommandos (npm run build:cli).
      'dist/**',
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
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'scripts/**/*.ts', '*.ts', '*.mts'],
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

  /**
   * Die **eine** Ausnahme vom Roh-SQL-Verbot (NFA-ARCH-10 nennt „ungeprüfte"
   * Aufrufe; dieser ist geprüft).
   *
   * `VACUUM INTO` hat in Prisma keine Entsprechung, und die Alternative wäre,
   * die Datei im laufenden Betrieb zu kopieren — genau das verbietet
   * NFA-BETR-04, weil eine Kopie mitten in einer Transaktion beim Öffnen
   * scheitert. Die Ausnahme gilt für **eine** Datei; der Pfad darin stammt nie
   * aus einer Anfrage. `tests/architecture/layering.test.ts` hält fest, dass
   * es bei dieser einen bleibt.
   */
  {
    files: ['src/infrastructure/db/backup.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // ── Schichtengrenzen ──────────────────────────────────────────────────────
  restrictionConfig(layerFiles.domain, domainRestrictions),
  restrictionConfig(layerFiles.ui, uiRestrictions),
  restrictionConfig(layerFiles.i18n, i18nRestrictions),
  restrictionConfig(layerFiles.application, applicationRestrictions),
  {
    ...restrictionConfig(layerFiles.infrastructure, [
      ...infrastructureRestrictions,
      persistenceRestriction,
    ]),
    ignores: persistenceFiles,
  },
  // Muss **nach** dem vorigen Block stehen: Flat Config lässt für dieselbe
  // Regel den letzten passenden Eintrag gewinnen. Hier fällt die
  // Persistenzsperre weg, die Schichtgrenzen bleiben.
  restrictionConfig(persistenceFiles, infrastructureRestrictions),
  restrictionConfig(layerFiles.app, appRestrictions),
  // Betriebsskripte laufen außerhalb der Schichten, greifen aber auf dieselben
  // Daten zu — auch für sie gilt der Weg über die Repository-Schicht.
  restrictionConfig(['scripts/**/*.ts'], [persistenceRestriction]),

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
