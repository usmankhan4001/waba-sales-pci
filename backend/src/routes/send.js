const express = require('express');
const config = require('../config');
const { callMethodWithToken } = require('../bitrix/client');
const oncloud = require('../oncloud/client');
const rateLimiter = require('../store/rateLimiter');
const connectTokens = require('../store/connectTokens');
const suppressionList = require('../store/suppressionList');
const analyticsLog = require('../store/analyticsLog');

const router = express.Router();
router.use(express.json());

// Real approved OnCloud template names (FR-9/10/11/12) - confirmed live via getTemplates.
// send_project_image and send_layout_plan aren't approved yet; kept here so selecting
// them fails cleanly with "template not in approved state" rather than an unknown-type error.
const CONTACT_NOW_TEMPLATE = 'contact_now_sales_pci';
const MEDIA_TEMPLATES = {
  brochure: { name: 'send_brochure_doc_sales_pci', build: (file) => oncloud.documentHeaderComponent(file.link, file.filename) },
  video: { name: 'send_project_video_sales_pci', build: (file) => oncloud.videoHeaderComponent(file.link) },
  image: { name: 'send_project_image_sales_pci', build: (file) => oncloud.imageHeaderComponent(file.link) },
  layout: { name: 'send_layout_plan_sales_pci', build: (file) => oncloud.documentHeaderComponent(file.link, file.filename) },
};

// disk.file.getExternalLink returns an HTML preview/player page (confirmed live: Content-Type
// text/html), not the raw file - Meta's servers can't fetch that as media. disk.file.get's
// DOWNLOAD_URL is the actual direct-download link with the correct binary content-type.
async function resolveFileDownloadUrl(domain, accessToken, fileId) {
  const fileResp = await callMethodWithToken(domain, 'disk.file.get', { id: fileId }, accessToken);
  return fileResp.result?.DOWNLOAD_URL;
}

/** FR-17: project's Drive cover image if one exists, else the fixed default brand cover. */
async function resolveCoverImageLink(domain, accessToken, projectDriveFolderId) {
  if (projectDriveFolderId) {
    const childrenResp = await callMethodWithToken(domain, 'disk.folder.getchildren', { id: projectDriveFolderId }, accessToken);
    const cover = (childrenResp.result || []).find((c) => c.TYPE === 'file' && /cover/i.test(c.NAME));
    if (cover) {
      const link = await resolveFileDownloadUrl(domain, accessToken, cover.ID);
      if (link) return link;
    }
  }
  return config.defaultCoverImageUrl;
}

/** One CRM Activity per item, so the activity panel shows each media message individually. */
async function logActivity(domain, accessToken, { leadId, responsibleId, subject, description, phone }) {
  await callMethodWithToken(
    domain,
    'crm.activity.add',
    {
      fields: {
        OWNER_TYPE_ID: 1, // Lead
        OWNER_ID: leadId,
        // TYPE_ID 4 is actually "E-mail" (confirmed via crm.enum.activitytype) and TYPE_ID 5
        // ("Activity") isn't a valid context for crm.activity.add - 2 ("Call") is the closest
        // built-in channel type that accepts a phone COMMUNICATIONS entry, confirmed live.
        TYPE_ID: 2,
        SUBJECT: subject,
        DESCRIPTION: description,
        DESCRIPTION_TYPE: 1,
        RESPONSIBLE_ID: responsibleId,
        COMPLETED: 'Y',
        // Required field for this activity type - without it Bitrix rejects with
        // "The field COMMUNICATIONS is not defined or invalid." (confirmed live).
        COMMUNICATIONS: phone ? [{ VALUE: phone, ENTITY_ID: leadId, ENTITY_TYPE_ID: 1 }] : undefined,
      },
    },
    accessToken
  );
}

/**
 * Body: {
 *   domain, accessToken,          // from BX24.getAuth() on the frontend
 *   leadId, projectName, projectDriveFolderId,
 *   ctaNumber, defaultCtaNumber,  // executive's WhatsApp number for the Contact Now button
 *   executiveName,                // default 3rd body variable (signature line)
 *   clientName, projectText, executiveSignature,  // optional per-send overrides of the 3 body vars
 *   includeContactNow,             // whether to send the contact_now message this round
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
    clientName,
    projectText,
    executiveSignature,
    includeContactNow = true,
    files = [],
  } = req.body;

  if (!domain || !accessToken || !leadId || !ctaNumber || (!includeContactNow && files.length === 0)) {
    return res.status(400).json({ error: 'domain, accessToken, leadId, ctaNumber and at least one item to send are required' });
  }

  try {
    // Lead + approved-templates fetch don't depend on each other - run concurrently.
    const [leadResp, approvedTemplates] = await Promise.all([
      callMethodWithToken(domain, 'crm.lead.get', { id: leadId }, accessToken),
      oncloud.getTemplates(),
    ]);
    const lead = leadResp.result;
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const phone = lead.PHONE?.[0]?.VALUE;
    if (!phone) return res.status(400).json({ error: 'Lead has no phone number' });

    const responsibleId = lead.ASSIGNED_BY_ID;

    // Guardrail 8.1: opt-out - suppressed leads are skipped entirely, but we still log why.
    if (suppressionList.isSuppressed(phone)) {
      await logActivity(domain, accessToken, {
        leadId,
        responsibleId,
        phone,
        subject: `WhatsApp material NOT sent — ${projectName || 'project'}`,
        description: `This lead's number (${phone}) has opted out of WhatsApp messaging and was skipped.`,
      });
      return res.status(200).json({ results: [{ item: 'all', success: false, error: 'Lead has opted out of WhatsApp messaging' }] });
    }

    rateLimiter.checkAndIncrement(responsibleId);

    const approvedNames = new Set(
      (Array.isArray(approvedTemplates) ? approvedTemplates : approvedTemplates?.data || [])
        .filter((t) => (t.status || t.quality || '').toString().toLowerCase() === 'approved')
        .map((t) => t.name || t.template_name)
    );

    // FR-10/11/12: every approved template's body takes 3 vars - client name, project name, executive signature.
    // Each is editable per-send from the frontend's preview screen, falling back to sensible defaults.
    const bodyVars = [
      clientName || lead.NAME || 'there',
      projectText || projectName || 'the project',
      executiveSignature || executiveName || 'Your Sales Advisor',
    ];
    // FR-15/16: one connect token per send, reused across every message in this batch.
    const connectToken = connectTokens.createToken(ctaNumber);

    // Resolve every Drive link (cover image + each selected file) up front, in parallel -
    // these are independent Bitrix lookups and don't need to wait on each other or on any send.
    const [coverImageLink, fileLinks] = await Promise.all([
      includeContactNow ? resolveCoverImageLink(domain, accessToken, projectDriveFolderId) : Promise.resolve(null),
      Promise.all(
        files.map(async (file) => {
          try {
            return { file, link: await resolveFileDownloadUrl(domain, accessToken, file.id) };
          } catch (err) {
            return { file, error: err.message };
          }
        })
      ),
    ]);

    const results = [];
    const analyticsBase = { leadId, leadName: lead.NAME, projectName, executiveName, ctaNumber, responsibleId };

    // 1. contact_now, sent first (FR-13), unless deselected on Screen 1.
    if (includeContactNow) {
      try {
        if (approvedNames.size && !approvedNames.has(CONTACT_NOW_TEMPLATE)) {
          throw new Error(`${CONTACT_NOW_TEMPLATE} template is not in approved state`);
        }
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
    }

    // 2. one template per selected file (FR-10/11/12), independent failures (guardrail 8.3)
    for (const { file, link, error } of fileLinks) {
      const mapping = MEDIA_TEMPLATES[file.type];
      if (!mapping) {
        results.push({ item: file.filename || file.type, success: false, error: `Unknown file type: ${file.type}` });
        continue;
      }
      try {
        if (approvedNames.size && !approvedNames.has(mapping.name)) {
          throw new Error(`${mapping.name} template is not in approved state`);
        }
        if (error) throw new Error(error);
        // Direct-download link (not the HTML preview page), per guardrail 8.2 - read-only, not editable.
        if (!link) throw new Error('Could not resolve a shareable Drive link for this file');

        await oncloud.sendTemplateMessage({
          phone,
          templateName: mapping.name,
          components: [mapping.build({ link, filename: file.filename }), oncloud.textComponent(bodyVars), oncloud.urlButtonComponent(connectToken)],
        });
        results.push({ item: file.filename || file.type, success: true, type: file.type });
      } catch (err) {
        results.push({ item: file.filename || file.type, success: false, error: err.message, type: file.type });
      }
    }

    // 3. Guardrail 8.2: flag any deviation from the executive's profile-default CTA number.
    const ctaLine =
      defaultCtaNumber && defaultCtaNumber !== ctaNumber
        ? `CTA number: ${ctaNumber} (⚠ overridden from profile default ${defaultCtaNumber})`
        : `CTA number: ${ctaNumber}`;

    // 4. One Activity per item + one analytics record per item, even on partial failure (guardrail 8.3 / FR-6).
    // Logging failures must never mask an otherwise-successful WhatsApp send, so each is independent,
    // and all items log in parallel since order doesn't matter here (unlike the sends above).
    await Promise.all(
      results.map(async (r) => {
        const label = r.item === 'contact_now' ? 'Contact Now' : r.item;
        try {
          await logActivity(domain, accessToken, {
            leadId,
            responsibleId,
            phone,
            subject: `WhatsApp ${label} — ${r.success ? 'sent' : 'failed'} (${projectName || 'project'})`,
            description: `${ctaLine}\n${label}: ${r.success ? 'sent ✓' : `failed ✗ (${r.error})`}`,
          });
        } catch (err) {
          console.error(`[send] logActivity failed for lead ${leadId}, item ${label}:`, err.response?.data || err.message);
        }
        try {
          analyticsLog.record({ ...analyticsBase, item: r.item, type: r.type || 'contact_now', success: r.success, error: r.error || null });
        } catch (err) {
          console.error(`[send] analyticsLog.record failed for lead ${leadId}, item ${label}:`, err.message);
        }
      })
    );

    res.json({ results });
  } catch (err) {
    console.error('[send] unhandled error:', err.response?.data || err.message);
    if (err.rateLimited) return res.status(429).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
