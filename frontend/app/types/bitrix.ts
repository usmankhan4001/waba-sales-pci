// Shared types for the CRM data and send flow. Bitrix's own REST responses (crm.lead.get,
// disk.folder.getchildren, etc.) are still accessed as loosely-typed payloads at the call
// site (Bitrix doesn't publish TS types for its REST API) - these types cover the shapes
// this app actually derives and passes around internally.

export interface DriveFolder {
  id: number
  title: string
}

export interface DriveFile {
  id: number
  name: string
  type: string | null
}

/** Mirrors backend/src/config/messageTypes.js's publicMessageTypes() shape (GET /api/message-types) -
 * the single source of truth for template name + preview copy, so this app no longer hardcodes
 * a parallel copy that could drift from what's actually configured to send. */
export interface MessageTypeMeta {
  type: string
  label: string
  templateName: string
  isMedia: boolean
  previewBody: string
  previewButton: string
}

export interface PreviewItem {
  type: string
  label: string
  file?: DriveFile
}

/** Mirrors backend/src/routes/send.js's per-item result shape, plus two frontend-only
 * fields (networkError, status) so the UI can distinguish "never reached the server" from
 * a definite rejection with a reason (e.g. 429 rate-limited) - both previously collapsed
 * into the same generic "Send" failure row. */
export interface SendResultItem {
  item: string
  success: boolean
  error?: string
  type?: string
  networkError?: boolean
  status?: number
}
