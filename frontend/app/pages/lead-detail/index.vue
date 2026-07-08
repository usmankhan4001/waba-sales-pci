<script setup lang="ts">
const b24 = useB24()
const config = useRuntimeConfig()

const leadId = ref<number | null>(null)
const leadName = ref('')

// Projects are catalog sections (crm.productsection.list), not a custom SPA - confirmed via live
// discovery. Leaf sections (non-null SECTION_ID) within the product catalog are the projects
// (e.g. "Box Park 3", "Buraq Heights"), the null-SECTION_ID sections are country-level buckets.
const projects = ref<{ id: number; title: string }[]>([])
const selectedProjectId = ref<number | null>(null)
const projectDriveFolderId = ref<number | null>(null) // resolved by name-match once selected

const ctaNumber = ref('')
const defaultCtaNumber = ref('') // guardrail 8.2: used to flag deviation from the executive's profile default

type DriveFile = { id: number; name: string; type: 'brochure' | 'pdf' | 'video' | 'image' | null }
const files = ref<DriveFile[]>([])
const selectedFileIds = ref<number[]>([])

const sending = ref(false)
const results = ref<{ item: string; success: boolean; error?: string }[] | null>(null)
const loadError = ref('')

const TYPE_BY_KEYWORD: [RegExp, DriveFile['type']][] = [
  [/brochure/i, 'brochure'],
  [/\.pdf$/i, 'pdf'],
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

    const [leadRes, userRes, sectionsRes] = await Promise.all([
      b24.callMethod('crm.lead.get', { id: leadId.value }),
      b24.callMethod('user.current', {}),
      b24.callMethod('crm.productsection.list', { filter: { CATALOG_ID: config.public.productCatalogId } }),
    ])

    leadName.value = leadRes.getData().result?.NAME || ''
    const profileCta = userRes.getData().result?.UF_USR_WHATSAPP_CTA || ''
    ctaNumber.value = profileCta
    defaultCtaNumber.value = profileCta

    const sections = sectionsRes.getData().result || []
    projects.value = sections
      .filter((s: any) => s.SECTION_ID !== null)
      .map((s: any) => ({ id: Number(s.ID), title: s.NAME }))
  } catch (err: any) {
    loadError.value = err.message || 'Failed to load lead data'
  }
})

watch(selectedProjectId, async (id) => {
  files.value = []
  selectedFileIds.value = []
  projectDriveFolderId.value = null

  const project = projects.value.find((p) => p.id === id)
  if (!project || !config.public.projectsDriveRootFolderId) return

  // Drive structure isn't organized yet (per project) - once it is, each project's folder
  // should sit directly under projectsDriveRootFolderId with a name matching the section exactly.
  const rootRes = await b24.callMethod('disk.folder.getchildren', { id: Number(config.public.projectsDriveRootFolderId) })
  const rootChildren = rootRes.getData().result || []
  const match = rootChildren.find((c: any) => c.TYPE === 'folder' && c.NAME === project.title)
  if (!match) return

  projectDriveFolderId.value = Number(match.ID)
  const res = await b24.callMethod('disk.folder.getchildren', { id: projectDriveFolderId.value })
  const children = res.getData().result || []
  files.value = children
    .filter((c: any) => c.TYPE === 'file')
    .map((c: any) => ({ id: Number(c.ID), name: c.NAME, type: classify(c.NAME) }))
    .filter((f: DriveFile) => f.type)
})

const filesByType = computed(() => {
  const groups: Record<string, DriveFile[]> = { brochure: [], pdf: [], video: [], image: [] }
  for (const f of files.value) if (f.type) groups[f.type].push(f)
  return groups
})

const canSend = computed(() => selectedFileIds.value.length > 0 && ctaNumber.value.trim().length > 0 && !sending.value)

async function send() {
  sending.value = true
  results.value = null
  try {
    const auth = b24.auth.getAuthData()
    const project = projects.value.find((p) => p.id === selectedProjectId.value)
    const selectedFiles = files.value
      .filter((f) => selectedFileIds.value.includes(f.id))
      .map((f) => ({ id: f.id, type: f.type, filename: f.name }))

    const resp = await fetch(`${config.public.backendUrl}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: auth?.domain,
        accessToken: auth?.access_token,
        leadId: leadId.value,
        projectName: project?.title,
        projectDriveFolderId: projectDriveFolderId.value,
        ctaNumber: ctaNumber.value,
        defaultCtaNumber: defaultCtaNumber.value,
        files: selectedFiles,
      }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || 'Send failed')
    results.value = data.results
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

    <B24Card>
      <template #header>
        <h3 class="text-lg font-medium">Send WhatsApp Material</h3>
      </template>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Project</label>
          <B24Select
            v-model="selectedProjectId"
            :items="projects.map((p) => ({ label: p.title, value: p.id }))"
            placeholder="Select a project"
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Contact Now number</label>
          <input
            v-model="ctaNumber"
            type="text"
            class="w-full border rounded px-3 py-2"
            placeholder="+9715xxxxxxxx"
          />
        </div>

        <div v-if="selectedProjectId" class="space-y-3">
          <div v-for="(group, type) in filesByType" :key="type">
            <template v-if="group.length">
              <div class="text-sm font-medium capitalize mb-1">{{ type }}</div>
              <div v-for="f in group" :key="f.id" class="flex items-center gap-2">
                <B24Checkbox
                  :model-value="selectedFileIds.includes(f.id)"
                  @update:model-value="
                    (v) => (selectedFileIds = v ? [...selectedFileIds, f.id] : selectedFileIds.filter((id) => id !== f.id))
                  "
                />
                <span>{{ f.name }}</span>
              </div>
            </template>
          </div>
        </div>

        <B24Button :disabled="!canSend" :loading="sending" @click="send">
          Send
        </B24Button>

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
