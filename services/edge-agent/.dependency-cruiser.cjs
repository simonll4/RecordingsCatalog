/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-legacy-imports',
      severity: 'error',
      comment:
        'No se permite importar archivos deprecados de _legacy/. Usar nueva estructura ports & adapters.',
      from: {
        pathNot: '_legacy', // Ignorar imports internos de legacy
      },
      to: {
        path: '_legacy',
      },
    },
    {
      name: 'core-only-imports-ports',
      severity: 'error',
      comment:
        'El core (orchestrator, FSM) solo puede importar ports (interfaces), nunca adapters (implementaciones).',
      from: {
        path: '^src/core',
      },
      to: {
        path: '^src/modules/.+/(client|engine|adapters)',
      },
    },
    {
      name: 'adapters-no-import-core',
      severity: 'error',
      comment:
        'Los adapters no deben depender del core (orchestrator). Son plug-ins independientes.',
      from: {
        path: '^src/modules/.+/(client|engine|adapters)',
      },
      to: {
        path: '^src/core/(orchestrator|fsm)',
      },
    },
    {
      name: 'ports-no-circular-deps',
      severity: 'warn',
      comment:
        'Los ports (interfaces) no deben tener dependencias circulares entre dominios.',
      from: {
        path: '^src/modules/([^/]+)/ports',
      },
      to: {
        pathNot: [
          '^src/modules/$1/ports',  // Mismo dominio OK
          '^src/types',              // Tipos compartidos OK
          '^src/shared',             // Shared OK
          'node_modules',
        ],
      },
    },
    {
      name: 'transforms-filters-pure',
      severity: 'error',
      comment:
        'Transforms y filters son funciones puras, no pueden depender de infraestructura (bus, logger excepto tipos).',
      from: {
        path: '^src/modules/.+/(transforms|filters)',
      },
      to: {
        path: '^src/(core/bus|shared/(logging|metrics|childproc))',
        pathNot: '\\.d\\.ts$', // Permitir solo archivos de tipos
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'No debe haber archivos huérfanos (no importados por nadie).',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$', // dot files
          '\\.d\\.ts$',                             // type definitions
          '(^|/)tsconfig\\.json$',                 // tsconfig
          '(^|/)(test|spec)\\.',                   // tests
          '^src/app/main\\.ts$',                   // entry point
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: '^(node_modules|src/proto|src/media)',
      },
      archi: {
        collapsePattern: '^(node_modules|src/(proto|media|shared|types))',
      },
    },
  },
};
