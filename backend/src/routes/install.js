const express = require('express');
const config = require('../config');
const { saveInstallAuth } = require('../bitrix/auth');
const { callMethod } = require('../bitrix/client');

const router = express.Router();

/**
 * Bitrix24 posts here on install (ONAPPINSTALL) and also re-posts on every
 * "reinstall/update" from Developer Resources. For a Local Application the
 * tokens arrive directly in the body - no authorization-code exchange step.
 */
const SECRET_FIELDS = new Set(['AUTH_ID', 'REFRESH_ID']);
function redact(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SECRET_FIELDS.has(k) ? '<redacted>' : v]));
}

async function handleInstall(req, res) {
  const params = { ...req.query, ...req.body };
  console.log(
    `[install] ${req.method} content-type=${req.headers['content-type']} query=${JSON.stringify(redact(req.query))} body=${JSON.stringify(redact(req.body))}`
  );

  const { DOMAIN, PROTOCOL, AUTH_ID, AUTH_EXPIRES, REFRESH_ID, member_id } = params;

  if (!DOMAIN || !AUTH_ID || !REFRESH_ID) {
    console.warn('[install] missing required params, keys present:', Object.keys(params));
    return res.status(400).send('Missing required install parameters');
  }

  saveInstallAuth({
    domain: DOMAIN,
    protocol: PROTOCOL === '1' ? 'https' : 'https',
    authId: AUTH_ID,
    authExpires: AUTH_EXPIRES,
    refreshId: REFRESH_ID,
    memberId: member_id,
  });

  // FR-1: bind the Lead-detail placement to the frontend - no manual UI step needed for this part.
  if (config.frontendUrl) {
    try {
      await callMethod(DOMAIN, 'placement.bind', {
        PLACEMENT: 'CRM_LEAD_DETAIL_TAB',
        HANDLER: `${config.frontendUrl}/lead-detail`,
        TITLE: 'Send WhatsApp Material',
      });
    } catch (err) {
      console.error(`[install] placement.bind failed for ${DOMAIN}:`, err.message);
    }
  }

  res.set('Content-Type', 'text/html').send(`
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
  `);
}

router.use(express.urlencoded({ extended: true }));
router.use(express.json());
router.post('/', handleInstall);
router.get('/', handleInstall);

module.exports = router;
