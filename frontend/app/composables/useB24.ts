import type { B24Frame } from '@bitrix24/b24jssdk'

/**
 * Access the B24Frame instance created once in plugins/b24frame.client.ts (a client-only
 * plugin, so $b24 is legitimately undefined during SSR - only throw client-side, where a
 * missing $b24 after mount means the page was opened outside a Bitrix24 iframe.
 */
export function useB24(): B24Frame {
  const { $b24 } = useNuxtApp()
  if (!$b24 && import.meta.client) {
    throw new Error('This page must be opened inside Bitrix24 - the B24 frame did not initialize.')
  }
  return $b24 as B24Frame
}
