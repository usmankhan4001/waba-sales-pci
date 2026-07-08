import type { B24Frame } from '@bitrix24/b24jssdk'

/** Access the B24Frame instance created once in plugins/b24frame.client.ts */
export function useB24(): B24Frame {
  const { $b24 } = useNuxtApp()
  return $b24 as B24Frame
}
