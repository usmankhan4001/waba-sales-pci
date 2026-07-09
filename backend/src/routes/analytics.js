const express = require('express');
const { callMethodWithToken } = require('../bitrix/client');
const analyticsLog = require('../store/analyticsLog');

const router = express.Router();

/**
 * GET /api/analytics?domain=...&accessToken=...
 * Admin-only: aggregates every logged send (see analyticsLog) by lead and by project.
 */
router.get('/', async (req, res) => {
  const { domain, accessToken } = req.query;
  if (!domain || !accessToken) {
    return res.status(400).json({ error: 'domain and accessToken are required' });
  }

  try {
    const userResp = await callMethodWithToken(domain, 'user.current', {}, accessToken);
    if (!userResp.result?.ADMIN) {
      return res.status(403).json({ error: 'Analytics is restricted to portal admins' });
    }

    const entries = analyticsLog.readAll();

    const byLead = {};
    for (const e of entries) {
      const key = e.leadId;
      if (!byLead[key]) {
        byLead[key] = { leadId: e.leadId, leadName: e.leadName, projectName: e.projectName, sent: 0, failed: 0, items: [] };
      }
      byLead[key].sent += e.success ? 1 : 0;
      byLead[key].failed += e.success ? 0 : 1;
      byLead[key].items.push({ timestamp: e.timestamp, item: e.item, type: e.type, success: e.success, error: e.error, executiveName: e.executiveName });
    }

    res.json({
      totalSent: entries.filter((e) => e.success).length,
      totalFailed: entries.filter((e) => !e.success).length,
      leads: Object.values(byLead).sort((a, b) => new Date(b.items.at(-1)?.timestamp) - new Date(a.items.at(-1)?.timestamp)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
