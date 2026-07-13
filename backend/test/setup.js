// Runs before any test file. config.js validates required env vars at import time
// (fail-fast on boot, see Phase 1) - tests need these set before anything under test
// pulls config.js in transitively (bitrix/client -> bitrix/auth -> config, etc).
// Set unconditionally (not `||`-defaulted) for hermeticity - Vite/Vitest itself sets
// process.env.BASE_URL = '/' by default, which would otherwise silently win here and
// fail config.js's URL validation with a confusing error.
process.env.BASE_URL = 'https://test.example.com';
process.env.FRONTEND_URL = 'https://frontend.test.example.com';
process.env.BITRIX_CLIENT_ID = 'test-client-id';
process.env.BITRIX_CLIENT_SECRET = 'test-client-secret';
process.env.ONCLOUD_TOKEN = 'test-oncloud-token';
