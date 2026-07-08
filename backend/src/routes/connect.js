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

/** FR-16: resolves a short-lived connect token and 302s to the executive's wa.me link. */
router.get('/:token', (req, res) => {
  const token = stripLiteralPlaceholder(req.params.token);
  const number = connectTokens.resolveToken(token);

  if (!number) {
    console.warn(`[connect] unknown or expired token: ${token}`);
    if (!config.fallbackWhatsappNumber) return res.status(410).send('This link has expired.');
    return res.redirect(302, `https://wa.me/${config.fallbackWhatsappNumber}`);
  }

  console.log(`[connect] token ${token} -> wa.me/${number}`);
  res.redirect(302, `https://wa.me/${number}`);
});

module.exports = router;
