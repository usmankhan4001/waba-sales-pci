# Deployment

This app deploys as two independent services: `backend/` (Express) and `frontend/` (Nuxt 3).
Both are currently hosted on Dokploy, each pointed at this repo's `backend/Dockerfile` /
`frontend/Dockerfile`.

## Critical: the backend needs a persistent volume

`backend/src/lib/fileStore.js` and `backend/src/store/*.js` persist state to plain JSON
files under `backend/data/` inside the running container:

| File | Contents | Why it must survive a redeploy |
|---|---|---|
| `tokens.json` | Bitrix24 OAuth install token + OnCloud API token | **Critical.** Losing this breaks the app's ability to call Bitrix/OnCloud at all until the app is manually reinstalled in Bitrix24. This already happened once in production. |
| `suppressedNumbers.json` | WhatsApp opt-out list (STOP/unsubscribe replies) | Losing this risks re-messaging someone who opted out - a compliance/reputational risk. |
| `analytics.jsonl` | Every send attempt + its real delivery status | Losing this silently zeroes out all historical send analytics. |
| `sendCounts.json` | Per-executive daily send counters | Low stakes - losing it just resets counters to 0 for the rest of that day. |
| `connectTokens.json`, `idempotencyKeys.json` | Short-lived tokens (24h / 15min TTL) | Safe to lose - self-expiring by design. |

**Without a mounted volume at `/app/data` in the backend container, every redeploy wipes
`tokens.json` and silently breaks the app** (Bitrix calls start failing with "Portal ...
is not installed / not authenticated", and Drive file downloads for brochure/video
templates fail even though the API layer reports "success").

### If Dokploy reads `docker-compose.yml` directly

The root `docker-compose.yml` already declares the named volume `waba-backend-data`
mounted at `/app/data` for the backend service - no further action needed.

### If Dokploy is configured via its own dashboard (not compose)

Manually configure a persistent volume mount for the backend app:
- **Container path:** `/app/data`
- **Mount type:** a named/persistent volume (not an ephemeral/container-local path)

Verify it survived a redeploy by checking `GET /health` after redeploying (see Phase 2 -
the health check verifies a Bitrix install token is present) or by checking that
`backend/data/tokens.json` still exists inside the container.

## Required environment variables

### Backend (`backend/.env`, see `backend/.env.example`)

| Variable | Purpose |
|---|---|
| `PORT` | Port the backend listens on (default 3000) |
| `BASE_URL` | This backend's own public URL (used to build the `/connect/:token` and `/media/:token` links embedded in WhatsApp templates) |
| `FRONTEND_URL` | The deployed Nuxt frontend's URL - used for CORS and to reverse-proxy `/lead-detail` through this backend so Bitrix's `placement.bind` HANDLER is same-origin |
| `BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET` | Bitrix24 Local Application credentials (Developer Resources) |
| `ONCLOUD_BASE_URL` | OnCloud API base URL |
| `ONCLOUD_TOKEN` | Static OnCloud API token (preferred - skips email/password login) |
| `ONCLOUD_EMAIL`, `ONCLOUD_PASSWORD` | Fallback OnCloud login if no static token is issued |
| `DAILY_SEND_LIMIT_PER_EXECUTIVE` | Per-executive daily WhatsApp send ceiling |
| `FALLBACK_WHATSAPP_NUMBER` | Where `/connect/:token` redirects if the token is unknown/expired |
| `DEFAULT_COVER_IMAGE_URL` | Brand cover image used when a project has no Drive file matching "cover" |
| `ONCLOUD_WEBHOOK_SECRET` | Shared secret required as `?secret=` on the OnCloud incoming-message webhook |

### Frontend (`frontend/.env`, see `frontend/.env.example`)

| Variable | Purpose |
|---|---|
| `NUXT_PUBLIC_BACKEND_URL` | The backend's public URL, used for every API call from the Bitrix tab |
| `NUXT_PUBLIC_PROJECTS_DRIVE_ROOT_FOLDER_ID` | Bitrix Drive folder ID whose subfolders are treated as "projects" |

## Redeploy runbook

1. Push to `main` (or merge a PR) - Dokploy is configured to watch this repo and redeploy on push.
2. **Confirm the backend's `/app/data` volume mount is intact** before assuming a redeploy is safe (see above) - this is the step that broke production once.
3. After the backend redeploys, check `GET /health` - it should report the data directory is writable and a Bitrix install token is present (see Phase 2 of the professionalization plan for the exact checks).
4. If `/health` reports missing Bitrix auth, reinstall/reauthorize the app in Bitrix24 (Developer Resources → the local app → reinstall) to repopulate `tokens.json`.
5. Send a real test template and confirm delivery - either via the reconciliation job's recorded `deliveryStatus` in `analytics.jsonl`, or by directly checking OnCloud's `getMessages` for the test recipient (the technique used to originally diagnose silent delivery failures in this app).
