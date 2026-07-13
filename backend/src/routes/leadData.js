const express = require('express');
const { z } = require('zod');
const bitrixClient = require('../bitrix/client');
const tokenStore = require('../store/tokenStore');
const leadDataService = require('../services/leadData');

const router = express.Router();
router.use(express.json());

const requestSchema = z.object({
  domain: z.string().min(1, 'domain is required'),
  accessToken: z.string().min(1, 'accessToken is required'),
  leadId: z.union([z.string(), z.number()]),
  entityTypeId: z.number().int().optional().default(1),
});

/**
 * POST /api/lead-data { domain, accessToken, leadId, entityTypeId }
 * Resolves the CRM entity's display name and phone number server-side, using the same
 * entity-type mapping and phone-resolution logic as /api/send (services/leadData.js) -
 * the frontend previously re-derived this itself from raw Bitrix REST calls, which could
 * drift from the backend's own copy of the same logic.
 */
router.post('/', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; '),
    });
  }
  const { domain, accessToken, leadId, entityTypeId } = parsed.data;

  if (!tokenStore.getBitrixAuth(bitrixClient.normalizeDomain(domain))) {
    return res.status(403).json({ error: 'This Bitrix24 portal is not installed / recognized by this app' });
  }

  try {
    const result = await leadDataService.fetchEntityWithPhone(domain, accessToken, leadId, entityTypeId);
    if (!result) return res.status(404).json({ error: 'CRM record not found' });

    res.json({
      leadName: result.leadName,
      leadPhone: result.phone || '',
      responsibleId: result.entityData.ASSIGNED_BY_ID || null,
    });
  } catch (err) {
    req.log.error({ leadId, err }, '[lead-data] failed to resolve entity');
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
