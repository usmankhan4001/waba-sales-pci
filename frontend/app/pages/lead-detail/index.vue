<script setup lang="ts">
import type { DriveFile } from '~/types/bitrix'

const b24 = useB24()
const config = useRuntimeConfig()

const {
  loading,
  loadError,
  fileLoadError,
  leadId,
  entityTypeId,
  leadName,
  leadPhone,
  projects,
  selectedProjectId,
  files,
  ctaNumber,
  defaultCtaNumber,
  executiveName,
  clientName,
  projectText,
  executiveSignature,
  retry,
  retryFiles,
} = useLeadData()

const { messageTypes, load: loadMessageTypes } = useMessageTypes()
onMounted(loadMessageTypes)

const selectedMessageTypes = ref<string[]>(['contact_now'])
const selectedFileIds = ref<number[]>([])

const mediaTypesSelected = computed(() => selectedMessageTypes.value.filter((t) => t !== 'contact_now'))

const filesByType = computed(() => {
  const groups: Record<string, DriveFile[]> = {}
  for (const t of mediaTypesSelected.value) groups[t] = []
  for (const f of files.value) if (f.type && groups[f.type]) groups[f.type].push(f)
  return groups
})

function toggleMessageType(type: string, checked: boolean) {
  selectedMessageTypes.value = checked ? [...selectedMessageTypes.value, type] : selectedMessageTypes.value.filter((t) => t !== type)
}

function toggleFile(id: number, checked: boolean) {
  selectedFileIds.value = checked ? [...selectedFileIds.value, id] : selectedFileIds.value.filter((i) => i !== id)
}

const previewItems = computed(() => {
  const items: { type: string; label: string; file?: DriveFile }[] = []
  if (selectedMessageTypes.value.includes('contact_now')) items.push({ type: 'contact_now', label: 'Contact Now (Cover Image)' })
  for (const f of files.value) {
    if (f.type && mediaTypesSelected.value.includes(f.type) && selectedFileIds.value.includes(f.id)) {
      items.push({ type: f.type, label: f.name, file: f })
    }
  }
  return items
})

const { sending, results, send: sendRequest } = useSendFlow()

const canSend = computed(() => previewItems.value.length > 0 && ctaNumber.value.trim().length > 0 && !sending.value)

async function send() {
  const auth = b24.auth.getAuthData()
  if (!auth?.domain || !auth?.access_token) {
    results.value = [{ item: 'Send', success: false, error: 'Could not read Bitrix24 auth from the frame - try reloading the tab.' }]
    return
  }

  const selectedFiles = previewItems.value
    .filter((item) => item.file)
    .map((item) => ({ id: item.file!.id, type: item.file!.type, filename: item.file!.name }))

  const sendResults = await sendRequest({
    domain: auth.domain,
    accessToken: auth.access_token,
    leadId: leadId.value,
    entityTypeId: entityTypeId.value,
    projectName: projectText.value,
    projectDriveFolderId: selectedProjectId.value,
    ctaNumber: ctaNumber.value,
    defaultCtaNumber: defaultCtaNumber.value,
    executiveName: executiveName.value,
    clientName: clientName.value,
    projectText: projectText.value,
    executiveSignature: executiveSignature.value,
    includeContactNow: selectedMessageTypes.value.includes('contact_now'),
    files: selectedFiles,
  })

  if (sendResults) selectedFileIds.value = []
}
</script>

<template>
  <div class="h-screen flex flex-col bg-white overflow-hidden text-sm font-sans">
    <B24Alert v-if="loadError" color="air-primary-alert" :title="loadError" class="m-4">
      <template #actions>
        <B24Button size="sm" @click="retry">Try again</B24Button>
      </template>
    </B24Alert>

    <div v-else-if="loading" class="p-8 text-sm text-gray-500">Loading lead details...</div>

    <div v-else class="flex flex-1 overflow-hidden">
      <!-- Left Pane: Configuration -->
      <div class="w-1/2 flex flex-col border-r bg-white overflow-y-auto">
        <div class="px-6 py-4 flex justify-between items-center bg-white sticky top-0 z-10 border-b">
          <div>
            <h2 class="text-lg font-medium text-gray-900">Send WhatsApp Material</h2>
          </div>
          <B24Button :to="`${config.public.backendUrl}/analytics`" target="_blank" color="link" size="sm" class="text-gray-500">Analytics</B24Button>
        </div>

        <div class="px-6 py-4 space-y-6">
          <!-- Step 1: Project & Contact -->
          <section>
            <h3 class="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-2">
              <span class="bg-gray-100 text-gray-600 w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span>
              Project & Contact
            </h3>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 pl-7">
              <div class="col-span-2">
                <label class="block text-xs font-medium text-gray-500 mb-1">Select Project</label>
                <B24Select
                  v-model="selectedProjectId"
                  :items="projects.map((p) => ({ label: p.title, value: p.id }))"
                  placeholder="Choose a project from Drive"
                  class="w-full"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Lead WhatsApp</label>
                <B24Input :model-value="leadPhone || 'No phone number'" disabled class="w-full bg-gray-50" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Your Contact Number</label>
                <B24Input v-model="ctaNumber" placeholder="+9715xxxxxxxx" class="w-full" />
              </div>
            </div>
          </section>

          <hr class="border-gray-100" />

          <!-- Step 2: Content Selection -->
          <section>
            <h3 class="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-2">
              <span class="bg-gray-100 text-gray-600 w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span>
              Select Content
            </h3>
            <ProjectFileSelector
              :message-types="messageTypes"
              :selected-message-types="selectedMessageTypes"
              :selected-file-ids="selectedFileIds"
              :file-load-error="fileLoadError"
              :files-by-type="filesByType"
              :show-files="Boolean(selectedProjectId && mediaTypesSelected.length)"
              @toggle-message-type="toggleMessageType"
              @toggle-file="toggleFile"
              @retry-files="retryFiles"
            />
          </section>

          <hr class="border-gray-100" />

          <!-- Step 3: Message Customization -->
          <section>
            <h3 class="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-2">
              <span class="bg-gray-100 text-gray-600 w-5 h-5 rounded-full flex items-center justify-center text-xs">3</span>
              Customize Message
            </h3>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 pl-7">
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Client Name</label>
                <B24Input v-model="clientName" class="w-full" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Project Reference</label>
                <B24Input v-model="projectText" class="w-full" />
              </div>
              <div class="col-span-2">
                <label class="block text-xs font-medium text-gray-500 mb-1">Executive Signature</label>
                <B24Input v-model="executiveSignature" class="w-full" />
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- Right Pane: WhatsApp Preview -->
      <div class="w-1/2 flex flex-col bg-[#efeae2] relative overflow-hidden">
        <!-- Chat Header -->
        <div class="bg-[#f0f2f5] px-4 py-2.5 border-b border-gray-200 flex items-center gap-3 z-10 shrink-0">
          <div class="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-white overflow-hidden">
            <svg class="w-6 h-6 text-gray-100 mt-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <div>
            <div class="font-medium text-[#111b21] text-[15px] leading-tight">{{ leadName || 'Client' }}</div>
            <div class="text-[13px] text-[#667781] leading-tight">{{ leadPhone || 'No phone number' }}</div>
          </div>
        </div>

        <!-- Chat Background Pattern -->
        <div
          class="absolute inset-0 opacity-[0.06] pointer-events-none z-0 bg-[radial-gradient(circle_at_1px_1px,_rgba(84,101,111,0.35)_1px,_transparent_0)] bg-[length:24px_24px]"
        ></div>

        <!-- Messages Area -->
        <div class="flex-1 overflow-y-auto p-4 md:p-8 space-y-3 z-10 relative flex flex-col">
          <div v-if="!previewItems.length" class="flex justify-center mt-4">
            <div class="bg-[#ffeecd] text-[#54656f] px-3 py-1.5 rounded-md shadow-sm text-center text-xs max-w-sm">
              Select content on the left to see the preview.
            </div>
          </div>

          <div v-for="(item, i) in previewItems" :key="i" class="flex justify-start">
            <MessagePreviewBubble
              v-bind="messageTypes.find((mt) => mt.type === item.type)"
              :type="item.type"
              :label="item.label"
              :client-name="clientName"
              :project-text="projectText"
              :executive-signature="executiveSignature"
            />
          </div>
        </div>

        <!-- WhatsApp-style Bottom Action Bar -->
        <div class="bg-[#f0f2f5] px-4 py-3 z-10 shrink-0">
          <SendResultsPanel :results="results" />

          <div class="flex items-center gap-3">
            <div class="bg-white flex-1 rounded-lg px-4 py-2.5 text-[#54656f] flex items-center shadow-sm">
              <span class="truncate">{{ previewItems.length }} item(s) ready to send to {{ leadName || 'Client' }}</span>
            </div>

            <button
              class="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition shadow-sm outline-none"
              :class="canSend ? 'bg-[#00a884] hover:bg-[#008f6f] text-white cursor-pointer' : 'bg-gray-300 text-gray-100 cursor-not-allowed'"
              :disabled="!canSend || sending"
              @click="send"
            >
              <svg v-if="sending" class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg v-else class="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
