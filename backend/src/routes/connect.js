const express = require('express');
const config = require('../config');
const connectTokens = require('../store/connectTokens');

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
  const number = await connectTokens.resolveToken(token);

  if (!number) {
    console.warn(`[connect] unknown or expired token: ${token}`);
    if (!config.fallbackWhatsappNumber) return res.status(410).send('This link has expired.');
    return res.redirect(302, `https://wa.me/${sanitizePhoneForWaMe(config.fallbackWhatsappNumber)}`);
  }

  const safeNumber = sanitizePhoneForWaMe(number);
  console.log(`[connect] token ${token} -> wa.me/${safeNumber}`);
  res.redirect(302, `https://wa.me/${safeNumber}`);
});

module.exports = router;
