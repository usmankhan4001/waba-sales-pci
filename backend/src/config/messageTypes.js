// Single source of truth for every WhatsApp message type this app can send: the approved
// Meta template name plus (for the frontend preview) display label and preview copy.
// Previously the frontend hardcoded a parallel copy of the label/preview text (PREVIEW_BODY/
// PREVIEW_BUTTON/MessageType) separately from this template-name list - the two could
// silently drift if one side changed without the other. The frontend now fetches this via
// GET /api/message-types instead of hardcoding its own copy.
//
// image/layout removed: no such templates exist yet in Meta - re-add once created & approved.
const MESSAGE_TYPES = {
  contact_now: {
    templateName: 'contact_now_sales_pci',
    label: 'Contact Now (Image)',
    isMedia: false,
    previewButton: 'Talk to Advisor',
    previewBody:
      'Hi *{{1}}*,\nThank you for your interest in *{{2}}*.\n\nWe will guide you with project details, availability, pricing, payment plans, and the next steps.\nTap below to connect directly.\n\n*{{3}}*\nSales Executive',
  },
  brochure: {
    templateName: 'send_brochure_doc_sales_pci',
    label: 'Brochure (PDF)',
    isMedia: true,
    previewButton: 'Schedule Your Site Visit',
    previewBody:
      'Hi *{{1}}*,\nAs requested, I am sharing the brochure for *{{2}}*. It includes the project overview, layouts, amenities, location details, and key highlights.\nTo Book your Site Visit Today, tap below.\n\n*{{3}}*\nSales Executive',
    buildComponent: (oncloud, file) => oncloud.documentHeaderComponent(file.link, file.filename),
  },
  video: {
    templateName: 'send_project_video_sales_pci',
    label: 'Video',
    isMedia: true,
    previewButton: 'Talk to Advisor',
    previewBody:
      'Hi *{{1}}*,\nHere is the construction update for *{{2}}*.\nIt gives you a clearer look at the project update, spaces, lifestyle, and overall experience before your visit.\nTap below to discuss the details and payment plan.\n\n*{{3}}*\nSales Executive',
    buildComponent: (oncloud, file) => oncloud.videoHeaderComponent(file.link),
  },
};

/** The shape exposed to the frontend via GET /api/message-types - no buildComponent
 * function (not serializable, and it's an internal send.js concern only). */
function publicMessageTypes() {
  return Object.entries(MESSAGE_TYPES).map(([type, cfg]) => ({
    type,
    label: cfg.label,
    templateName: cfg.templateName,
    isMedia: cfg.isMedia,
    previewBody: cfg.previewBody,
    previewButton: cfg.previewButton,
  }));
}

module.exports = { MESSAGE_TYPES, publicMessageTypes };
