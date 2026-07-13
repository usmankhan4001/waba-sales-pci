const express = require('express');
const { publicMessageTypes } = require('../config/messageTypes');

const router = express.Router();

/**
 * GET /api/message-types
 * Exposes the valid message types + their approved Meta template name and preview copy -
 * the single source of truth in config/messageTypes.js. The frontend fetches this instead
 * of hardcoding its own parallel copy of labels/preview text/template names, which could
 * silently drift from what's actually configured to send.
 */
router.get('/', (req, res) => {
  res.json({ messageTypes: publicMessageTypes() });
});

module.exports = router;
