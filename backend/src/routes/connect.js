const express = require('express');
const config = require('../config');
const connectTokens = require('../store/connectTokens');
const { maskPhone } = require('../lib/redact');

const router = express.Router();

// The approved template's button base URL has the literal text "{{token}}" baked in before
// the real {{1}} variable (a template-authoring mistake on Meta's side that can't be fixed
// without resubmitting for re-approval) - strip it if present so the real token still resolves.
function stripLiteralPlaceholder(raw) {
  return raw.replace(/^\{\{token\}\}/, '');
}

// wa.me/<number> must be digits only - a crafted CTA number like "1234@evil.com" would
// otherwise be parsed by browsers as userinfo+host, turning this into an open redirect.
function sanitizePhoneForWaMe(raw) {
  return String(raw).replace(/\D/g, '');
}

/** FR-16: resolves a short-lived connect token and 302s to the executive's wa.me link. */
router.get('/:token', async (req, res) => {
  const token = stripLiteralPlaceholder(req.params.token);

  try {
    const number = await connectTokens.resolveToken(token);

    if (!number) {
      req.log.warn({ token }, '[connect] unknown or expired token');
      if (!config.fallbackWhatsappNumber) return res.status(410).send('This link has expired.');
      return res.redirect(302, `https://wa.me/${sanitizePhoneForWaMe(config.fallbackWhatsappNumber)}`);
    }

    const safeNumber = sanitizePhoneForWaMe(number);
    req.log.info({ token, number: maskPhone(safeNumber) }, '[connect] resolved');
    res.redirect(302, `https://wa.me/${safeNumber}`);
  } catch (err) {
    req.log.error({ token, err }, '[connect] error resolving token');
    if (config.fallbackWhatsappNumber) {
      return res.redirect(302, `https://wa.me/${sanitizePhoneForWaMe(config.fallbackWhatsappNumber)}`);
    }
    res.status(500).send('Something went wrong resolving this link.');
  }
});

module.exports = router;
