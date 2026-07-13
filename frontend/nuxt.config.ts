// The localhost:3000 fallback below is only safe for local dev - if it silently ships in a
// production build, every Bitrix tab would try to call a backend that doesn't exist there.
function resolveBackendUrl(): string {
  const url = process.env.NUXT_PUBLIC_BACKEND_URL
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error(
      'NUXT_PUBLIC_BACKEND_URL must be set in production - refusing to silently fall back to http://localhost:3000.'
    )
  }
  return url || 'http://localhost:3000'
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@bitrix24/b24ui-nuxt'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      backendUrl: resolveBackendUrl(),
      // Projects are the Drive subfolders directly under this root folder ("WABA Project Files") -
      // each subfolder IS a project, named however the folder is named.
      projectsDriveRootFolderId: process.env.NUXT_PUBLIC_PROJECTS_DRIVE_ROOT_FOLDER_ID || '',
    },
  },
})
