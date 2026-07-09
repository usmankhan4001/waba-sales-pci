<script setup lang="ts">
const b24 = useB24()
const config = useRuntimeConfig()

const loading = ref(true)
const error = ref('')
const data = ref<{
  totalSent: number
  totalFailed: number
  leads: { leadId: number; leadName: string; projectName: string; sent: number; failed: number; items: any[] }[]
} | null>(null)

onMounted(async () => {
  try {
    const auth = b24.auth.getAuthData()
    if (!auth?.domain || !auth?.access_token) throw new Error('Could not read Bitrix24 auth from the frame.')

    const resp = await fetch(
      `${config.public.backendUrl}/api/analytics?domain=${encodeURIComponent(auth.domain)}&accessToken=${encodeURIComponent(auth.access_token)}`
    )
    const body = await resp.json()
    if (!resp.ok) throw new Error(body.error || 'Failed to load analytics')
    data.value = body
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="p-4 max-w-3xl mx-auto space-y-4">
    <h1 class="text-lg font-medium">WhatsApp Send Analytics</h1>

    <B24Alert v-if="error" color="air-primary-alert" :title="error" />
    <div v-else-if="loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else-if="data">
      <div class="flex gap-4">
        <B24Card class="flex-1">
          <div class="text-2xl font-semibold">{{ data.totalSent }}</div>
          <div class="text-sm text-gray-500">Sent</div>
        </B24Card>
        <B24Card class="flex-1">
          <div class="text-2xl font-semibold">{{ data.totalFailed }}</div>
          <div class="text-sm text-gray-500">Failed</div>
        </B24Card>
      </div>

      <B24Card v-for="lead in data.leads" :key="lead.leadId">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-medium">{{ lead.leadName || `Lead #${lead.leadId}` }}</span>
            <span class="text-xs text-gray-500">{{ lead.projectName }}</span>
          </div>
        </template>
        <div class="text-sm space-y-1">
          <div v-for="(item, i) in lead.items" :key="i" class="flex justify-between">
            <span>{{ item.item }} <span class="text-gray-400">by {{ item.executiveName }}</span></span>
            <span :class="item.success ? 'text-green-600' : 'text-red-600'">
              {{ item.success ? 'sent ✓' : `failed ✗ (${item.error})` }}
            </span>
          </div>
        </div>
      </B24Card>
      <div v-if="!data.leads.length" class="text-sm text-gray-500">No sends recorded yet.</div>
    </template>
  </div>
</template>
