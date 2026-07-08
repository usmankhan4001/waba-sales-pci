require('dotenv').config();

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
};
