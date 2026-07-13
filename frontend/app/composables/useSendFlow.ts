import type { SendResultItem } from '~/types/bitrix'

/**
 * Owns the /api/send call, an Idempotency-Key per attempt (pairs with the backend's
 * idempotency cache - a retry on a network blip replays the cached result instead of
 * double-sending), and per-item result state.
 *
 * Previously, any exception here (a real network failure that never reached the backend,
 * *or* a definite rejection like a 429 rate-limit with a clear reason) was collapsed into
 * the same generic `{ item: 'Send', success: false, error }` row, indistinguishable from a
 * legitimate per-item failure. `networkError` and `status` let the UI tell these apart.
 */
export function useSendFlow() {
  const config = useRuntimeConfig()

  const sending = ref(false)
  const results = ref<SendResultItem[] | null>(null)

  async function send(payload: Record<string, unknown>): Promise<SendResultItem[] | null> {
    sending.value = true
    results.value = null

    try {
      let resp: Response
      try {
        resp = await fetch(`${config.public.backendUrl}/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify(payload),
        })
      } catch {
        results.value = [
          { item: 'Send', success: false, error: 'Could not reach the server - check your connection and try again.', networkError: true },
        ]
        return null
      }

      const data = await resp.json()
      if (!resp.ok) {
        results.value = [{ item: 'Send', success: false, error: data.error || 'Send failed', status: resp.status }]
        return null
      }

      results.value = data.results
      return data.results
    } finally {
      sending.value = false
    }
  }

  return { sending, results, send }
}
