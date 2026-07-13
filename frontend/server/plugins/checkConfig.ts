// Runs when the Nitro server actually starts (i.e. in the running container, where
// Dokploy's runtime env vars exist) - unlike nuxt.config.ts, which only runs during the
// separate `nuxt build` step and doesn't have this env var available in this deployment.
// A warning here is the correct signal: it means every Bitrix tab will try to call
// http://localhost:3000, which doesn't exist in production.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  if (config.public.backendUrl === 'http://localhost:3000' && process.env.NODE_ENV === 'production') {
    console.error(
      '[checkConfig] NUXT_PUBLIC_BACKEND_URL is not set - this server is falling back to http://localhost:3000, which will break every request from the Bitrix tab. Set it as a runtime environment variable for this service.'
    )
  }
})
