const express = require('express');
const config = require('../config');
const connectTokens = require('../store/connectTokens');

const router = express.Router();

/** FR-16: resolves a short-lived connect token and 302s to the executive's wa.me link. */
router.get('/:token', (req, res) => {
  const number = connectTokens.resolveToken(req.params.token);

  if (!number) {
    console.warn(`[connect] unknown or expired token: ${req.params.token}`);
    if (!config.fallbackWhatsappNumber) return res.status(410).send('This link has expired.');
    return res.redirect(302, `https://wa.me/${config.fallbackWhatsappNumber}`);
  }

  console.log(`[connect] token ${req.params.token} -> wa.me/${number}`);
  res.redirect(302, `https://wa.me/${number}`);
});

module.exports = router;
