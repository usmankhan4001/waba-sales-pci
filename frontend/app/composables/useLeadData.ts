import type { DriveFile, DriveFolder } from '~/types/bitrix'

const TYPE_BY_KEYWORD: [RegExp, string][] = [
  [/brochure/i, 'brochure'],
  [/video/i, 'video'],
  [/\.(mp4|mov)$/i, 'video'],
  [/\.pdf$/i, 'brochure'],
]

function classify(name: string): string | null {
  const hit = TYPE_BY_KEYWORD.find(([re]) => re.test(name))
  return hit ? hit[1] : null
}

/**
 * Owns CRM entity/phone resolution, executive profile, and Drive project/file listing for
 * the lead-detail tab. Entity-type mapping and phone resolution are now resolved server-side
 * via POST /api/lead-data (backend/src/services/leadData.js) instead of being re-derived
 * here - this composable previously duplicated that logic (normalizePhones/pickBestPhone/
 * resolveEntityPhones/entity-type-to-endpoint mapping) against the backend's own copy in
 * send.js, and the two could drift.
 */
export function useLeadData() {
  const b24 = useB24()
  const config = useRuntimeConfig()

  const loading = ref(true)
  const loadError = ref('')
  const fileLoadError = ref('')

  const leadId = ref<number | null>(null)
  const entityTypeId = ref(1)
  const leadName = ref('')
  const leadPhone = ref('')
  const responsibleId = ref<number | null>(null)

  const projects = ref<DriveFolder[]>([])
  const selectedProjectId = ref<number | null>(null)
  const files = ref<DriveFile[]>([])

  const ctaNumber = ref('')
  const defaultCtaNumber = ref('')
  const executiveName = ref('')
  const clientName = ref('')
  const projectText = ref('')
  const executiveSignature = ref('')

  async function load() {
    loading.value = true
    loadError.value = ''
    try {
      const options = b24.placement.options as Record<string, unknown>
      leadId.value = Number(options?.ID ?? options?.ENTITY_ID)

      if (!leadId.value || Number.isNaN(leadId.value)) {
        loadError.value = 'Could not determine which CRM record this tab belongs to.'
        return
      }

      let placementStr = ''
      try {
        placementStr = String((b24.placement.info as { placement?: string })?.placement || options?.PLACEMENT || '').toUpperCase()
      } catch {
        placementStr = String(options?.PLACEMENT || '').toUpperCase()
      }

      if (placementStr.includes('DEAL')) entityTypeId.value = 2
      else if (placementStr.includes('CONTACT')) entityTypeId.value = 3
      else entityTypeId.value = 1

      const auth = b24.auth.getAuthData()
      if (!auth?.domain || !auth?.access_token) {
        throw new Error('Could not read Bitrix24 auth from the frame - try reloading the tab.')
      }

      const [leadDataResp, userRes, rootRes] = await Promise.all([
        fetch(`${config.public.backendUrl}/api/lead-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: auth.domain,
            accessToken: auth.access_token,
            leadId: leadId.value,
            entityTypeId: entityTypeId.value,
          }),
        }),
        b24.actions.v2.call.make({ method: 'user.current', params: {} }),
        b24.actions.v2.call.make({ method: 'disk.folder.getchildren', params: { id: Number(config.public.projectsDriveRootFolderId) } }),
      ])

      const leadDataBody = await leadDataResp.json()
      if (!leadDataResp.ok) throw new Error(leadDataBody.error || 'Failed to load CRM record')

      leadName.value = leadDataBody.leadName || ''
      leadPhone.value = leadDataBody.leadPhone || ''
      responsibleId.value = leadDataBody.responsibleId ?? null
      clientName.value = leadName.value || 'there'

      const user = userRes.getData().result || {}
      const profileCta = user.UF_USR_WHATSAPP_CTA || ''
      ctaNumber.value = profileCta
      defaultCtaNumber.value = profileCta
      executiveName.value = [user.NAME, user.LAST_NAME].filter(Boolean).join(' ')
      executiveSignature.value = executiveName.value || 'Your Sales Advisor'

      const rootChildren = rootRes.getData().result || []
      projects.value = rootChildren
        .filter((c: { TYPE: string }) => c.TYPE === 'folder')
        .map((c: { ID: string; NAME: string }) => ({ id: Number(c.ID), title: c.NAME }))
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load lead data'
    } finally {
      loading.value = false
    }
  }

  async function loadFiles(id: number | null) {
    files.value = []
    fileLoadError.value = ''
    projectText.value = projects.value.find((p) => p.id === id)?.title || ''
    if (!id) return

    try {
      const res = await b24.actions.v2.call.make({ method: 'disk.folder.getchildren', params: { id } })
      const children = res.getData().result || []
      files.value = children
        .filter((c: { TYPE: string }) => c.TYPE === 'file')
        .map((c: { ID: string; NAME: string }) => ({ id: Number(c.ID), name: c.NAME, type: classify(c.NAME) }))
        .filter((f: DriveFile) => f.type)
    } catch (err) {
      fileLoadError.value = `Could not load files for this project: ${err instanceof Error ? err.message : 'unknown error'}`
    }
  }

  watch(selectedProjectId, loadFiles)

  onMounted(load)

  return {
    loading,
    loadError,
    fileLoadError,
    leadId,
    entityTypeId,
    leadName,
    leadPhone,
    responsibleId,
    projects,
    selectedProjectId,
    files,
    ctaNumber,
    defaultCtaNumber,
    executiveName,
    clientName,
    projectText,
    executiveSignature,
    retry: load,
    retryFiles: () => loadFiles(selectedProjectId.value),
  }
}
