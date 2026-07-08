# WABA-Driven WhatsApp Outreach for Bitrix24 CRM

**Project Plan — Native Bitrix24 Local App + OnCloud API Integration**
Version 1.1 — July 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview — The Mechanism](#3-solution-overview--the-mechanism)
4. [Architecture](#4-architecture)
5. [Functional Requirements](#5-functional-requirements)
6. [Data Model / Fields Required](#6-data-model--fields-required)
7. [Bitrix24 MCP — Role & Boundaries](#7-bitrix24-mcp--role--boundaries)
8. [Guardrails](#8-guardrails)
9. [Implementation Plan / To-Do List](#9-implementation-plan--to-do-list)
10. [Open Questions / Decisions Pending](#10-open-questions--decisions-pending)

---

## 1. Executive Summary

Sales executives currently send brochures, videos, and project material to leads directly from their personal WhatsApp Business accounts. Because Meta's spam-detection systems flag high-volume, manually-initiated outbound messaging from personal/lightly-verified numbers, executives are being banned on a near-daily basis — disrupting the sales pipeline and creating repeated onboarding overhead.

This plan defines a mechanism where all outbound promotional/informational WhatsApp messages are sent from one official, Meta-verified WhatsApp Business Account (WABA) via the Cloud API (through the OnCloud API platform), while the lead is still routed into a direct WhatsApp conversation with the correct sales executive through a dynamic "Contact Now" button. The executive's personal number never sends bulk or template messages — it only ever receives inbound, lead-initiated chats, which fall outside Meta's spam-detection risk profile for outbound business-initiated messaging.

The mechanism is delivered as a native-feeling Bitrix24 Local Application, embedded directly inside the Lead detail view, built with Bitrix24's own official UI kit (`@bitrix24/b24ui`) so it looks and behaves like a first-party Bitrix24 feature rather than an external tool.

### 1.1 Goals

- Eliminate personal-number bans by moving all bulk/template sends to the official WABA.
- Preserve a 1:1 relationship between lead and sales executive via a dynamic Contact-Now WhatsApp button.
- Let sendable content (brochure, video, PDF, images) vary per project, sourced directly from the existing organized Bitrix24 Drive structure.
- Keep the experience fully inside Bitrix24 — no separate tool for executives to learn or switch to.
- Maintain a proper, native CRM Activity record on every Lead for auditability and reporting.

### 1.2 Non-Goals (out of scope for this phase)

- Fully automated, no-human-in-the-loop sending (this phase is executive-triggered, not stage-based automation).
- Two-way chat/inbox management inside Bitrix24 (conversation continues natively in WhatsApp on the executive's device).
- Multi-portal / Marketplace distribution — this is a single-portal Local Application.

---

## 2. Problem Statement

### 2.1 Current State

- Executives send brochures/videos/PDFs to leads manually from their own personal WhatsApp Business app.
- High send volume + manual/bulk-like patterns on personal numbers trigger Meta's spam detection.
- Numbers get banned frequently, halting outreach and requiring re-verification/replacement numbers.
- Content sent varies project-to-project and currently has no single organized dispatch mechanism — it relies on the executive manually locating and attaching files.

### 2.2 Root Cause

Meta's WhatsApp risk model penalizes business-initiated outbound messaging from numbers that are not on verified, business-grade infrastructure with proper opt-in and template governance. Personal/Business App numbers used for repetitive one-to-many sending look identical to spam/abuse patterns to Meta's systems, regardless of the sender's actual intent.

### 2.3 Desired Outcome

All outbound, business-initiated content is sent from a single verified WABA number using Meta-approved templates through the Cloud API. The executive's number is only ever used for organic, lead-initiated conversation — which does not carry the same ban risk — while the lead experience still feels personal and direct.

---

## 3. Solution Overview — The Mechanism

A native Bitrix24 tab inside the Lead detail page lets the executive choose a Project, review/edit their own WhatsApp Contact-Now number, and select which file(s) to send. On Send, the system fires one or more Meta-approved WhatsApp templates from the official WABA number — first a "Contact Now" template whose button opens a direct chat with the executive's number, followed by one template per selected file (brochure / video / PDF / images), each pulling its content live from the project's Bitrix24 Drive folder. A proper Activity record is logged on the Lead automatically.

### 3.1 High-Level Flow

1. Executive opens a Lead in Bitrix24 and switches to the "Send WhatsApp Material" tab (custom placement).
2. Executive selects a Project from a dropdown (chosen fresh each time — not locked to the Lead).
3. Executive reviews the pre-filled Contact-Now number (from their own user profile field) and edits it if needed.
4. App lists the files available in that Project's Drive folder (Brochure / Video / PDF / Images); executive checks which to send.
5. Executive clicks Send.
6. Backend fetches each selected file's shareable Drive link and calls the OnCloud API's `sendtemplatemessage` endpoint: first the `contact_now` template, then one call per selected file using the matching media-type template.
7. Backend logs a native CRM Activity on the Lead via `crm.activity.add`, attributed to the executive, listing what was sent.
8. Lead receives the messages on WhatsApp; tapping "Contact Now" opens a direct chat with the executive's real number.
9. All further conversation happens organically on WhatsApp between lead and executive — outside the WABA/template system.

### 3.2 Why This Prevents Bans

- The WABA number only ever sends pre-approved, Meta-reviewed templates — the traffic pattern Meta expects from business accounts.
- The executive's number never initiates outbound messages; it only replies within lead-initiated sessions, which is normal peer-to-peer usage.
- Template governance (fixed structure, approved wording, approved media types) prevents ad-hoc content that could trigger content-based flags.

---

## 4. Architecture

Reference diagrams (delivered separately as `architecture.mermaid` and `functional-flow.mermaid`) show the full system and sequence views. Summary of components:

### 4.1 Components

| Component | Role | Notes |
|---|---|---|
| Bitrix24 Local App (frontend) | Renders the Lead-detail tab UI | Vue 3 + Nuxt, built with `@bitrix24/b24ui` for native look/feel |
| Bitrix24 Local App (backend) | Holds credentials, orchestrates sends, logs activity | Node.js, registered as a Local Application (OAuth on install) |
| Bitrix24 REST API | Source of Lead, Project, User, Drive data | Called client-side via B24 JS SDK and server-side via OAuth token |
| Bitrix24 Drive | Stores brochures/videos/PDFs/images per project | Existing organized folder structure; external/shareable links used as template media source |
| Project SPA / record | Defines which project a Lead's send relates to | Selected fresh each time by the executive, not locked to the Lead |
| OnCloud API | BSP layer wrapping Meta's WhatsApp Cloud API | Token-based auth; `sendtemplatemessage`, `getTemplates` endpoints used |
| Redirect endpoint (`/connect/:token`) | Resolves a short-lived token to the executive's WhatsApp number and 302-redirects to `wa.me` | Required because Meta rejects `wa.me` links submitted directly as template CTA buttons; button points to this endpoint instead |
| Meta WABA | Verified WhatsApp Business Account + approved templates | All business-initiated sends originate here |
| Executive's WhatsApp number | Receives inbound, lead-initiated chat only | Never used for outbound template/bulk sends |

### 4.2 Data Flow Summary

Frontend (Vue/b24ui, in-iframe) → Bitrix24 REST (read Lead/Project/Drive/User data) → POST to backend `/api/send` → Backend calls OnCloud API `sendtemplatemessage` (per template) → OnCloud/Meta delivers to lead → Backend calls Bitrix24 `crm.activity.add` → Activity visible in Lead's Activity Panel.

---

## 5. Functional Requirements

### 5.1 Bitrix24-Side Requirements

| ID | Requirement | Detail |
|---|---|---|
| FR-1 | Lead detail placement | Custom tab (`CRM_LEAD_DETAIL_TAB`) titled e.g. "Send WhatsApp Material", visible on every Lead |
| FR-2 | Project selection | Dropdown populated from Project SPA/list; freely selectable every time, no locking to Lead |
| FR-3 | Executive CTA number field | New user field (e.g. `UF_WHATSAPP_CTA`) on each user's profile; pre-fills the send form; editable per send |
| FR-4 | Drive-driven file picker | On project selection, list files found in that project's Drive folder, grouped by type (Brochure/Video/PDF/Images); checkboxes to select which to send |
| FR-5 | Send action | Single Send button; disabled until at least one file + a valid number are present |
| FR-6 | Activity logging | On successful send, create a native Activity (`crm.activity.add`) on the Lead: type, subject, files sent, executive as responsible, completed status |
| FR-7 | Repeatable sends | No restriction on sending multiple times to the same Lead, across different projects/files/dates |
| FR-8 | Send feedback | UI shows success/failure per template call (e.g. "Brochure sent ✓, Video failed ✗") using b24ui Alert/Toast components |

### 5.2 Messaging Requirements

| ID | Requirement | Detail |
|---|---|---|
| FR-9 | `contact_now` template | No/URL-button-only template; button base `https://wa.me/` + dynamic suffix = executive's number |
| FR-10 | `send_brochure_doc` template | Header: DOCUMENT; body variables for lead/project name; sent with Drive-sourced PDF link |
| FR-11 | `send_project_video` template | Header: VIDEO; same body pattern; sent with Drive-sourced video link |
| FR-12 | `send_project_image` template | Header: IMAGE; same body pattern; repeatable per selected image |
| FR-13 | Send sequencing | `contact_now` sent first, then each selected media template in order, with a short delay between sends |
| FR-14 | Template source of truth | `getTemplates` (OnCloud API) used to validate template name/status before send; avoid sending against a paused/rejected template |
| FR-15 | Connect-token generation | On every send, backend generates a short-lived token mapped to the executive's number for that send, passed as the button's dynamic URL parameter (Meta rejects `wa.me` links submitted directly as CTA buttons) |
| FR-16 | Redirect endpoint | `/connect/:token` resolves the token server-side and issues a 302 redirect to `https://wa.me/<executive_number>`; expired/unknown tokens fall back to a safe default |

---

## 6. Data Model / Fields Required

| Entity | Field | Purpose |
|---|---|---|
| User | `UF_WHATSAPP_CTA` | Executive's WhatsApp number used in the Contact-Now button |
| Lead | Standard `PHONE` field | Recipient number for all template sends |
| Lead | Standard `ASSIGNED_BY_ID` | Default responsible user; used to log Activity correctly |
| Project (SPA/list) | Name / identifier | Must match the Drive folder name exactly for reliable resolution |
| Project (SPA/list) | Drive folder reference | Folder ID or path used by `disk.folder.getchildren` |
| Drive file | External/shareable link | Passed directly into the template's `document`/`image`/`video` link parameter |
| Activity (`crm.activity.add`) | `OWNER_TYPE_ID` / `OWNER_ID` / `TYPE_ID` / `SUBJECT` / `DESCRIPTION` / `RESPONSIBLE_ID` / `COMPLETED` | Native Activity-panel record of the send |

---

## 7. Bitrix24 MCP — Role & Boundaries

Bitrix24 offers two distinct MCP (Model Context Protocol) surfaces. Both were evaluated for this project; only one is adopted, and only for build-time use — **not** inside the production send pipeline.

### 7.1 `mcp.bitrix24.com` — Official Runtime MCP Server

- Designed for **AI agents acting conversationally on behalf of a human user**, with an LLM deciding which tool to call per request, scoped to that user's permissions.
- Currently strongest on the **Tasks module**; CRM support is presently oriented toward read/query use cases (find a deal, show pipeline stages, analyze won/lost amounts) rather than guaranteed full write coverage.
- **Decision: not used for this project's core send mechanism.** The send pipeline (Lead → Project → Drive → OnCloud → Activity log) is a deterministic, no-judgment-call workflow. Routing it through an AI-agent-oriented MCP server would introduce an LLM tool-selection step into a process that must be fixed, fast, and fully auditable — adding latency, cost, and unpredictability with no offsetting benefit.
- **Possible future use (separate feature, not in this phase):** if executives later want a conversational assistant ("what's pending for this lead?") inside Bitrix24, this MCP server would be the right foundation — but it is additive, not a replacement for the deterministic backend.

### 7.2 `mcp-dev.bitrix24.com` — Documentation / Dev-Assistance MCP

- Gives an AI coding assistant **live, authoritative access to current Bitrix24 REST API method documentation** (parameters, valid values, examples) while code is being written.
- **Decision: used during the build phase of this project.** All Bitrix24 REST calls in the backend (`crm.activity.add`, `disk.file.get`, `disk.folder.getchildren`, `user.get`, `crm.lead.get`, placement registration, etc.) are to be verified against this MCP server at implementation time, rather than relying on possibly outdated assumptions — reducing integration bugs and rework.

### 7.3 Summary

| MCP Server | Used in this project? | Where |
|---|---|---|
| `mcp.bitrix24.com` (runtime agent server) | Not in this phase | N/A — flagged as a future, separate feature only |
| `mcp-dev.bitrix24.com` (dev-assistance) | Yes | During backend/frontend implementation, to verify exact REST method usage |
| Production send pipeline | Uses direct Bitrix24 REST calls (webhook/OAuth) | Deterministic, auditable, no AI-agent step in the critical path |

---

## 8. Guardrails

### 8.1 Anti-Ban / Compliance Guardrails

- Never send free-form/session content in place of an approved template for the initial outbound message — template governance is the entire point of the mechanism.
- Only use approved template names/status confirmed via `getTemplates` immediately before sending; block sends against a template not in "approved" state.
- Rate-limit sends per executive per day (configurable ceiling) to avoid burst patterns that could still affect the shared WABA's quality rating, even though it's verified.
- Monitor WABA quality rating and messaging tier regularly; alert if quality drops (early warning before Meta imposes throughput restrictions).
- Respect Meta's 24-hour session rule for any free-form fallback messaging — do not attempt free-text sends outside an open session window.
- Maintain an opt-out mechanism; any lead who replies STOP/unsubscribe should be suppressed from future template sends.

### 8.2 Data & Access Guardrails

- OnCloud API credentials and Bitrix24 OAuth tokens are stored only server-side (environment variables / secrets manager) — never exposed to the browser/iframe.
- Backend validates that the requesting user is a legitimate, authenticated Bitrix24 portal user (via B24 auth context) before accepting a send request — prevents spoofed sends.
- Executive can only send using their own CTA number by default; if the number field is editable, log any deviation from the profile default in the Activity description for auditability.
- Drive file links used in templates should be read-only/shareable links, not editable links, to prevent lead-side tampering expectations.

### 8.3 Reliability Guardrails

- If a Drive folder for a selected project has no file of a given type, the corresponding checkbox is simply not shown — never send an empty/broken template.
- Each template call is independent; a failure on one (e.g. video) must not block the others (e.g. brochure, contact_now) from sending.
- Activity logging happens even on partial failure, clearly noting which items succeeded/failed, so there is always an audit trail.
- Backend retries a failed OnCloud API call once (transient network/5xx) before surfacing a failure to the UI.

### 8.4 Content Guardrails

- Template bodies stay generic/reusable (project name and lead name as variables) — no project-specific template approvals needed, keeping Meta review overhead low.
- File names sent as WhatsApp document filenames should be clean and professional (e.g. `ProjectName_Brochure.pdf`), not raw Drive filenames.

---

## 9. Implementation Plan / To-Do List

### 9.1 Phase 1 — Meta / OnCloud Setup

- Finalize and submit 4 templates to Meta via OnCloud API: `contact_now`, `send_brochure_doc`, `send_project_video`, `send_project_image`.
- Confirm WABA quality/messaging tier and current template category assignment (Marketing).
- Obtain/confirm OnCloud API credentials and generate a service token for backend use.
- Validate the document/image/video link-based sending pattern end-to-end with a test Drive link.

### 9.2 Phase 2 — Bitrix24 Foundations

- Create `UF_WHATSAPP_CTA` custom field on the User profile; populate for all active sales executives.
- Confirm/standardize the Project SPA (or list) and align Drive folder naming to match Project identifiers exactly.
- Register the Local Application in Bitrix24 Developer Resources; capture client ID/secret.
- Define required Bitrix24 scopes: `crm` (read/write), `user` (read), `disk` (read), `placement`.

### 9.3 Phase 3 — Backend Build

- Scaffold Node.js app: OAuth install/refresh handling, token storage.
- Build `/api/send` endpoint: resolve Lead → Project → Drive links → call OnCloud `sendtemplatemessage` per selected item.
- Build `/connect/:token` redirect endpoint: token generation, storage (Redis/DB), expiry handling, and 302 redirect to the executive's `wa.me` link; log each tap for auditability.
- Implement `crm.activity.add` logging with success/failure detail.
- Implement `getTemplates` pre-check and basic rate-limiting per executive.
- Add structured logging/error handling for OnCloud and Bitrix24 API failures.
- Use `mcp-dev.bitrix24.com` throughout to verify exact REST method parameters before implementation.

### 9.4 Phase 4 — Frontend Build

- Scaffold Vue 3 / Nuxt app with `@bitrix24/b24ui` and `@bitrix24/b24jssdk`.
- Build `CRM_LEAD_DETAIL_TAB` placement registration and iframe bootstrap.
- Build Project dropdown, CTA number field (pre-filled/editable), Drive-driven file checklist, Send button.
- Wire Send action to backend `/api/send`; render per-item success/failure feedback.

### 9.5 Phase 5 — Testing & Rollout

- End-to-end test with a small group of pilot executives and test leads (real WhatsApp numbers, sandbox where possible).
- Verify Activity Panel entries render correctly and are attributed to the right executive.
- Load-test template sending sequence for a project with all four file types populated.
- Monitor WABA quality rating for the first two weeks of pilot use before full rollout.
- Train sales executives on the new tab; retire/disable the old manual-send habit via internal communication.

---

## 10. Open Questions / Decisions Pending

- Final wording and category confirmation for all four Meta templates.
- Daily/weekly send-volume ceiling per executive (guardrail threshold).
- Hosting target for the Node.js backend (VM vs. Render/Railway vs. other).
- Whether Drive "external link" in this Bitrix24 instance is fetchable without authentication (confirm before relying on link-based media sending).
- Opt-out/unsubscribe handling — where suppressed numbers are tracked (Bitrix24 field vs. OnCloud contact tag).
