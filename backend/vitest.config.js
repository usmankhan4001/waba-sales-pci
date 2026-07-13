const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    // Backend is CommonJS - `require('vitest')` itself doesn't work (vitest is ESM-only),
    // so tests use describe/it/expect as globals instead of importing them.
    globals: true,
  },
});
