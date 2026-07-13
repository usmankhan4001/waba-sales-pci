import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MessagePreviewBubble from './MessagePreviewBubble.vue'

describe('MessagePreviewBubble', () => {
  it('substitutes the placeholder variables and bolds *starred* segments', () => {
    const wrapper = mount(MessagePreviewBubble, {
      props: {
        type: 'contact_now',
        label: 'Contact Now',
        previewBody: 'Hi *{{1}}*, about *{{2}}* from *{{3}}*.',
        previewButton: 'Talk to Advisor',
        clientName: 'Jane',
        projectText: 'Box Park 3',
        executiveSignature: 'Sam',
      },
    })

    expect(wrapper.text()).toContain('Hi')
    expect(wrapper.text()).toContain('Jane')
    expect(wrapper.text()).toContain('Box Park 3')
    expect(wrapper.text()).toContain('Sam')
    expect(wrapper.find('strong').exists()).toBe(true)
    expect(wrapper.text()).toContain('Talk to Advisor')
  })

  it('falls back to placeholder defaults when values are empty', () => {
    const wrapper = mount(MessagePreviewBubble, {
      props: {
        type: 'contact_now',
        label: 'Contact Now',
        previewBody: 'Hi *{{1}}*, about *{{2}}* from *{{3}}*.',
        clientName: '',
        projectText: '',
        executiveSignature: '',
      },
    })

    expect(wrapper.text()).toContain('there')
    expect(wrapper.text()).toContain('the project')
    expect(wrapper.text()).toContain('Your Sales Advisor')
  })

  it('shows a placeholder message when previewBody is empty (template not approved)', () => {
    const wrapper = mount(MessagePreviewBubble, {
      props: {
        type: 'image',
        label: 'Image',
        previewBody: '',
        clientName: 'Jane',
        projectText: 'X',
        executiveSignature: 'Sam',
      },
    })

    expect(wrapper.text()).toMatch(/not yet approved/i)
  })

  it('does not render a button when previewButton is not provided', () => {
    const wrapper = mount(MessagePreviewBubble, {
      props: {
        type: 'contact_now',
        label: 'Contact Now',
        previewBody: 'Hi there',
        clientName: '',
        projectText: '',
        executiveSignature: '',
      },
    })

    expect(wrapper.text()).not.toContain('Talk to Advisor')
  })
})
