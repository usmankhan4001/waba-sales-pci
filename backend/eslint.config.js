const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

// Plain-JS Express app - no TypeScript migration just to unify tooling with the frontend,
// see the professionalization plan's "explicitly not doing" list.
module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021,
        // vitest's `globals: true` (see vitest.config.js) means test files use these
        // without importing them - declare them here so ESLint doesn't flag no-undef.
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  prettier,
  {
    ignores: ['node_modules/**', 'data/**', 'coverage/**'],
  },
];
