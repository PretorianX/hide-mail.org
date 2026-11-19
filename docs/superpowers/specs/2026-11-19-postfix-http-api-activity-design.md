# Postfix HTTP API → Activity delivery tracing

**Status:** approved  

**Date:** 2026-11-19

## Intent

Replace the `boky/postfix:v4.4.0` compose image with `ghcr.io/pretorianx/postfix-http-api:boky-v4.4.0` and drive outbound Activity status from real Postfix delivery outcomes (delivered / deferred / bounced) via the embedded HTTP API event feed—not from “SMTP accepted.”

## Why

Activity today marks `delivered` / `accepted by postfix` at relay accept. That hides deferrals and remote rejects until (if ever) a late DSN hits bounce mailback. `postfix-http-api` already tracks the full lifecycle and exposes `GET /v1/events` for downstream sync.

## Goals

- Drop-in compose swap to our Postfix image; keep existing `POSTFIX_*`, transport_maps, DKIM mounts, bounce hairpin routing.
- Correlate each Send message to a Postfix `queue_id`.
- Poll `GET /v1/events`, map delivery events into existing `outbound:events` → `eventConsumer` (status, metrics, suppression).
- Leave Accept API response as `202` / `status: queued`; Redis Activity status starts as `queued` until a real delivery event arrives.
- Keep late inbound bounce mailback for Return-Path DSNs after the message has left the queue.

## Non-goals

- Ops UI for hold / release / flush / content inspection (API write/content scopes unused for now).
- Replacing bounce mailback or VERP format.
- Changing customer Send API contract beyond truthful Activity/metrics timing.
- Exposing the Postfix API on the public internet.

## Anti-goals

- Double-counting delivered (accept + later delivered event).
- Blindly trusting events that cannot be mapped to an outbound message record.
- Coupling the portal to call Postfix API directly.

## Constraints

- Backend reaches Postfix API only on the Docker network (`http://postfix:8025` or alias `postfix-relay`).
- Bearer token: compose configures `POSTFIXAPI_TOKEN_SHA256` (or equivalent); backend uses a matching raw token from env/secret (`POSTFIX_API_TOKEN`).
- `POSTFIXAPI_ALLOW_PLAINTEXT=true` required for cleartext HTTP on non-loopback container addresses.
- Persist Postfix spool **and** API state (`postfix-data` / `POSTFIXAPI_STATE_DIR`) across restarts so event ids and queue history survive.
- Existing `eventConsumer` field shape stays: `type`, `messageId`, `domain`, `response`, `at` (plus `streamId` when useful for deferred metrics de-dup).

## Approaches

1. **Poll `/v1/events` → XADD `outbound:events` (chosen)** — one sync path; Activity/metrics/suppression stay Redis-backed; portal unchanged.
2. On-demand `GET /v1/messages/{queue_id}` from Activity detail — rejected: list/metrics stay wrong; no deferred→delivered progression in the table.
3. Replace Redis Activity with live API queries — rejected: tenancy, retention, and portal contracts are Redis-shaped today.

## Design

### Compose

- `postfix.image` → `ghcr.io/pretorianx/postfix-http-api:boky-v4.4.0` in [`docker-compose.yml`](../../../docker-compose.yml) and [`docker-compose-dev.yml`](../../../docker-compose-dev.yml).
- Default env on the postfix service (no host port mapping for the API):
  - `POSTFIXAPI_LISTEN=0.0.0.0:8025`
  - `POSTFIXAPI_ALLOW_PLAINTEXT=true`
  - token via `POSTFIXAPI_TOKEN_SHA256` / `POSTFIXAPI_TOKEN` from host `.env` (never commit raw token)
- **8025 is compose-network only** — never publish it on the host in prod or dev; backend reaches it as `http://postfix:8025` (dev) or `http://postfix-relay:8025` (prod alias).
- Volume for API/SQLite state alongside `postfix-spool`.
- Backend env: `POSTFIX_API_BASE_URL` (defaults above) + `POSTFIX_API_TOKEN` (raw Bearer; already provisioned on host).
- Document token hash wiring in `deploy/README.md`.

### Correlation

On successful `sendMail`:

1. Parse Postfix queue id from the SMTP response (`250 … queued as <qid>` / nodemailer `response`).
2. Persist `postfixQueueId` on the outbound message record.
3. Index `outbound:postfix-qid:<queueId>` → `messageId` (TTL = message retention).

Builder call: also set nodemailer `messageId` to a stable value derived from our UUID (e.g. `<{uuid}@hm-send.hide-mail.org>`) so `GET /v1/messages?message_id=` can recover if the queue-id parse fails; primary path remains queue-id index.

If queue id cannot be parsed: leave status `queued`, log a warning, do not mark delivered. Optional recovery later via message_id search is builder detail, not required for v1 if parse is reliable.

### Send accept semantics (breaking internal assumption, not API body)

Today after accept we `updateStatus(delivered)` + `incrDelivered`. Change to:

- `createMessage` with `status: 'queued'`.
- Do **not** call `incrDelivered` at accept.
- API response body stays `{ id, status: 'queued' }`.

Real `delivered` / `deferred` / `bounced` come only from the event bridge (or bounce mailback).

### Event bridge

New backend module (e.g. `postfixApiEventBridge`) started from `server.js` beside `eventConsumer`:

1. Read cursor from Redis (`outbound:postfix-api:events-cursor`, uint64).
2. `GET /v1/events?after=<cursor>&limit=…` with Bearer token.
3. For each event with `event` in `{delivered, deferred, bounced, expired}`:
   - Resolve `messageId` via `outbound:postfix-qid:<queue_id>`.
   - Skip if unknown (other mail on the same Postfix, e.g. Forward & Forget).
   - Map: `delivered`→`delivered`, `deferred`→`deferred`, `bounced`→`bounced`, `expired`→`bounced` (response includes expiry reason when present).
   - Ignore `processed` and other non-delivery events.
   - `XADD outbound:events` with existing fields; set `streamId` to `postfix-api:<event.id>` for deferred metric de-dup.
4. Advance cursor only after successful handling of the batch (monotonic `after`).
5. Poll interval: builder default ~1–2s empty backoff (similar to eventConsumer), configurable via env.

Idempotency: consumer already overwrites status; metrics use terminal/stream gates. Re-reading the same cursor must not double-count (cursor advance + metric NX).

### Bounce mailback coexistence

- Remote 5xx at SMTP time → postfix-api `bounced` event → bridge → consumer (suppress as today).
- Late DSN to `hm-bounce.*` → existing mailback → same stream.
- If both fire for the same message: terminal metrics gates and status overwrite remain acceptable; no new merge logic.

### Portal / Activity UI

No required UI change for v1: existing status badges already show `queued` / `deferred` / `delivered` / `bounced`. Optional later: show `postfixQueueId` in the detail drawer (out of scope unless trivial while touching types).

### Tests

- Unit: queue-id parse from SMTP response strings; event→stream field mapping; skip unknown queue_ids; cursor advance.
- SendService: after accept, message is `queued` and delivered metric not incremented.
- Bridge: mocked HTTP client / fixtures from postfix-api event JSON shape.
- Compose: no live Postfix in CI; manual verify checklist in deploy README.

### Cutover, outage, cursor wipe (settled)

- **Cutover:** Send always leaves Activity at `queued` (no accept-time `delivered`). Bridge starts when `POSTFIX_API_BASE_URL` + `POSTFIX_API_TOKEN` are set; if missing, log error each poll cycle and leave messages queued (mailback still works). Deploy note: recreate postfix with the new image **before** or with the backend that ships this change (postfix is outside `hidemail-autodeploy` image pull set—manual `compose up -d postfix` required).
- **API unreachable:** Quiet retry with backoff; Activity stays `queued` until events or late DSN mailback. Emit a backend metric/log for bridge fetch failures (no process crash, no readiness fail).
- **SQLite wipe / cursor ahead of feed:** Do not auto-reset. Detect empty pages while cursor `> 0` and log + metric; ops clears `outbound:postfix-api:events-cursor` (documented in deploy README).

## Builder calls (settled)

- Image tag: `ghcr.io/pretorianx/postfix-http-api:boky-v4.4.0`.
- Primary correlation: SMTP queue id + Redis index; Message-ID set as backup identity in MIME only.
- `expired` maps to `bounced`.
- Read-only API scopes used by backend; no queue-action UI.
- API listen defaults in compose; **8025 never host-published** (compose network only).
- Host already has `POSTFIX_API_TOKEN`; compose supplies matching `POSTFIXAPI_*` hash/token for the postfix container.
