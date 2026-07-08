import { initializeB24Frame, type B24Frame } from '@bitrix24/b24jssdk'

export default defineNuxtPlugin(async () => {
  const b24 = await initializeB24Frame()

  return {
    provide: {
      b24: b24 as B24Frame,
    },
  }
})
