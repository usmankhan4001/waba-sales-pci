<script setup lang="ts">
const b24 = useB24()
const config = useRuntimeConfig()

const loadError = ref('')
const fileLoadError = ref('')

const leadId = ref<number | null>(null)
const leadName = ref('')
const leadPhone = ref('')

const projects = ref<{ id: number; title: string }[]>([])
const selectedProjectId = ref<number | null>(null)

type MessageType = 'contact_now' | 'brochure' | 'video' | 'image' | 'layout'
const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  contact_now: 'Contact Now (Image)',
  brochure: 'Brochure (PDF)',
  video: 'Video',
  image: 'Image',
  layout: 'Layout Plan (PDF)',
}
const selectedMessageTypes = ref<MessageType[]>(['contact_now'])

const ctaNumber = ref('')
const defaultCtaNumber = ref('')
const executiveName = ref('')

const clientName = ref('')
const projectText = ref('')
const executiveSignature = ref('')

type DriveFile = { id: number; name: string; type: Exclude<MessageType, 'contact_now'> | null }
const files = ref<DriveFile[]>([])
const selectedFileIds = ref<number[]>([])

const sending = ref(false)
const results = ref<{ item: string; success: boolean; error?: string }[] | null>(null)

const TYPE_BY_KEYWORD: [RegExp, DriveFile['type']][] = [
  [/\.(mp4|mov)$/i, 'video'],
  [/\.pdf$/i, 'brochure'],
  [/\.(png|jpe?g|gif|webp)$/i, 'image'],
  [/brochure/i, 'brochure'],
  [/layout/i, 'layout'],
  [/video/i, 'video'],
]

function classify(name: string): DriveFile['type'] {
  const hit = TYPE_BY_KEYWORD.find(([re]) => re.test(name))
  return hit ? hit[1] : null
}

onMounted(async () => {
  try {
    const options = b24.placement.options as Record<string, any>
    leadId.value = Number(options?.ID ?? options?.ENTITY_ID)

    if (!leadId.value || Number.isNaN(leadId.value)) {
      loadError.value = 'Could not determine which Lead this tab belongs to.'
      return
    }

    const [leadRes, userRes, rootRes] = await Promise.all([
      b24.callMethod('crm.lead.get', { id: leadId.value }),
      b24.callMethod('user.current', {}),
      b24.callMethod('disk.folder.getchildren', { id: Number(config.public.projectsDriveRootFolderId) }),
    ])

    const lead = leadRes.getData().result || {}
    leadName.value = lead.NAME || ''
    
    // Bitrix24 stores phones in an array. Prioritize finding the MOBILE phone first.
    const phones = lead.PHONE || []
    const bestPhone = phones.find((p: any) => p.VALUE_TYPE === 'MOBILE') || phones.find((p: any) => p.VALUE_TYPE === 'WORK') || phones[0]
    leadPhone.value = bestPhone?.VALUE || ''
    
    clientName.value = leadName.value || 'there'

    const user = userRes.getData().result || {}
    const profileCta = user.UF_USR_WHATSAPP_CTA || ''
    ctaNumber.value = profileCta
    defaultCtaNumber.value = profileCta
    executiveName.value = [user.NAME, user.LAST_NAME].filter(Boolean).join(' ')
    executiveSignature.value = executiveName.value || 'Your Sales Advisor'

    const rootChildren = rootRes.getData().result || []
    projects.value = rootChildren
      .filter((c: any) => c.TYPE === 'folder')
      .map((c: any) => ({ id: Number(c.ID), title: c.NAME }))
  } catch (err: any) {
    loadError.value = err.message || 'Failed to load lead data'
  }
})

watch(selectedProjectId, async (id) => {
  files.value = []
  selectedFileIds.value = []
  fileLoadError.value = ''

  const project = projects.value.find((p) => p.id === id)
  projectText.value = project?.title || ''
  if (!project) return

  try {
    const res = await b24.callMethod('disk.folder.getchildren', { id })
    const children = res.getData().result || []
    files.value = children
      .filter((c: any) => c.TYPE === 'file')
      .map((c: any) => ({ id: Number(c.ID), name: c.NAME, type: classify(c.NAME) }))
      .filter((f: DriveFile) => f.type)
  } catch (err: any) {
    fileLoadError.value = `Could not load files for this project: ${err.message}`
  }
})

const mediaTypesSelected = computed(() => selectedMessageTypes.value.filter((t) => t !== 'contact_now') as DriveFile['type'][])

const filesByType = computed(() => {
  const groups: Record<string, DriveFile[]> = {}
  for (const t of mediaTypesSelected.value) groups[t] = []
  for (const f of files.value) if (f.type && groups[f.type]) groups[f.type].push(f)
  return groups
})

function toggleMessageType(type: MessageType, checked: boolean) {
  selectedMessageTypes.value = checked ? [...selectedMessageTypes.value, type] : selectedMessageTypes.value.filter((t) => t !== type)
}

function toggleFile(id: number, checked: boolean) {
  selectedFileIds.value = checked ? [...selectedFileIds.value, id] : selectedFileIds.value.filter((i) => i !== id)
}

const PREVIEW_BODY: Record<MessageType, string> = {
  contact_now:
    'Hi *{{1}}*,\nThank you for your interest in *{{2}}*.\n\nWe will guide you with project details, availability, pricing, payment plans, and the next steps.\nTap below to connect directly.\n\n*{{3}}*\nSales Executive',
  brochure:
    'Hi *{{1}}*,\nAs requested, I am sharing the brochure for *{{2}}*. It includes the project overview, layouts, amenities, location details, and key highlights.\nTo Book your Site Visit Today, tap below.\n\n*{{3}}*\nSales Executive',
  video:
    'Hi *{{1}}*,\nHere is the construction update for *{{2}}*.\nIt gives you a clearer look at the project update, spaces, lifestyle, and overall experience before your visit.\nTap below to discuss the details and payment plan.\n\n*{{3}}*\nSales Executive',
  image:
    'Hi *{{1}}*,\nThank you for your interest in *{{2}}*.\n\nWe will guide you with project details, availability, pricing, payment plans, and the next steps.\nTap below to connect directly.\n\n*{{3}}*\nSales Executive',
  layout:
    'Hi *{{1}}*,\nAs requested, I am sharing the layout plan for *{{2}}*. It includes the project overview, layouts, amenities, location details, and key highlights.\nTo Book your Site Visit Today, tap below.\n\n*{{3}}*\nSales Executive',
}

const PREVIEW_BUTTON: Record<string, string> = {
  contact_now: 'Talk to Advisor',
  brochure: 'Schedule Your Site Visit',
  video: 'Talk to Advisor',
  image: 'Talk to Advisor',
  layout: 'Schedule Your Site Visit',
}

function renderPreviewBody(type: MessageType) {
  const template = PREVIEW_BODY[type]
  if (!template) return '(Template not yet approved by Meta - preview unavailable)'
  return template
    .replace('{{1}}', clientName.value || 'there')
    .replace('{{2}}', projectText.value || 'the project')
    .replace('{{3}}', executiveSignature.value || 'Your Sales Advisor')
}

function renderPreviewSegments(type: MessageType): { text: string; bold: boolean }[] {
  const raw = renderPreviewBody(type)
  return raw
    .split(/(\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part) => {
      const bold = part.match(/^\*([^*]+)\*$/)
      return bold ? { text: bold[1], bold: true } : { text: part, bold: false }
    })
}

const previewItems = computed(() => {
  const items: { type: MessageType; label: string; file?: DriveFile }[] = []
  if (selectedMessageTypes.value.includes('contact_now')) items.push({ type: 'contact_now', label: 'Contact Now (Cover Image)' })
  for (const f of files.value) {
    if (f.type && mediaTypesSelected.value.includes(f.type) && selectedFileIds.value.includes(f.id)) {
      items.push({ type: f.type, label: f.name, file: f })
    }
  }
  return items
})

const canSend = computed(() => previewItems.value.length > 0 && ctaNumber.value.trim().length > 0 && !sending.value)

async function send() {
  sending.value = true
  results.value = null
  try {
    const auth = b24.auth.getAuthData()
    if (!auth?.domain || !auth?.access_token) {
      throw new Error('Could not read Bitrix24 auth from the frame - try reloading the tab.')
    }

    const selectedFiles = previewItems.value
      .filter((item) => item.file)
      .map((item) => ({ id: item.file!.id, type: item.file!.type, filename: item.file!.name }))

    const resp = await fetch(`${config.public.backendUrl}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: auth.domain,
        accessToken: auth.access_token,
        leadId: leadId.value,
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
      }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || 'Send failed')
    results.value = data.results
    selectedFileIds.value = []
  } catch (err: any) {
    results.value = [{ item: 'Send', success: false, error: err.message }]
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-50 overflow-hidden text-sm">
    <B24Alert v-if="loadError" color="air-primary-alert" :title="loadError" class="m-4" />
    
    <div v-else class="flex flex-1 overflow-hidden">
      <!-- Left Pane: Configuration -->
      <div class="w-1/2 flex flex-col border-r bg-white overflow-y-auto">
        <div class="p-6 border-b flex justify-between items-center bg-gray-50 sticky top-0 z-10 shadow-sm">
          <div>
            <h2 class="text-xl font-semibold text-gray-800">Send WhatsApp Material</h2>
            <p class="text-gray-500 mt-1">Select a project and the materials you want to send.</p>
          </div>
          <B24Button :to="`${config.public.backendUrl}/analytics`" target="_blank" color="primary" variant="light" size="sm">Analytics</B24Button>
        </div>
        
        <div class="p-6 space-y-6 bg-gray-50/50">
          <!-- Step 1: Project & Contact -->
          <B24Card>
            <template #header>
              <div class="flex items-center gap-2 font-medium text-gray-800">
                <span class="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span> Project & Lead Details
              </div>
            </template>
            <div class="space-y-4">
              <B24FormField label="Select Project">
                <B24Select
                  v-model="selectedProjectId"
                  :items="projects.map((p) => ({ label: p.title, value: p.id }))"
                  placeholder="Choose a project from Drive"
                  class="w-full"
                />
              </B24FormField>
              <div class="grid grid-cols-2 gap-4">
                <B24FormField label="Lead WhatsApp">
                  <B24Input :model-value="leadPhone || 'No phone number'" disabled />
                </B24FormField>
                <B24FormField label="Your Contact Number">
                  <B24Input v-model="ctaNumber" placeholder="+9715xxxxxxxx" />
                </B24FormField>
              </div>
            </div>
          </B24Card>

          <!-- Step 2: Content Selection -->
          <B24Card>
            <template #header>
              <div class="flex items-center gap-2 font-medium text-gray-800">
                <span class="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span> Select Content to Send
              </div>
            </template>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <label v-for="(label, type) in MESSAGE_TYPE_LABELS" :key="type" class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition" :class="{'border-blue-500 bg-blue-50': selectedMessageTypes.includes(type as MessageType)}">
                  <B24Checkbox
                    :model-value="selectedMessageTypes.includes(type as MessageType)"
                    @update:model-value="(v) => toggleMessageType(type as MessageType, Boolean(v))"
                    class="mr-3"
                  />
                  <span class="font-medium text-gray-700">{{ label }}</span>
                </label>
              </div>

              <B24Alert v-if="fileLoadError" color="air-primary-alert" :title="fileLoadError" />

              <div v-if="selectedProjectId && mediaTypesSelected.length" class="mt-4 space-y-4 bg-gray-50 p-4 rounded-lg border">
                <h4 class="font-medium text-gray-700 border-b pb-2">Available Files in Project Folder</h4>
                <div v-for="type in mediaTypesSelected" :key="type" class="space-y-2">
                  <div class="font-medium text-gray-600 text-xs uppercase tracking-wider">{{ MESSAGE_TYPE_LABELS[type] }}</div>
                  <div v-if="!filesByType[type]?.length" class="text-gray-400 italic text-sm">No files found.</div>
                  <div v-for="f in filesByType[type]" :key="f.id" class="flex items-center gap-2">
                    <B24Checkbox :model-value="selectedFileIds.includes(f.id)" @update:model-value="(v) => toggleFile(f.id, Boolean(v))" />
                    <span class="text-gray-700">{{ f.name }}</span>
                  </div>
                </div>
              </div>
            </div>
          </B24Card>

          <!-- Step 3: Message Customization -->
          <B24Card>
            <template #header>
              <div class="flex items-center gap-2 font-medium text-gray-800">
                <span class="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span> Customize Message
              </div>
            </template>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <B24FormField label="Client Name">
                <B24Input v-model="clientName" />
              </B24FormField>
              <B24FormField label="Project Reference">
                <B24Input v-model="projectText" />
              </B24FormField>
              <B24FormField label="Executive Signature" class="md:col-span-2">
                <B24Input v-model="executiveSignature" />
              </B24FormField>
            </div>
          </B24Card>
        </div>
      </div>

      <!-- Right Pane: WhatsApp Preview -->
      <div class="w-1/2 flex flex-col bg-[#efeae2] relative overflow-hidden">
        <!-- Chat Header -->
        <div class="bg-[#f0f2f5] px-4 py-3 border-b border-gray-300 flex items-center gap-3 z-10">
          <div class="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-white font-bold text-lg overflow-hidden">
            <svg class="w-full h-full text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
          <div>
            <div class="font-medium text-gray-900">{{ leadName || 'Client' }}</div>
            <div class="text-xs text-gray-500">{{ leadPhone || 'No phone number' }}</div>
          </div>
        </div>

        <!-- Chat Background Pattern (Subtle) -->
        <div class="absolute inset-0 opacity-10 pointer-events-none" style="background-image: url('https://waba-bitrix.premierchoiceint.online/static/whatsapp-bg.png'); background-size: cover; mix-blend-mode: multiply;"></div>

        <!-- Messages Area -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4 z-10 relative">
          <div v-if="!previewItems.length" class="flex justify-center mt-10">
            <div class="bg-[#fff9c4] text-gray-700 px-4 py-2 rounded-lg shadow-sm text-center text-xs max-w-sm">
              Select content on the left to see the WhatsApp preview here.
            </div>
          </div>

          <!-- Message Bubbles -->
          <div v-for="(item, i) in previewItems" :key="i" class="flex justify-start">
            <div class="bg-white rounded-lg shadow-sm max-w-[85%] overflow-hidden relative pb-1">
              <!-- Media Header Preview -->
              <div class="bg-gray-200 h-32 w-full flex items-center justify-center mb-2 relative group">
                <div v-if="item.type === 'video'" class="absolute inset-0 flex items-center justify-center">
                  <div class="w-12 h-12 bg-black bg-opacity-50 rounded-full flex items-center justify-center backdrop-blur-sm">
                    <svg class="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div v-else-if="item.type === 'brochure' || item.type === 'layout'" class="absolute inset-0 flex flex-col items-center justify-center text-red-500">
                   <svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9.5 8.5c0 .8-.7 1.5-1.5 1.5H7v2H5.5V9H8c.8 0 1.5.7 1.5 1.5v1zM13 14c0 .8-.7 1.5-1.5 1.5H9.5V9H11.5c.8 0 1.5.7 1.5 1.5v3.5zm5.5-1.5h-2.5V14h-1.5V9H18.5v1.5h-2.5v1h2.5v1z"/></svg>
                   <span class="text-xs font-bold mt-1 text-gray-600 px-2 truncate w-full text-center">{{ item.label }}</span>
                </div>
                <div v-else class="text-gray-400">
                  <svg class="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                </div>
              </div>
              
              <!-- Message Text -->
              <div class="px-3 pb-2 pt-1 text-[#111b21] whitespace-pre-wrap leading-relaxed text-[14px]">
                <template v-for="(seg, si) in renderPreviewSegments(item.type)" :key="si">
                  <strong v-if="seg.bold" class="font-bold">{{ seg.text }}</strong>
                  <template v-else>{{ seg.text }}</template>
                </template>
              </div>

              <!-- Button -->
              <div v-if="PREVIEW_BUTTON[item.type]" class="border-t border-gray-100 mt-1">
                <div class="py-3 text-center text-[#00a884] font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition cursor-pointer">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                  {{ PREVIEW_BUTTON[item.type] }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Action Bar -->
        <div class="bg-[#f0f2f5] p-4 border-t border-gray-300 z-10 flex flex-col shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div v-if="results" class="mb-3 space-y-2 max-h-32 overflow-y-auto pr-2">
            <B24Alert
              v-for="(r, i) in results"
              :key="i"
              :color="r.success ? 'air-primary-success' : 'air-primary-alert'"
              :title="`${r.item}: ${r.success ? 'Sent ✓' : `Failed ✗ (${r.error})`}`"
              class="py-1"
            />
          </div>
          
          <B24Button 
            class="w-full py-3 text-base shadow-sm bg-[#00a884] hover:bg-[#008f6f] text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canSend" 
            :loading="sending" 
            @click="send"
          >
            <span v-if="sending" class="flex items-center justify-center gap-2">
              <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Sending to WhatsApp...
            </span>
            <span v-else class="flex items-center justify-center gap-2">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              Send to {{ leadName || 'Client' }}
            </span>
          </B24Button>
        </div>
      </div>
    </div>
  </div>
</template>
