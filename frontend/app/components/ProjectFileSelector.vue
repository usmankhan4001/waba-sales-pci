<script setup lang="ts">
import type { MessageTypeMeta, DriveFile } from '~/types/bitrix'

defineProps<{
  messageTypes: MessageTypeMeta[]
  selectedMessageTypes: string[]
  selectedFileIds: number[]
  fileLoadError: string
  filesByType: Record<string, DriveFile[]>
  showFiles: boolean
}>()

const emit = defineEmits<{
  'toggle-message-type': [type: string, checked: boolean]
  'toggle-file': [id: number, checked: boolean]
  'retry-files': []
}>()
</script>

<template>
  <div class="pl-7 space-y-3">
    <div class="flex flex-wrap gap-2">
      <label
        v-for="mt in messageTypes"
        :key="mt.type"
        class="flex items-center px-3 py-1.5 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition text-xs select-none"
        :class="{ 'border-blue-400 bg-blue-50/30 text-blue-700': selectedMessageTypes.includes(mt.type) }"
      >
        <B24Checkbox
          :model-value="selectedMessageTypes.includes(mt.type)"
          class="mr-2"
          @update:model-value="(checked: boolean) => emit('toggle-message-type', mt.type, checked)"
        />
        <span class="font-medium">{{ mt.label }}</span>
      </label>
    </div>

    <B24Alert v-if="fileLoadError" color="air-primary-alert" :title="fileLoadError" class="py-1 mt-2">
      <template #actions>
        <B24Button size="sm" @click="emit('retry-files')">Try again</B24Button>
      </template>
    </B24Alert>

    <div v-if="showFiles" class="mt-3 bg-gray-50 border border-gray-100 rounded-md p-3">
      <div v-for="mt in messageTypes.filter((m) => m.isMedia && selectedMessageTypes.includes(m.type))" :key="mt.type" class="mb-3 last:mb-0">
        <div class="font-semibold text-gray-500 text-[10px] uppercase tracking-wider mb-1">{{ mt.label }}</div>
        <div v-if="!filesByType[mt.type]?.length" class="text-gray-400 italic text-xs">No files found.</div>
        <div v-for="f in filesByType[mt.type]" :key="f.id" class="flex items-center gap-2 text-xs py-0.5">
          <B24Checkbox
            :model-value="selectedFileIds.includes(f.id)"
            class="cursor-pointer"
            @update:model-value="(checked: boolean) => emit('toggle-file', f.id, checked)"
          />
          <span class="text-gray-700 truncate" :title="f.name">{{ f.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
