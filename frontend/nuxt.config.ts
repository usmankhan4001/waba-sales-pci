// NOTE: nuxt.config.ts is evaluated during `nuxt build` (a separate step/environment from
// the running container), and Dokploy only injects NUXT_PUBLIC_BACKEND_URL as a *runtime*
// container env var, not a build-time one - a build-time throw here broke a real deploy.
// Nitro already re-reads NUXT_PUBLIC_* env vars at server start and overrides whatever was
// baked in at build time, so the localhost:3000 default below only matters for local `nuxt
// dev` - it's never actually served in production as long as the runtime env var is set.
function resolveBackendUrl(): string {
  const url = process.env.NUXT_PUBLIC_BACKEND_URL
  if (!url && process.env.NODE_ENV === 'production') {
    console.warn(
      '[nuxt.config] NUXT_PUBLIC_BACKEND_URL is not set at build time - relying on it being set as a runtime env var instead (see server/plugins/checkConfig.ts).'
    )
  }
  return url || 'http://localhost:3000'
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@bitrix24/b24ui-nuxt', '@nuxt/eslint'],
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
