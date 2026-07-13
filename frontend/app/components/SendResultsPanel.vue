<script setup lang="ts">
import type { SendResultItem } from '~/types/bitrix'

defineProps<{ results: SendResultItem[] | null }>()

// Previously every failure (network-level, rate-limited, or a genuine per-item rejection)
// rendered as the same generic "Failed" message - distinguish the cases the user can
// actually act on differently (e.g. a 429 means "try again shortly", not "this is broken").
function statusLabel(r: SendResultItem): string {
  if (r.success) return 'Sent successfully ✓'
  if (r.networkError) return `Network error ✗ (${r.error})`
  if (r.status === 429) return `Rate limited — try again shortly ✗ (${r.error})`
  return `Failed ✗ (${r.error})`
}
</script>

<template>
  <div v-if="results" class="mb-3 space-y-1.5 max-h-24 overflow-y-auto">
    <div
      v-for="(r, i) in results"
      :key="i"
      class="text-xs px-3 py-2 rounded-md shadow-sm border"
      :class="r.success ? 'bg-[#d1f4cc] text-[#111b21] border-[#c0e0bc]' : 'bg-red-50 text-red-700 border-red-100'"
    >
      <strong>{{ r.item }}:</strong> {{ statusLabel(r) }}
    </div>
  </div>
</template>
