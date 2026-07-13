import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IndexPage from './index.vue'

// Smoke test proving the Vitest + @vue/test-utils harness actually works end-to-end.
// This page has no composables/auto-imports, so it doesn't need the full Nuxt test
// environment - real component/composable tests come in Phase 4 once useLeadData,
// useSendFlow, and the extracted preview/selector/results components exist.
describe('index.vue', () => {
  it('renders the placeholder message without throwing', () => {
    const wrapper = mount(IndexPage)
    expect(wrapper.text()).toContain('Open a Lead in Bitrix24')
  })
})
