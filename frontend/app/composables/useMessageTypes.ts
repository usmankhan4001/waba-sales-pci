import type { MessageTypeMeta } from '~/types/bitrix'

/** Fetches the backend's single source of truth for valid message types (template name +
 * preview copy) instead of hardcoding a parallel copy here that could drift - see
 * backend/src/config/messageTypes.js and GET /api/message-types. */
export function useMessageTypes() {
  const config = useRuntimeConfig()

  const messageTypes = ref<MessageTypeMeta[]>([])
  const loading = ref(false)
  const error = ref('')

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const resp = await fetch(`${config.public.backendUrl}/api/message-types`)
      if (!resp.ok) throw new Error('Failed to load message types')
      const body = await resp.json()
      messageTypes.value = body.messageTypes || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load message types'
    } finally {
      loading.value = false
    }
  }

  return { messageTypes, loading, error, load }
}
