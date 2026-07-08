const express = require('express');
const config = require('../config');
const { callMethodWithToken } = require('../bitrix/client');
const oncloud = require('../oncloud/client');
const rateLimiter = require('../store/rateLimiter');
const connectTokens = require('../store/connectTokens');
const suppressionList = require('../store/suppressionList');

const router = express.Router();
router.use(express.json());

// Real approved OnCloud template names (FR-9/10/11/12) - confirmed live via getTemplates.
// No send_project_image equivalent is approved yet; kept here so a selected image fails
// cleanly with "template not in approved state" rather than an unknown-type error.
const CONTACT_NOW_TEMPLATE = 'contact_now_sales_pci';
const MEDIA_TEMPLATES = {
  brochure: { name: 'send_brochure_doc_sales_pci', build: (file) => oncloud.documentHeaderComponent(file.link, file.filename) },
  pdf: { name: 'send_brochure_doc_sales_pci', build: (file) => oncloud.documentHeaderComponent(file.link, file.filename) },
  video: { name: 'send_project_video_sales_pci', build: (file) => oncloud.videoHeaderComponent(file.link) },
  image: { name: 'send_project_image_sales_pci', build: (file) => oncloud.imageHeaderComponent(file.link) },
};

/** FR-17: project's Drive cover image if one exists, else the fixed default brand cover. */
async function resolveCoverImageLink(domain, accessToken, projectDriveFolderId) {
  if (projectDriveFolderId) {
    const childrenResp = await callMethodWithToken(domain, 'disk.folder.getchildren', { id: projectDriveFolderId }, accessToken);
    const cover = (childrenResp.result || []).find((c) => c.TYPE === 'file' && /cover/i.test(c.NAME));
    if (cover) {
      const linkResp = await callMethodWithToken(domain, 'disk.file.getExternalLink', { id: cover.ID }, accessToken);
      if (linkResp.result) return linkResp.result;
    }
  }
  return config.defaultCoverImageUrl;
}

/**
 * Body: {
 *   domain, accessToken,          // from BX24.getAuth() on the frontend
 *   leadId, projectName, projectDriveFolderId,
 *   ctaNumber, defaultCtaNumber,  // executive's WhatsApp number for the Contact Now button
 *   executiveName,                // FR-10/11/12: 3rd body variable (signature line) on every template
 *   files: [{ id, type, filename }]   // Drive file id, resolved to a shareable link server-side
 * }
 */
router.post('/', async (req, res) => {
  const {
    domain,
    accessToken,
    leadId,
    projectName,
    projectDriveFolderId,
    ctaNumber,
    defaultCtaNumber,
    executiveName,
    files = [],
  } = req.body;

  if (!domain || !accessToken || !leadId || !ctaNumber || files.length === 0) {
    return res.status(400).json({ error: 'domain, accessToken, leadId, ctaNumber and at least one file are required' });
  }

  try {
    const leadResp = await callMethodWithToken(domain, 'crm.lead.get', { id: leadId }, accessToken);
    const lead = leadResp.result;
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const phone = lead.PHONE?.[0]?.VALUE;
    if (!phone) return res.status(400).json({ error: 'Lead has no phone number' });

    const responsibleId = lead.ASSIGNED_BY_ID;

    // Guardrail 8.1: opt-out - suppressed leads are skipped entirely, but we still log why.
    if (suppressionList.isSuppressed(phone)) {
      await callMethodWithToken(
        domain,
        'crm.activity.add',
        {
          fields: {
            OWNER_TYPE_ID: 1,
            OWNER_ID: leadId,
            TYPE_ID: 4,
            SUBJECT: `WhatsApp material NOT sent — ${projectName || 'project'}`,
            DESCRIPTION: `This lead's number (${phone}) has opted out of WhatsApp messaging and was skipped.`,
            DESCRIPTION_TYPE: 1,
            RESPONSIBLE_ID: responsibleId,
            COMPLETED: 'Y',
          },
        },
        accessToken
      );
      return res.status(200).json({ results: [{ item: 'all', success: false, error: 'Lead has opted out of WhatsApp messaging' }] });
    }

    rateLimiter.checkAndIncrement(responsibleId);

    const approvedTemplates = await oncloud.getTemplates();
    const approvedNames = new Set(
      (Array.isArray(approvedTemplates) ? approvedTemplates : approvedTemplates?.data || [])
        .filter((t) => (t.status || t.quality || '').toString().toLowerCase() === 'approved')
        .map((t) => t.name || t.template_name)
    );

    // FR-10/11/12: every approved template's body takes 3 vars - client name, project name, executive signature.
    const bodyVars = [lead.NAME || 'there', projectName || 'the project', executiveName || 'Your Sales Advisor'];
    // FR-15/16: one connect token per send, reused across every message in this batch.
    const connectToken = connectTokens.createToken(ctaNumber);

    const results = [];

    // 1. contact_now, sent first (FR-13).
    try {
      if (approvedNames.size && !approvedNames.has(CONTACT_NOW_TEMPLATE)) {
        throw new Error(`${CONTACT_NOW_TEMPLATE} template is not in approved state`);
      }
      const coverImageLink = await resolveCoverImageLink(domain, accessToken, projectDriveFolderId);
      if (!coverImageLink) throw new Error('No project cover image and no default cover image configured');

      await oncloud.sendTemplateMessage({
        phone,
        templateName: CONTACT_NOW_TEMPLATE,
        components: [
          oncloud.imageHeaderComponent(coverImageLink),
          oncloud.textComponent(bodyVars),
          oncloud.urlButtonComponent(connectToken),
        ],
      });
      results.push({ item: 'contact_now', success: true });
    } catch (err) {
      results.push({ item: 'contact_now', success: false, error: err.message });
    }

    // 2. one template per selected file (FR-10/11/12), independent failures (guardrail 8.3)
    for (const file of files) {
      const mapping = MEDIA_TEMPLATES[file.type];
      if (!mapping) {
        results.push({ item: file.filename || file.type, success: false, error: `Unknown file type: ${file.type}` });
        continue;
      }
      try {
        if (approvedNames.size && !approvedNames.has(mapping.name)) {
          throw new Error(`${mapping.name} template is not in approved state`);
        }
        // Read-only shareable link, per guardrail 8.2 (not an editable Drive link)
        const linkResp = await callMethodWithToken(domain, 'disk.file.getExternalLink', { id: file.id }, accessToken);
        const link = linkResp.result;
        if (!link) throw new Error('Could not resolve a shareable Drive link for this file');

        await oncloud.sendTemplateMessage({
          phone,
          templateName: mapping.name,
          components: [mapping.build({ link, filename: file.filename }), oncloud.textComponent(bodyVars), oncloud.urlButtonComponent(connectToken)],
        });
        results.push({ item: file.filename || file.type, success: true });
      } catch (err) {
        results.push({ item: file.filename || file.type, success: false, error: err.message });
      }
    }

    // 3. Activity log, even on partial failure (guardrail 8.3 / FR-6)
    const summary = results.map((r) => `${r.item}: ${r.success ? 'sent' : `failed (${r.error})`}`).join('\n');
    // Guardrail 8.2: flag any deviation from the executive's profile-default CTA number.
    const ctaLine =
      defaultCtaNumber && defaultCtaNumber !== ctaNumber
        ? `CTA number: ${ctaNumber} (⚠ overridden from profile default ${defaultCtaNumber})`
        : `CTA number: ${ctaNumber}`;
    await callMethodWithToken(
      domain,
      'crm.activity.add',
      {
        fields: {
          OWNER_TYPE_ID: 1, // Lead
          OWNER_ID: leadId,
          TYPE_ID: 4, // message-type activity
          SUBJECT: `WhatsApp material sent — ${projectName || 'project'}`,
          DESCRIPTION: `${ctaLine}\n${summary}`,
          DESCRIPTION_TYPE: 1,
          RESPONSIBLE_ID: responsibleId,
          COMPLETED: 'Y',
        },
      },
      accessToken
    );

    res.json({ results });
  } catch (err) {
    if (err.rateLimited) return res.status(429).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
