<script setup lang="ts">
const b24 = useB24()
const config = useRuntimeConfig()

const loadError = ref('')

const leadId = ref<number | null>(null)
const leadName = ref('')
const leadPhone = ref('') // recipient's own WhatsApp number, auto-fetched (read-only, sourced from the CRM Lead)

// Projects come directly from the Drive subfolders under NUXT_PUBLIC_PROJECTS_DRIVE_ROOT_FOLDER_ID
// ("WABA Project Files") - each subfolder IS a project, named however the folder is named.
const projects = ref<{ id: number; title: string }[]>([])
const selectedProjectId = ref<number | null>(null) // same as the project's Drive folder ID

type MessageType = 'contact_now' | 'brochure' | 'video' | 'image' | 'layout'
const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  contact_now: 'Contact Now',
  brochure: 'Brochure',
  video: 'Video',
  image: 'Image',
  layout: 'Layout Plan',
}
const selectedMessageTypes = ref<MessageType[]>(['contact_now'])

const ctaNumber = ref('')
const defaultCtaNumber = ref('') // guardrail 8.2: used to flag deviation from the executive's profile default
const executiveName = ref('') // default 3rd body variable (signature line)

// Per-send overrides of the 3 approved-template body variables.
const clientName = ref('')
const projectText = ref('')
const executiveSignature = ref('')

type DriveFile = { id: number; name: string; type: Exclude<MessageType, 'contact_now'> | null }
const files = ref<DriveFile[]>([])
const selectedFileIds = ref<number[]>([])

const sending = ref(false)
const results = ref<{ item: string; success: boolean; error?: string }[] | null>(null)

const TYPE_BY_KEYWORD: [RegExp, DriveFile['type']][] = [
  [/brochure/i, 'brochure'],
  [/layout/i, 'layout'],
  [/\.pdf$/i, 'brochure'],
  [/video|\.mp4$|\.mov$/i, 'video'],
  [/\.(png|jpe?g|gif|webp)$/i, 'image'],
]

function classify(name: string): DriveFile['type'] {
  const hit = TYPE_BY_KEYWORD.find(([re]) => re.test(name))
  return hit ? hit[1] : null
}

onMounted(async () => {
  try {
    // CRM_LEAD_DETAIL_TAB placement supplies the lead id via placement options.
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
    leadPhone.value = lead.PHONE?.[0]?.VALUE || ''
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

  const project = projects.value.find((p) => p.id === id)
  projectText.value = project?.title || ''
  if (!project) return

  const res = await b24.callMethod('disk.folder.getchildren', { id })
  const children = res.getData().result || []
  files.value = children
    .filter((c: any) => c.TYPE === 'file')
    .map((c: any) => ({ id: Number(c.ID), name: c.NAME, type: classify(c.NAME) }))
    .filter((f: DriveFile) => f.type)
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

// Preview text mirrors the real approved OnCloud template bodies (WhatsApp *bold* markers kept as-is).
const PREVIEW_BODY: Record<MessageType, string> = {
  contact_now:
    'Hi *{{1}}*,\nThank you for your interest in *{{2}}*.\n\nWe will guide you with project details, availability, pricing, payment plans, and the next steps.\nTap below to connect directly.\n\n*{{3}}*\nSales Executive',
  brochure:
    'Hi *{{1}}*,\nAs requested, I am sharing the brochure for *{{2}}*. It includes the project overview, layouts, amenities, location details, and key highlights.\nTo Book your Site Visit Today, tap below.\n\n*{{3}}*\nSales Executive',
  video:
    'Hi *{{1}}*,\nHere is the construction update for *{{2}}*.\nIt gives you a clearer look at the project update, spaces, lifestyle, and overall experience before your visit.\nTap below to discuss the details and payment plan.\n\n*{{3}}*\nSales Executive',
  image: '',
  layout: '',
}
const PREVIEW_BUTTON: Record<string, string> = {
  contact_now: 'Talk to Advisor',
  brochure: 'Schedule Your Site Visit',
  video: 'Talk to Advisor',
}

function renderPreviewBody(type: MessageType) {
  const template = PREVIEW_BODY[type]
  if (!template) return '(Template not yet approved by Meta - preview unavailable)'
  return template
    .replace('{{1}}', clientName.value || 'there')
    .replace('{{2}}', projectText.value || 'the project')
    .replace('{{3}}', executiveSignature.value || 'Your Sales Advisor')
}

const previewItems = computed(() => {
  const items: { type: MessageType; label: string; file?: DriveFile }[] = []
  if (selectedMessageTypes.value.includes('contact_now')) items.push({ type: 'contact_now', label: 'Contact Now (cover image)' })
  for (const f of files.value) {
    if (f.type && selectedFileIds.value.includes(f.id)) items.push({ type: f.type, label: f.name, file: f })
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

    const selectedFiles = files.value
      .filter((f) => selectedFileIds.value.includes(f.id))
      .map((f) => ({ id: f.id, type: f.type, filename: f.name }))

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
  <div class="p-4 max-w-xl mx-auto space-y-4">
    <B24Alert v-if="loadError" color="air-primary-alert" :title="loadError" />

    <B24Card v-else>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium">Send WhatsApp Material</h3>
          <a :href="`${config.public.backendUrl}/analytics`" target="_blank" class="text-xs text-gray-400 hover:underline">Analytics</a>
        </div>
      </template>

      <div class="space-y-5">
        <div>
          <label class="block text-sm font-medium mb-1">Project</label>
          <B24Select
            v-model="selectedProjectId"
            :items="projects.map((p) => ({ label: p.title, value: p.id }))"
            placeholder="Select a project"
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Lead's WhatsApp number</label>
          <input :value="leadPhone || 'No phone number on this Lead'" type="text" disabled class="w-full border rounded px-3 py-2 bg-gray-50 text-gray-600" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Sales executive's Contact Now number</label>
          <input v-model="ctaNumber" type="text" class="w-full border rounded px-3 py-2" placeholder="+9715xxxxxxxx" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Messages to send</label>
          <div class="space-y-2">
            <div v-for="(label, type) in MESSAGE_TYPE_LABELS" :key="type" class="flex items-center gap-2">
              <B24Checkbox
                :model-value="selectedMessageTypes.includes(type as MessageType)"
                @update:model-value="(v) => toggleMessageType(type as MessageType, Boolean(v))"
              />
              <span>{{ label }}</span>
            </div>
          </div>
        </div>

        <div v-if="selectedProjectId && mediaTypesSelected.length" class="space-y-3">
          <div v-for="type in mediaTypesSelected" :key="type">
            <div class="text-sm font-medium mb-1">{{ MESSAGE_TYPE_LABELS[type] }}</div>
            <div v-if="!filesByType[type]?.length" class="text-sm text-gray-500">No {{ MESSAGE_TYPE_LABELS[type].toLowerCase() }} files found in this project's Drive folder.</div>
            <div v-for="f in filesByType[type]" :key="f.id" class="flex items-center gap-2">
              <B24Checkbox :model-value="selectedFileIds.includes(f.id)" @update:model-value="(v) => toggleFile(f.id, Boolean(v))" />
              <span>{{ f.name }}</span>
            </div>
          </div>
        </div>

        <details class="text-sm">
          <summary class="cursor-pointer font-medium">Edit message text</summary>
          <div class="space-y-3 mt-2">
            <div>
              <label class="block text-xs font-medium mb-1">Client name</label>
              <input v-model="clientName" type="text" class="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Project reference</label>
              <input v-model="projectText" type="text" class="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Executive signature</label>
              <input v-model="executiveSignature" type="text" class="w-full border rounded px-3 py-2" />
            </div>
          </div>
        </details>

        <div v-if="previewItems.length" class="space-y-3">
          <label class="block text-sm font-medium">Preview</label>
          <div v-for="(item, i) in previewItems" :key="i" class="border rounded-lg p-3 bg-[#e7ffdb]">
            <div class="text-xs font-medium text-gray-500 mb-1">{{ item.label }}</div>
            <div class="whitespace-pre-line text-sm" v-html="renderPreviewBody(item.type).replace(/\*(.+?)\*/g, '<strong>$1</strong>')" />
            <div v-if="PREVIEW_BUTTON[item.type]" class="mt-2 text-center text-sm text-blue-600 border-t pt-2">
              {{ PREVIEW_BUTTON[item.type] }}
            </div>
          </div>
        </div>

        <B24Button :disabled="!canSend" :loading="sending" @click="send">Send</B24Button>

        <div v-if="results" class="space-y-1">
          <B24Alert
            v-for="(r, i) in results"
            :key="i"
            :color="r.success ? 'air-primary-success' : 'air-primary-alert'"
            :title="`${r.item}: ${r.success ? 'sent ✓' : `failed ✗ (${r.error})`}`"
          />
        </div>
      </div>
    </B24Card>
  </div>
</template>
