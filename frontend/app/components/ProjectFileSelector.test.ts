import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProjectFileSelector from './ProjectFileSelector.vue'

// B24Checkbox/B24Alert are normally Nuxt-auto-imported at runtime - stub them here since
// this harness doesn't run the full Nuxt environment (see vitest.config.ts).
const stubs = {
  B24Checkbox: { template: '<input type="checkbox" @change="$emit(\'update:model-value\', $event.target.checked)" />' },
  B24Alert: { template: '<div class="stub-alert"><slot /><slot name="actions" /></div>' },
  B24Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
}

const messageTypes = [
  { type: 'contact_now', label: 'Contact Now', templateName: 'x', isMedia: false, previewBody: '', previewButton: '' },
  { type: 'brochure', label: 'Brochure (PDF)', templateName: 'y', isMedia: true, previewBody: '', previewButton: '' },
]

describe('ProjectFileSelector', () => {
  it('emits toggle-message-type when a message type checkbox changes', async () => {
    const wrapper = mount(ProjectFileSelector, {
      global: { stubs },
      props: {
        messageTypes,
        selectedMessageTypes: ['contact_now'],
        selectedFileIds: [],
        fileLoadError: '',
        filesByType: {},
        showFiles: false,
      },
    })

    await wrapper.findAll('input[type="checkbox"]')[1].setValue(true)
    expect(wrapper.emitted('toggle-message-type')).toEqual([['brochure', true]])
  })

  it('shows "No files found" for a media type with an empty file list', () => {
    const wrapper = mount(ProjectFileSelector, {
      global: { stubs },
      props: {
        messageTypes,
        selectedMessageTypes: ['contact_now', 'brochure'],
        selectedFileIds: [],
        fileLoadError: '',
        filesByType: { brochure: [] },
        showFiles: true,
      },
    })

    expect(wrapper.text()).toContain('No files found.')
  })

  it('emits toggle-file when a file checkbox changes', async () => {
    const wrapper = mount(ProjectFileSelector, {
      global: { stubs },
      props: {
        messageTypes,
        selectedMessageTypes: ['contact_now', 'brochure'],
        selectedFileIds: [],
        fileLoadError: '',
        filesByType: { brochure: [{ id: 7, name: 'brochure.pdf', type: 'brochure' }] },
        showFiles: true,
      },
    })

    const fileCheckbox = wrapper.findAll('input[type="checkbox"]').at(-1)!
    await fileCheckbox.setValue(true)
    expect(wrapper.emitted('toggle-file')).toEqual([[7, true]])
  })

  it('emits retry-files when the file-load error\'s Try again button is clicked', async () => {
    const wrapper = mount(ProjectFileSelector, {
      global: { stubs },
      props: {
        messageTypes,
        selectedMessageTypes: ['contact_now'],
        selectedFileIds: [],
        fileLoadError: 'Could not load files for this project: network error',
        filesByType: {},
        showFiles: false,
      },
    })

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('retry-files')).toBeTruthy()
  })
})
