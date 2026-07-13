require('dotenv').config();
const { z } = require('zod');

// Fatal: the app cannot function at all without these - fail at boot instead of failing
// mid-request hours into production (e.g. the OAuth refresh path previously only noticed
// a missing BITRIX_CLIENT_SECRET the first time a token needed refreshing).
const requiredSchema = z
  .object({
    BASE_URL: z.string().url({ message: 'must be a valid URL (this backend\'s own public URL)' }),
    FRONTEND_URL: z.string().url({ message: 'must be a valid URL (the deployed Nuxt frontend)' }),
    BITRIX_CLIENT_ID: z.string().min(1),
    BITRIX_CLIENT_SECRET: z.string().min(1),
    ONCLOUD_TOKEN: z.string().optional(),
    ONCLOUD_EMAIL: z.string().optional(),
    ONCLOUD_PASSWORD: z.string().optional(),
  })
  .refine((env) => env.ONCLOUD_TOKEN || (env.ONCLOUD_EMAIL && env.ONCLOUD_PASSWORD), {
    message: 'Either ONCLOUD_TOKEN or both ONCLOUD_EMAIL and ONCLOUD_PASSWORD must be set',
    path: ['ONCLOUD_TOKEN'],
  });

const parsedRequired = requiredSchema.safeParse(process.env);
if (!parsedRequired.success) {
  console.error('[config] Invalid or missing required environment variables:');
  for (const issue of parsedRequired.error.issues) {
    console.error(`  - ${issue.path.join('.') || '(config)'}: ${issue.message}`);
  }
  console.error('[config] Refusing to start - fix backend/.env (see backend/.env.example) and restart.');
  process.exit(1);
}

// Degraded-but-not-fatal: missing these only breaks one specific feature, not the whole
// app, so warn loudly rather than refusing to boot.
const RECOMMENDED_VARS = {
  ONCLOUD_WEBHOOK_SECRET: 'the OnCloud opt-out webhook will reject every request (fails closed, but STOP/unsubscribe replies will never be recorded)',
  FALLBACK_WHATSAPP_NUMBER: '/connect/:token will 410 instead of falling back when a link is unknown/expired',
  DEFAULT_COVER_IMAGE_URL: 'Contact Now sends will fail for any project with no Drive cover image of its own',
};
for (const [key, consequence] of Object.entries(RECOMMENDED_VARS)) {
  if (!process.env[key]) {
    console.warn(`[config] ${key} is not set - ${consequence}.`);
  }
}

module.exports = {
  port: process.env.PORT || 3000,
  baseUrl: process.env.BASE_URL,
  frontendUrl: process.env.FRONTEND_URL,
  bitrix: {
    clientId: process.env.BITRIX_CLIENT_ID,
    clientSecret: process.env.BITRIX_CLIENT_SECRET,
  },
  oncloud: {
    baseUrl: process.env.ONCLOUD_BASE_URL || 'https://apps.oncloudapi.com',
    staticToken: process.env.ONCLOUD_TOKEN,
    email: process.env.ONCLOUD_EMAIL,
    password: process.env.ONCLOUD_PASSWORD,
  },
  dailySendLimitPerExecutive: Number(process.env.DAILY_SEND_LIMIT_PER_EXECUTIVE || 100),
  // FR-16: safe fallback destination when a /connect/:token is unknown or expired
  fallbackWhatsappNumber: process.env.FALLBACK_WHATSAPP_NUMBER,
  // FR-17: brand cover image used when a project has no Drive cover image of its own
  defaultCoverImageUrl: process.env.DEFAULT_COVER_IMAGE_URL,
  // Shared secret required as ?secret= on the OnCloud incoming-message webhook, so an
  // anonymous caller can't mass-suppress arbitrary numbers via the opt-out endpoint.
  oncloudWebhookSecret: process.env.ONCLOUD_WEBHOOK_SECRET,
};
