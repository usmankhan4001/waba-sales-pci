import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Minimal working harness for now - just enough to mount a plain .vue component with
// @vue/test-utils. Full component/composable tests (useLeadData, useSendFlow, the new
// preview/selector/results components) are deferred to Phase 4, once those actually exist -
// testing the current 492-line lead-detail/index.vue monolith wasn't worth it. When that
// work starts, switch this to @nuxt/test-utils/config's defineVitestConfig for Nuxt
// auto-imports (useRuntimeConfig, composables, etc.) instead of plain @vitejs/plugin-vue.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
  },
})
