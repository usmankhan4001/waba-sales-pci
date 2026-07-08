// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@bitrix24/b24ui-nuxt'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      backendUrl: process.env.NUXT_PUBLIC_BACKEND_URL || 'http://localhost:3000',
      // Projects are catalog sections (crm.productsection.list), not a custom SPA -
      // confirmed via live discovery (e.g. "Box Park 3", "Buraq Heights" match existing OnCloud templates).
      // Leaf sections (non-null SECTION_ID) within this catalog are the selectable projects.
      productCatalogId: process.env.NUXT_PUBLIC_PRODUCT_CATALOG_ID || '15',
      // Root Drive folder under which each project's subfolder (matching its section NAME exactly)
      // will live once the organized Drive structure is set up - open question, not yet organized.
      projectsDriveRootFolderId: process.env.NUXT_PUBLIC_PROJECTS_DRIVE_ROOT_FOLDER_ID || '',
    },
  },
})
