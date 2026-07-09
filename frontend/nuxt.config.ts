// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@bitrix24/b24ui-nuxt'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      backendUrl: process.env.NUXT_PUBLIC_BACKEND_URL || 'http://localhost:3000',
      // Projects are the Drive subfolders directly under this root folder ("WABA Project Files") -
      // each subfolder IS a project, named however the folder is named.
      projectsDriveRootFolderId: process.env.NUXT_PUBLIC_PROJECTS_DRIVE_ROOT_FOLDER_ID || '',
    },
  },
})
