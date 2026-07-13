// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default withNuxt(
  {
    rules: {
      // Bitrix API responses (CRM entity/contact/user shapes) are genuinely untyped today -
      // this is tracked as Phase 4 cleanup (shared types), not something to force-fix via lint.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: { ...globals.vitest },
    },
  },
  prettier
)
