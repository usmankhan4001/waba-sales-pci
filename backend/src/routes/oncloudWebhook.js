const express = require('express');
const suppressionList = require('../store/suppressionList');

const router = express.Router();
router.use(express.json());

const OPT_OUT_PATTERN = /^\s*(stop|unsubscribe)\s*$/i;

/**
 * Guardrail 8.1: suppress a lead who replies STOP/unsubscribe from future template sends.
 *
 * Needs to be registered as the incoming-message webhook URL in the OnCloud dashboard.
 * OnCloud's exact incoming-message payload shape isn't in the provided Postman collection
 * (it only documents outbound calls), so this reads several plausible field names -
 * confirm the real shape against a live webhook delivery and trim this once known.
 */
router.post('/', (req, res) => {
  const body = req.body || {};
  const from = body.from || body.phone || body.sender || body.contact?.phone;
  const text = body.message || body.text || body.body || body.message?.text;

  if (from && typeof text === 'string' && OPT_OUT_PATTERN.test(text)) {
    suppressionList.suppress(from, 'lead replied STOP/unsubscribe');
    console.log(`[oncloud-webhook] suppressed ${from} (opt-out)`);
  }

  res.status(200).json({ ok: true });
});

module.exports = router;
