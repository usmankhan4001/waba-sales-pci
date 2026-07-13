import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SendResultsPanel from './SendResultsPanel.vue'

describe('SendResultsPanel', () => {
  it('renders nothing when results is null', () => {
    const wrapper = mount(SendResultsPanel, { props: { results: null } })
    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('labels a success row distinctly from a generic failure', () => {
    const wrapper = mount(SendResultsPanel, {
      props: {
        results: [
          { item: 'contact_now', success: true },
          { item: 'brochure.pdf', success: false, error: 'Media upload error' },
        ],
      },
    })
    expect(wrapper.text()).toContain('Sent successfully')
    expect(wrapper.text()).toContain('Failed')
    expect(wrapper.text()).toContain('Media upload error')
  })

  it('labels a network error distinctly from a per-item failure', () => {
    const wrapper = mount(SendResultsPanel, {
      props: {
        results: [{ item: 'Send', success: false, error: 'Could not reach the server', networkError: true }],
      },
    })
    expect(wrapper.text()).toContain('Network error')
  })

  it('labels a 429 rate-limit response distinctly from a generic failure', () => {
    const wrapper = mount(SendResultsPanel, {
      props: {
        results: [{ item: 'Send', success: false, error: 'Daily send limit reached', status: 429 }],
      },
    })
    expect(wrapper.text()).toContain('Rate limited')
  })
})
