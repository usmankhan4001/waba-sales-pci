<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  type: string
  label: string
  previewBody: string
  previewButton?: string
  clientName: string
  projectText: string
  executiveSignature: string
}>()

function renderPreviewBody(): string {
  if (!props.previewBody) return '(Template not yet approved by Meta - preview unavailable)'
  return props.previewBody
    .replace('{{1}}', props.clientName || 'there')
    .replace('{{2}}', props.projectText || 'the project')
    .replace('{{3}}', props.executiveSignature || 'Your Sales Advisor')
}

const segments = computed(() => {
  const raw = renderPreviewBody()
  return raw
    .split(/(\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part) => {
      const bold = part.match(/^\*([^*]+)\*$/)
      return bold ? { text: bold[1], bold: true } : { text: part, bold: false }
    })
})
</script>

<template>
  <div class="bg-white rounded-lg rounded-tl-none shadow-sm max-w-[330px] overflow-hidden relative pb-1 border border-gray-100">
    <svg viewBox="0 0 8 13" width="8" height="13" class="absolute top-0 -left-[8px] text-white fill-current">
      <path opacity=".13" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
      <path fill="currentColor" d="M5.188 0H0v11.193l6.467-8.625C7.526 1.156 6.958 0 5.188 0z"></path>
    </svg>

    <div class="bg-[#f0f2f5] h-[160px] w-full flex items-center justify-center mb-1 relative group">
      <div v-if="type === 'video'" class="absolute inset-0 flex items-center justify-center">
        <div class="w-12 h-12 bg-black bg-opacity-40 rounded-full flex items-center justify-center backdrop-blur-sm">
          <svg class="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>
      <div v-else-if="type === 'brochure'" class="absolute inset-0 flex flex-col items-center justify-center text-[#ff5252]">
        <svg class="w-12 h-12 mb-1" fill="currentColor" viewBox="0 0 24 24">
          <path
            d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9.5 8.5c0 .8-.7 1.5-1.5 1.5H7v2H5.5V9H8c.8 0 1.5.7 1.5 1.5v1zM13 14c0 .8-.7 1.5-1.5 1.5H9.5V9H11.5c.8 0 1.5.7 1.5 1.5v3.5zm5.5-1.5h-2.5V14h-1.5V9H18.5v1.5h-2.5v1h2.5v1z"
          />
        </svg>
        <span class="text-[11px] font-bold text-[#54656f] px-4 truncate w-full text-center">{{ label }}</span>
      </div>
      <div v-else class="text-[#aebac1]">
        <svg class="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
        </svg>
      </div>
    </div>

    <div class="px-2.5 pb-2 pt-1 text-[#111b21] whitespace-pre-wrap leading-[1.35] text-[14px]">
      <template v-for="(seg, si) in segments" :key="si">
        <strong v-if="seg.bold" class="font-bold">{{ seg.text }}</strong>
        <template v-else>{{ seg.text }}</template>
      </template>
      <div class="float-right text-[11px] text-[#667781] mt-1 ml-2 select-none">12:00</div>
    </div>

    <div v-if="previewButton" class="border-t border-[#f0f2f5]">
      <div class="py-2.5 text-center text-[#00a884] font-medium flex items-center justify-center gap-2 hover:bg-[#f5f6f6] transition cursor-pointer text-[14px]">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        {{ previewButton }}
      </div>
    </div>
  </div>
</template>
