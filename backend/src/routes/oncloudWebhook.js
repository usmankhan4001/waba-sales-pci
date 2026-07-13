const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const suppressionList = require('../store/suppressionList');
const { maskPhone } = require('../lib/redact');

const router = express.Router();
router.use(express.json());

const OPT_OUT_PATTERN = /^\s*(stop|unsubscribe)\s*$/i;

// Plain !== leaks timing information about how many leading characters matched - irrelevant
// for a short-lived session token, but this secret is long-lived and rarely rotated, so
// compare in constant time. Buffers must be equal length for timingSafeEqual to run at all.
function secretMatches(provided, expected) {
  const providedBuf = Buffer.from(String(provided || ''));
  const expectedBuf = Buffer.from(String(expected || ''));
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Guardrail 8.1: suppress a lead who replies STOP/unsubscribe from future template sends.
 *
 * Register this as the incoming-message webhook URL in the OnCloud dashboard, including
 * ?secret=<ONCLOUD_WEBHOOK_SECRET> in the URL - without it, anyone who finds this endpoint
 * could mass-suppress arbitrary numbers.
 *
 * OnCloud's exact incoming-message payload shape isn't in the provided Postman collection
 * (it only documents outbound calls), so this reads several plausible field names -
 * confirm the real shape against a live webhook delivery and trim this once known.
 */
router.post('/', async (req, res) => {
  if (!config.oncloudWebhookSecret || !secretMatches(req.query.secret, config.oncloudWebhookSecret)) {
    return res.status(401).json({ error: 'invalid secret' });
  }

  // Shape is genuinely unknown (see comment above) - just guard against a malformed
  // payload (array/primitive/null) rather than presuming an exact schema.
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const from = body.from || body.phone || body.sender || body.contact?.phone;
  const text = body.message || body.text || body.body || body.message?.text;

  try {
    if (from && typeof text === 'string' && OPT_OUT_PATTERN.test(text)) {
      await suppressionList.suppress(from, 'lead replied STOP/unsubscribe');
      req.log.info({ phone: maskPhone(from) }, '[oncloud-webhook] suppressed (opt-out)');
    }
  } catch (err) {
    // Still ack with 200 below - OnCloud has no reason to retry, and a failed opt-out
    // write shouldn't turn into a webhook-delivery retry storm on their side.
    req.log.error({ phone: maskPhone(from), err }, '[oncloud-webhook] failed to record opt-out');
  }

  res.status(200).json({ ok: true });
});

module.exports = router;
