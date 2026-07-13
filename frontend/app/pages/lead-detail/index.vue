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
  [/layout/i, 'layout'],
  [/brochure/i, 'brochure'],
  [/video/i, 'video'],
  [/\.(mp4|mov)$/i, 'video'],
  [/\.pdf$/i, 'brochure'],
  [/\.(png|jpe?g|gif|webp)$/i, 'image'],
]

function classify(name: string): DriveFile['type'] {
  const hit = TYPE_BY_KEYWORD.find(([re]) => re.test(name))
  return hit ? hit[1] : null
}

function normalizePhones(rawPhones: any): any[] {
  if (Array.isArray(rawPhones)) return rawPhones
  if (!rawPhones || typeof rawPhones !== 'object') return []
  return Object.values(rawPhones).filter(Boolean)
}

function pickBestPhone(phones: any[]) {
  return phones.find((p: any) => p.VALUE_TYPE === 'MOBILE') || phones.find((p: any) => p.VALUE_TYPE === 'WORK') || phones[0] || null
}

async function resolveEntityPhones(entityData: Record<string, any>) {
  let phones = normalizePhones(entityData.PHONE)

  if (phones.length === 0 && entityData.FM?.PHONE) {
    phones = normalizePhones(entityData.FM.PHONE)
  }

  const candidateContactIds = [
    entityData.CONTACT_ID,
    ...(Array.isArray(entityData.CONTACT_IDS) ? entityData.CONTACT_IDS : []),
    ...(Array.isArray(entityData.CONTACT_BINDINGS) ? entityData.CONTACT_BINDINGS.map((binding: any) => binding.CONTACT_ID) : []),
  ].filter(Boolean)

  for (const contactId of candidateContactIds) {
    if (phones.length > 0) break
    try {
      const contactRes = await b24.actions.v2.call.make({ method: 'crm.contact.get', params: { id: contactId } })
      const contactData = contactRes.getData().result || {}
      phones = normalizePhones(contactData.PHONE)
      if (phones.length === 0 && contactData.FM?.PHONE) {
        phones = normalizePhones(contactData.FM.PHONE)
      }

      if (!leadName.value || leadName.value === entityData.TITLE) {
        const contactName = [contactData.NAME, contactData.LAST_NAME].filter(Boolean).join(' ')
        if (contactName) leadName.value = contactName
      }
    } catch (e: any) {
      console.warn(`Failed to fetch linked contact ${contactId}:`, e)
    }
  }

  return phones
}

const entityTypeIdRef = ref<number>(1)

onMounted(async () => {
  try {
    const options = b24.placement.options as Record<string, any>
    leadId.value = Number(options?.ID ?? options?.ENTITY_ID)

    if (!leadId.value || Number.isNaN(leadId.value)) {
      loadError.value = 'Could not determine which CRM record this tab belongs to.'
      return
    }

    let placementStr = ''
    try {
      placementStr = String((b24.placement.info as any)?.placement || options?.PLACEMENT || '').toUpperCase()
    } catch (e) {
      placementStr = String(options?.PLACEMENT || '').toUpperCase()
    }

    let entityTypeId = 1
    let endpoint = 'crm.lead.get'

    if (placementStr.includes('DEAL')) {
      entityTypeId = 2
      endpoint = 'crm.deal.get'
    } else if (placementStr.includes('CONTACT')) {
      entityTypeId = 3
      endpoint = 'crm.contact.get'
    }
    
    entityTypeIdRef.value = entityTypeId

    const [entityRes, userRes, rootRes] = await Promise.all([
      b24.actions.v2.call.make({ method: endpoint, params: { id: leadId.value } }),
      b24.actions.v2.call.make({ method: 'user.current', params: {} }),
      b24.actions.v2.call.make({ method: 'disk.folder.getchildren', params: { id: Number(config.public.projectsDriveRootFolderId) } }),
    ])

    const entityData = entityRes.getData().result || {}
    leadName.value = [entityData.NAME, entityData.LAST_NAME].filter(Boolean).join(' ') || entityData.TITLE || ''
    
    const phones = await resolveEntityPhones(entityData)
    const bestPhone = pickBestPhone(phones)
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
    const res = await b24.actions.v2.call.make({ method: 'disk.folder.getchildren', params: { id } })
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
        entityTypeId: entityTypeIdRef.value,
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
  <div class="h-screen flex flex-col bg-white overflow-hidden text-sm font-sans">
    <B24Alert v-if="loadError" color="air-primary-alert" :title="loadError" class="m-4" />
    
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
            <div class="pl-7 space-y-3">
              <div class="flex flex-wrap gap-2">
                <label v-for="(label, type) in MESSAGE_TYPE_LABELS" :key="type" class="flex items-center px-3 py-1.5 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition text-xs select-none" :class="{'border-blue-400 bg-blue-50/30 text-blue-700': selectedMessageTypes.includes(type as MessageType)}">
                  <B24Checkbox 
                    :model-value="selectedMessageTypes.includes(type as MessageType)" 
                    @update:model-value="(checked: boolean) => toggleMessageType(type as MessageType, checked)"
                    class="mr-2"
                  />
                  <span class="font-medium">{{ label }}</span>
                </label>
              </div>

              <B24Alert v-if="fileLoadError" color="air-primary-alert" :title="fileLoadError" class="py-1 mt-2" />

              <div v-if="selectedProjectId && mediaTypesSelected.length" class="mt-3 bg-gray-50 border border-gray-100 rounded-md p-3">
                <div v-for="type in mediaTypesSelected" :key="type" class="mb-3 last:mb-0">
                  <div class="font-semibold text-gray-500 text-[10px] uppercase tracking-wider mb-1">{{ MESSAGE_TYPE_LABELS[type] }}</div>
                  <div v-if="!filesByType[type]?.length" class="text-gray-400 italic text-xs">No files found.</div>
                  <div v-for="f in filesByType[type]" :key="f.id" class="flex items-center gap-2 text-xs py-0.5">
                    <B24Checkbox :model-value="selectedFileIds.includes(f.id)" @update:model-value="(checked: boolean) => toggleFile(f.id, checked)" class="cursor-pointer" />
                    <span class="text-gray-700 truncate" :title="f.name">{{ f.name }}</span>
                  </div>
                </div>
              </div>
            </div>
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
            <svg class="w-6 h-6 text-gray-100 mt-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
          <div>
            <div class="font-medium text-[#111b21] text-[15px] leading-tight">{{ leadName || 'Client' }}</div>
            <div class="text-[13px] text-[#667781] leading-tight">{{ leadPhone || 'No phone number' }}</div>
          </div>
        </div>

        <!-- Chat Background Pattern -->
        <div class="absolute inset-0 opacity-[0.06] pointer-events-none z-0 bg-[radial-gradient(circle_at_1px_1px,_rgba(84,101,111,0.35)_1px,_transparent_0)] bg-[length:24px_24px]"></div>

        <!-- Messages Area -->
        <div class="flex-1 overflow-y-auto p-4 md:p-8 space-y-3 z-10 relative flex flex-col">
          <div v-if="!previewItems.length" class="flex justify-center mt-4">
            <div class="bg-[#ffeecd] text-[#54656f] px-3 py-1.5 rounded-md shadow-sm text-center text-xs max-w-sm">
              Select content on the left to see the preview.
            </div>
          </div>

          <!-- Message Bubbles -->
          <div v-for="(item, i) in previewItems" :key="i" class="flex justify-start">
            <div class="bg-white rounded-lg rounded-tl-none shadow-sm max-w-[330px] overflow-hidden relative pb-1 border border-gray-100">
              <!-- Tail SVG -->
              <svg viewBox="0 0 8 13" width="8" height="13" class="absolute top-0 -left-[8px] text-white fill-current">
                <path opacity=".13" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
                <path fill="currentColor" d="M5.188 0H0v11.193l6.467-8.625C7.526 1.156 6.958 0 5.188 0z"></path>
              </svg>

              <!-- Media Header Preview -->
              <div class="bg-[#f0f2f5] h-[160px] w-full flex items-center justify-center mb-1 relative group">
                <div v-if="item.type === 'video'" class="absolute inset-0 flex items-center justify-center">
                  <div class="w-12 h-12 bg-black bg-opacity-40 rounded-full flex items-center justify-center backdrop-blur-sm">
                    <svg class="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div v-else-if="item.type === 'brochure' || item.type === 'layout'" class="absolute inset-0 flex flex-col items-center justify-center text-[#ff5252]">
                   <svg class="w-12 h-12 mb-1" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9.5 8.5c0 .8-.7 1.5-1.5 1.5H7v2H5.5V9H8c.8 0 1.5.7 1.5 1.5v1zM13 14c0 .8-.7 1.5-1.5 1.5H9.5V9H11.5c.8 0 1.5.7 1.5 1.5v3.5zm5.5-1.5h-2.5V14h-1.5V9H18.5v1.5h-2.5v1h2.5v1z"/></svg>
                   <span class="text-[11px] font-bold text-[#54656f] px-4 truncate w-full text-center">{{ item.label }}</span>
                </div>
                <div v-else class="text-[#aebac1]">
                  <svg class="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                </div>
              </div>
              
              <!-- Message Text -->
              <div class="px-2.5 pb-2 pt-1 text-[#111b21] whitespace-pre-wrap leading-[1.35] text-[14px]">
                <template v-for="(seg, si) in renderPreviewSegments(item.type)" :key="si">
                  <strong v-if="seg.bold" class="font-bold">{{ seg.text }}</strong>
                  <template v-else>{{ seg.text }}</template>
                </template>
                <div class="float-right text-[11px] text-[#667781] mt-1 ml-2 select-none">12:00</div>
              </div>

              <!-- Button -->
              <div v-if="PREVIEW_BUTTON[item.type]" class="border-t border-[#f0f2f5]">
                <div class="py-2.5 text-center text-[#00a884] font-medium flex items-center justify-center gap-2 hover:bg-[#f5f6f6] transition cursor-pointer text-[14px]">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                  {{ PREVIEW_BUTTON[item.type] }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- WhatsApp-style Bottom Action Bar -->
        <div class="bg-[#f0f2f5] px-4 py-3 z-10 shrink-0">
          <div v-if="results" class="mb-3 space-y-1.5 max-h-24 overflow-y-auto">
            <div v-for="(r, i) in results" :key="i" class="text-xs px-3 py-2 rounded-md shadow-sm border" :class="r.success ? 'bg-[#d1f4cc] text-[#111b21] border-[#c0e0bc]' : 'bg-red-50 text-red-700 border-red-100'">
              <strong>{{ r.item }}:</strong> {{ r.success ? 'Sent successfully ✓' : `Failed ✗ (${r.error})` }}
            </div>
          </div>
          
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
              <svg v-else class="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
