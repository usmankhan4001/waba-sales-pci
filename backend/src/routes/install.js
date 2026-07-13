const express = require('express');
const config = require('../config');
const { saveInstallAuth } = require('../bitrix/auth');
const { callMethod } = require('../bitrix/client');

const router = express.Router();

const SECRET_FIELDS = new Set(['AUTH_ID', 'REFRESH_ID']);
function redact(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SECRET_FIELDS.has(k) ? '<redacted>' : v]));
}

const SUCCESS_HTML = `
  <html>
    <head>
      <script src="//api.bitrix24.com/api/v1/"></script>
    </head>
    <body>
      <script>
        BX24.init(function () {
          BX24.installFinish();
        });
      </script>
      Installed.
    </body>
  </html>
`;

/**
 * Bitrix24 appears to probe this URL with a bare GET (no params) before sending the
 * real ONAPPINSTALL POST - it must succeed unconditionally or Bitrix aborts before
 * ever sending the actual install call with the auth tokens.
 */
router.get('/', (req, res) => {
  console.log(`[install] GET probe query=${JSON.stringify(redact(req.query))}`);
  res.set('Content-Type', 'text/html').send(SUCCESS_HTML);
});

/**
 * Bitrix24 posts here on install (ONAPPINSTALL) and also re-posts on every
 * "reinstall/update" from Developer Resources. For a Local Application the
 * tokens arrive directly in the body - no authorization-code exchange step.
 */
router.post('/', express.urlencoded({ extended: true }), express.json(), async (req, res) => {
  const params = { ...req.query, ...req.body };
  console.log(`[install] POST content-type=${req.headers['content-type']} body=${JSON.stringify(redact(req.body))}`);

  const { DOMAIN, PROTOCOL, AUTH_ID, AUTH_EXPIRES, REFRESH_ID, member_id } = params;

  if (!DOMAIN || !AUTH_ID || !REFRESH_ID) {
    console.warn('[install] POST missing required params, keys present:', Object.keys(params));
    return res.status(400).send('Missing required install parameters');
  }

  try {
    await saveInstallAuth({
      domain: DOMAIN,
      protocol: PROTOCOL === '1' ? 'https' : 'https',
      authId: AUTH_ID,
      authExpires: AUTH_EXPIRES,
      refreshId: REFRESH_ID,
      memberId: member_id,
    });
  } catch (err) {
    console.error(`[install] saveInstallAuth failed for ${DOMAIN}:`, err.message);
    return res.status(500).send('Failed to save install auth');
  }

  // FR-1: bind the Lead-detail placement - no manual UI step needed for this part.
  // The HANDLER must be on this same backend domain (the app's registered domain) -
  // Bitrix24 rejects placement.bind if it points at a different domain (e.g. the
  // frontend's own separate Dokploy domain), so /lead-detail is reverse-proxied
  // through to the actual frontend app (see index.js).
  try {
    await callMethod(DOMAIN, 'placement.bind', {
      PLACEMENT: 'CRM_LEAD_DETAIL_TAB',
      HANDLER: `${config.baseUrl}/lead-detail`,
      TITLE: 'Send WhatsApp Material',
    });
  } catch (err) {
    console.error(`[install] placement.bind failed for ${DOMAIN}:`, err.response?.data || err.message);
  }

  res.set('Content-Type', 'text/html').send(SUCCESS_HTML);
});

module.exports = router;
