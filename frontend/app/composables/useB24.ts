import type { B24Frame } from '@bitrix24/b24jssdk'

/**
 * Access the B24Frame instance created once in plugins/b24frame.client.ts.
 * Throws a clear error (instead of a raw "Cannot read properties of undefined") if this
 * page was opened outside a Bitrix24 iframe, where the SDK never initializes.
 */
export function useB24(): B24Frame {
  const { $b24 } = useNuxtApp()
  if (!$b24) {
    throw new Error('This page must be opened inside Bitrix24 - the B24 frame did not initialize.')
  }
  return $b24 as B24Frame
}
